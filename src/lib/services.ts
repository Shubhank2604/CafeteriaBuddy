import { and, desc, eq, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { getDb, schema } from "./db";
import {
  extractMenuFromImage,
  interpretPreferences,
  matchMenuToPrefs,
} from "./agents";
import { interpretPreferencesLocal, matchMenuLocal } from "./matching";
import type {
  AiInterpretation,
  MatchPayload,
  MealType,
  PrefsInput,
  StructuredMenu,
  TempRestrictionInput,
} from "./types";
import {
  nowISO,
  parseJsonArray,
  safeJsonParse,
  todayISO,
  uniqueStrings,
} from "./utils";
import { SAMPLE_MENU } from "./sample-menu";
import { weekDatesMonFri } from "./dates";
import { isEmailConfigured, sendEmail } from "./email";
import { buildDigestEmail } from "./digest-email";
import { mergeAlwaysOnStations } from "./salad-compose";
import { extractMenuWithPython } from "./python-menu-pipeline";

/** Invalidate only one user's matches (all days) — rare full reset. */
export function invalidateUserMatches(userId: string) {
  getDb()
    .delete(schema.matchResults)
    .where(eq(schema.matchResults.userId, userId))
    .run();
}

/** Invalidate one user + one menu day (prefs change still needs all days). */
export function invalidateUserMenuMatch(userId: string, menuDayId: string) {
  getDb()
    .delete(schema.matchResults)
    .where(
      and(
        eq(schema.matchResults.userId, userId),
        eq(schema.matchResults.menuDayId, menuDayId)
      )
    )
    .run();
}

export function getUserById(id: string) {
  return getDb().select().from(schema.users).where(eq(schema.users.id, id)).get();
}

export function getPrefs(userId: string) {
  return getDb()
    .select()
    .from(schema.preferenceProfiles)
    .where(eq(schema.preferenceProfiles.userId, userId))
    .get();
}

export function prefsRowToInput(row: typeof schema.preferenceProfiles.$inferSelect): PrefsInput {
  return {
    dietType: (row.dietType as PrefsInput["dietType"]) || "non_veg",
    hardAvoids: parseJsonArray(row.hardAvoidsJson),
    softDislikes: parseJsonArray(row.softDislikesJson),
    likes: parseJsonArray(row.likesJson),
    goals: parseJsonArray(row.goalsJson),
    allergies: parseJsonArray(row.allergiesJson),
    freeformNotes: row.freeformNotes || "",
  };
}

export function serializePrefsForClient(userId: string) {
  const row = getPrefs(userId);
  if (!row) return null;
  const temps = getDb()
    .select()
    .from(schema.temporaryRestrictions)
    .where(eq(schema.temporaryRestrictions.userId, userId))
    .all()
    .map((t) => ({
      id: t.id,
      label: t.label,
      avoidTags: parseJsonArray(t.avoidTagsJson),
      startsOn: t.startsOn,
      endsOn: t.endsOn,
      reason: t.reason,
    }));

  return {
    dietType: row.dietType,
    hardAvoids: parseJsonArray(row.hardAvoidsJson),
    softDislikes: parseJsonArray(row.softDislikesJson),
    likes: parseJsonArray(row.likesJson),
    goals: parseJsonArray(row.goalsJson),
    allergies: parseJsonArray(row.allergiesJson),
    freeformNotes: row.freeformNotes,
    userFacingSummary: row.userFacingSummary,
    aiInterpretation: safeJsonParse<AiInterpretation | null>(row.aiInterpretationJson, null),
    emailEnabled: row.emailEnabled,
    emailTimeLocal: row.emailTimeLocal,
    timezone: row.timezone,
    onboardingCompleted: row.onboardingCompleted,
    temporaryRestrictions: temps,
    updatedAt: row.updatedAt,
  };
}

export async function savePreferences(
  userId: string,
  body: Partial<PrefsInput> & {
    emailEnabled?: boolean;
    emailTimeLocal?: string;
    timezone?: string;
    onboardingCompleted?: boolean;
    runAi?: boolean;
  }
) {
  const db = getDb();
  const existing = getPrefs(userId);
  if (!existing) throw new Error("Preference profile missing");

  const next: PrefsInput = {
    dietType: (body.dietType as PrefsInput["dietType"]) || (existing.dietType as PrefsInput["dietType"]),
    hardAvoids: body.hardAvoids ?? parseJsonArray(existing.hardAvoidsJson),
    softDislikes: body.softDislikes ?? parseJsonArray(existing.softDislikesJson),
    likes: body.likes ?? parseJsonArray(existing.likesJson),
    goals: body.goals ?? parseJsonArray(existing.goalsJson),
    allergies: body.allergies ?? parseJsonArray(existing.allergiesJson),
    freeformNotes:
      body.freeformNotes !== undefined ? body.freeformNotes : existing.freeformNotes,
  };

  let interpretation: AiInterpretation | null = safeJsonParse(
    existing.aiInterpretationJson,
    null
  );
  let summary = existing.userFacingSummary;

  // AI expand prefs (beans, lactose, etc.) with local fallback inside interpretPreferences.
  // Skip AI only for pure settings toggles (email time) via runAi:false.
  if (body.runAi === false) {
    // Keep existing interpretation; only email/settings fields update below
  } else {
    try {
      interpretation = await interpretPreferences(next);
    } catch (err) {
      // Should not throw (agents falls back locally); belt-and-suspenders
      console.error("[savePreferences] interpret failed", err);
      interpretation = interpretPreferencesLocal(next);
    }
    next.hardAvoids = uniqueStrings([
      ...next.hardAvoids,
      ...interpretation.hard_avoids,
    ]);
    next.allergies = uniqueStrings([
      ...next.allergies,
      ...interpretation.allergies,
    ]);
    next.softDislikes = uniqueStrings([
      ...next.softDislikes,
      ...interpretation.soft_dislikes,
    ]);
    next.likes = uniqueStrings([...next.likes, ...interpretation.likes]);
    next.goals = uniqueStrings([...next.goals, ...interpretation.goals]);
    if (interpretation.diet_type) {
      next.dietType = interpretation.diet_type as PrefsInput["dietType"];
    }
    summary = interpretation.user_facing_summary;
  }

  db.update(schema.preferenceProfiles)
    .set({
      dietType: next.dietType,
      hardAvoidsJson: JSON.stringify(next.hardAvoids),
      softDislikesJson: JSON.stringify(next.softDislikes),
      likesJson: JSON.stringify(next.likes),
      goalsJson: JSON.stringify(next.goals),
      allergiesJson: JSON.stringify(next.allergies),
      freeformNotes: next.freeformNotes,
      aiInterpretationJson: interpretation ? JSON.stringify(interpretation) : existing.aiInterpretationJson,
      userFacingSummary: summary,
      emailEnabled:
        body.emailEnabled !== undefined ? body.emailEnabled : existing.emailEnabled,
      emailTimeLocal: body.emailTimeLocal || existing.emailTimeLocal,
      timezone: body.timezone || existing.timezone,
      onboardingCompleted:
        body.onboardingCompleted !== undefined
          ? body.onboardingCompleted
          : existing.onboardingCompleted,
      updatedAt: nowISO(),
    })
    .where(eq(schema.preferenceProfiles.userId, userId))
    .run();

  // Prefs change invalidates all personal match caches for this user
  if (body.runAi !== false) {
    invalidateUserMatches(userId);
  }

  return serializePrefsForClient(userId);
}

export function getTempRestrictions(userId: string): TempRestrictionInput[] {
  return getDb()
    .select()
    .from(schema.temporaryRestrictions)
    .where(eq(schema.temporaryRestrictions.userId, userId))
    .all()
    .map((t) => ({
      label: t.label,
      avoidTags: parseJsonArray(t.avoidTagsJson),
      startsOn: t.startsOn,
      endsOn: t.endsOn,
      reason: t.reason,
    }));
}

export function addTempRestriction(
  userId: string,
  data: TempRestrictionInput & { id?: string }
) {
  const id = data.id || randomUUID();
  getDb()
    .insert(schema.temporaryRestrictions)
    .values({
      id,
      userId,
      label: data.label,
      avoidTagsJson: JSON.stringify(uniqueStrings(data.avoidTags)),
      startsOn: data.startsOn,
      endsOn: data.endsOn,
      reason: data.reason || "",
    })
    .run();
  invalidateUserMatches(userId);
  return id;
}

export function deleteTempRestriction(userId: string, id: string) {
  getDb()
    .delete(schema.temporaryRestrictions)
    .where(
      and(
        eq(schema.temporaryRestrictions.id, id),
        eq(schema.temporaryRestrictions.userId, userId)
      )
    )
    .run();
  invalidateUserMatches(userId);
}

export function upsertDishFeedback(input: {
  userId: string;
  menuDayId: string;
  dishName: string;
  vote: "up" | "down" | "ate";
}) {
  const db = getDb();
  const existing = db
    .select()
    .from(schema.dishFeedback)
    .where(
      and(
        eq(schema.dishFeedback.userId, input.userId),
        eq(schema.dishFeedback.menuDayId, input.menuDayId),
        eq(schema.dishFeedback.dishName, input.dishName)
      )
    )
    .get();

  if (existing) {
    if (existing.vote === input.vote) {
      // toggle off
      db.delete(schema.dishFeedback)
        .where(eq(schema.dishFeedback.id, existing.id))
        .run();
      return { vote: null as string | null };
    }
    db.update(schema.dishFeedback)
      .set({ vote: input.vote, createdAt: nowISO() })
      .where(eq(schema.dishFeedback.id, existing.id))
      .run();
    return { vote: input.vote };
  }

  db.insert(schema.dishFeedback)
    .values({
      id: randomUUID(),
      userId: input.userId,
      menuDayId: input.menuDayId,
      dishName: input.dishName,
      vote: input.vote,
      createdAt: nowISO(),
    })
    .run();
  return { vote: input.vote };
}

export function getFeedbackMap(userId: string, menuDayId: string) {
  const rows = getDb()
    .select()
    .from(schema.dishFeedback)
    .where(
      and(
        eq(schema.dishFeedback.userId, userId),
        eq(schema.dishFeedback.menuDayId, menuDayId)
      )
    )
    .all();
  const map: Record<string, string> = {};
  for (const r of rows) map[r.dishName] = r.vote;
  return map;
}

/** Instant local match (no AI) for two-phase UI. */
export function matchBaselineOnly(
  userId: string,
  preferredDate: string
): {
  menu: NonNullable<ReturnType<typeof getActiveMenu>>;
  match: MatchPayload & { source: "baseline"; phase: "baseline" };
} | null {
  const menuPack = getActiveMenu(preferredDate);
  if (!menuPack) return null;
  const prefsRow = getPrefs(userId);
  if (!prefsRow) return null;
  const prefs = prefsRowToInput(prefsRow);
  const temps = getTempRestrictions(userId);
  const baseline = matchMenuLocal(menuPack.menu, prefs, temps);
  return {
    menu: menuPack,
    match: {
      ...baseline,
      source: "baseline",
      phase: "baseline",
      aiStatus: { ok: false, detail: "pending" },
    },
  };
}

export function weekFitScores(userId: string, anchorDate: string) {
  const prefsRow = getPrefs(userId);
  if (!prefsRow) return [];
  const prefs = prefsRowToInput(prefsRow);
  const temps = getTempRestrictions(userId);
  const days = weekDatesMonFri(anchorDate);

  return days.map((date) => {
    const pack = getMenuForDate(date);
    if (!pack) {
      return { date, score: null as number | null, hasMenu: false, rec: 0, total: 0 };
    }
    // Prefer cached match score
    const cached = getDb()
      .select()
      .from(schema.matchResults)
      .where(
        and(
          eq(schema.matchResults.userId, userId),
          eq(schema.matchResults.menuDayId, pack.id)
        )
      )
      .get();
    if (cached) {
      return {
        date,
        score: cached.score,
        hasMenu: true,
        rec: 0,
        total: 0,
        verdict: cached.verdict,
      };
    }
    const local = matchMenuLocal(pack.menu, prefs, temps);
    return {
      date,
      score: local.score,
      hasMenu: true,
      rec: local.items.filter((i) => i.decision === "recommended").length,
      total: local.items.length,
      verdict: local.verdict,
    };
  });
}

export function listMenuDates() {
  return getDb()
    .select({ date: schema.menuDays.date })
    .from(schema.menuDays)
    .orderBy(desc(schema.menuDays.date))
    .all()
    .map((r) => r.date);
}

export function updateMenuItemRow(input: {
  menuDayId: string;
  itemId: string;
  name?: string;
  tags?: string[];
  meal?: string;
  station?: string;
  delete?: boolean;
}) {
  const db = getDb();
  if (input.delete) {
    db.delete(schema.menuItems)
      .where(
        and(
          eq(schema.menuItems.id, input.itemId),
          eq(schema.menuItems.menuDayId, input.menuDayId)
        )
      )
      .run();
  } else {
    const existing = db
      .select()
      .from(schema.menuItems)
      .where(eq(schema.menuItems.id, input.itemId))
      .get();
    if (!existing) throw new Error("Item not found");
    db.update(schema.menuItems)
      .set({
        name: input.name ?? existing.name,
        tagsJson:
          input.tags !== undefined
            ? JSON.stringify(uniqueStrings(input.tags))
            : existing.tagsJson,
        meal: input.meal ?? existing.meal,
        station: input.station ?? existing.station,
      })
      .where(eq(schema.menuItems.id, input.itemId))
      .run();
  }
  // Invalidate all matches for this menu day
  db.delete(schema.matchResults)
    .where(eq(schema.matchResults.menuDayId, input.menuDayId))
    .run();
  return getMenuForDate(
    db
      .select()
      .from(schema.menuDays)
      .where(eq(schema.menuDays.id, input.menuDayId))
      .get()!.date
  );
}

export async function updateAccount(
  userId: string,
  body: { name?: string; currentPassword?: string; newPassword?: string }
) {
  const user = getUserById(userId);
  if (!user) throw new Error("User not found");
  const db = getDb();
  if (body.name?.trim()) {
    db.update(schema.users)
      .set({ name: body.name.trim() })
      .where(eq(schema.users.id, userId))
      .run();
  }
  if (body.newPassword) {
    if (!body.currentPassword) throw new Error("Current password required");
    const ok = await bcrypt.compare(body.currentPassword, user.passwordHash);
    if (!ok) throw new Error("Current password is wrong");
    const hash = await bcrypt.hash(body.newPassword, 10);
    db.update(schema.users)
      .set({ passwordHash: hash })
      .where(eq(schema.users.id, userId))
      .run();
  }
  return getUserById(userId);
}

/**
 * Run digests for users whose local time matches emailTimeLocal (±1 min window).
 * Called by the lightweight in-process scheduler.
 */
export async function runDueDigests(now = new Date()) {
  const db = getDb();
  const opted = db
    .select()
    .from(schema.preferenceProfiles)
    .where(eq(schema.preferenceProfiles.emailEnabled, true))
    .all();

  let sent = 0;
  for (const p of opted) {
    const tz = p.timezone || "UTC";
    const localTime = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(now);
    const target = (p.emailTimeLocal || "07:00").slice(0, 5);
    if (localTime !== target) continue;

    const localDate = todayISO(now, tz);
    try {
      const r = await runDigestsForUser(p.userId, localDate);
      if (r) sent += 1;
    } catch (e) {
      console.error("[digest due]", p.userId, e);
    }
  }
  return { sent };
}

type DigestPayload = {
  date: string;
  verdict: string;
  headline: string;
  summary: string;
  score: number;
  recommended: { name: string; reason?: string }[];
  avoid: { name: string; reason?: string }[];
};

function buildDigestPayload(
  date: string,
  match: {
    verdict: string;
    headline: string;
    summary: string;
    score: number;
    payload: MatchPayload;
  }
): DigestPayload {
  return {
    date,
    verdict: match.verdict,
    headline: match.headline,
    summary: match.summary,
    score: match.score,
    recommended: match.payload.items
      .filter((i) => i.decision === "recommended")
      .slice(0, 8)
      .map((i) => ({ name: i.name, reason: i.reason })),
    avoid: match.payload.items
      .filter((i) => i.decision === "avoid")
      .slice(0, 8)
      .map((i) => ({ name: i.name, reason: i.reason })),
  };
}

async function deliverDigestEmail(
  userId: string,
  digestPayload: DigestPayload
): Promise<"email" | "email_failed" | "in_app"> {
  if (!isEmailConfigured()) return "in_app";
  const user = getUserById(userId);
  if (!user?.email) return "in_app";

  const mail = buildDigestEmail({
    userName: user.name,
    payload: digestPayload,
  });
  const sent = await sendEmail({
    to: user.email,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });
  if (sent.ok) {
    console.log(`[digest] email ok → ${user.email} (${digestPayload.date})`);
    return "email";
  }
  console.error(`[digest] email failed → ${user.email}:`, sent.error);
  return "email_failed";
}

async function runDigestsForUser(userId: string, date: string) {
  const menuPack = getActiveMenu(date);
  if (!menuPack) return false;
  const { match } = await getOrCreateMatch(userId, date);
  if (!match) return false;
  // avoid duplicate digests same day
  const existing = getDb()
    .select()
    .from(schema.digestLogs)
    .where(
      and(
        eq(schema.digestLogs.userId, userId),
        eq(schema.digestLogs.menuDayId, menuPack.id)
      )
    )
    .get();
  if (existing) return false;

  const digestPayload = buildDigestPayload(menuPack.date, match);
  const channel = await deliverDigestEmail(userId, digestPayload);

  getDb()
    .insert(schema.digestLogs)
    .values({
      id: randomUUID(),
      userId,
      menuDayId: menuPack.id,
      channel,
      payloadJson: JSON.stringify(digestPayload),
      createdAt: nowISO(),
    })
    .run();
  return true;
}

/**
 * Force-build + email (or in-app log) a digest for one user.
 * Used by Settings “Send test email”. Bypasses same-day dedup for testing
 * by reusing today’s payload but always attempting email when configured.
 */
export async function sendTestDigest(userId: string, date?: string) {
  const prefs = getPrefs(userId);
  const tz = prefs?.timezone || "UTC";
  const day = date || todayISO(new Date(), tz);
  const menuPack = getActiveMenu(day);
  if (!menuPack) {
    return { ok: false as const, error: "No menu for today. Post a menu first." };
  }
  const { match } = await getOrCreateMatch(userId, day);
  if (!match) {
    return { ok: false as const, error: "Could not match menu to your preferences." };
  }

  const digestPayload = buildDigestPayload(menuPack.date, match);
  const channel = await deliverDigestEmail(userId, digestPayload);

  getDb()
    .insert(schema.digestLogs)
    .values({
      id: randomUUID(),
      userId,
      menuDayId: menuPack.id,
      channel: channel === "email" ? "email" : channel,
      payloadJson: JSON.stringify({ ...digestPayload, test: true }),
      createdAt: nowISO(),
    })
    .run();

  if (channel === "email") {
    const user = getUserById(userId);
    return {
      ok: true as const,
      channel,
      to: user?.email,
      message: `Email sent to ${user?.email}`,
    };
  }
  if (channel === "email_failed") {
    return {
      ok: false as const,
      channel,
      error: "Email send failed. Check SMTP settings and server logs.",
    };
  }
  return {
    ok: true as const,
    channel,
    message:
      "Digest saved in-app only (SMTP not configured). Set SMTP_* in .env for email.",
  };
}

function flattenMenuToRows(menuDayId: string, menu: StructuredMenu) {
  const rows: (typeof schema.menuItems.$inferInsert)[] = [];
  for (const meal of menu.meals) {
    for (const station of meal.stations) {
      for (const item of station.items) {
        rows.push({
          id: randomUUID(),
          menuDayId,
          meal: meal.type,
          station: station.name,
          name: item.name,
          tagsJson: JSON.stringify(item.tags || []),
        });
      }
    }
  }
  return rows;
}

export async function saveMenuDay(options: {
  date: string;
  menu: StructuredMenu;
  sourceImagePath?: string | null;
  createdBy?: string | null;
  extractionSource?: string;
  replaceMealTypes?: MealType[];
}) {
  const db = getDb();
  const existing = db
    .select()
    .from(schema.menuDays)
    .where(eq(schema.menuDays.date, options.date))
    .get();

  const menu: StructuredMenu = {
    ...options.menu,
    date: options.date,
  };

  const payload = {
    ...menu,
    _meta: { extractionSource: options.extractionSource || "ai" },
  };

  if (existing) {
    const replaceMealTypes = options.replaceMealTypes?.filter(Boolean) || [];
    if (replaceMealTypes.length) {
      db.delete(schema.menuItems)
        .where(
          and(
            eq(schema.menuItems.menuDayId, existing.id),
            inArray(schema.menuItems.meal, replaceMealTypes)
          )
        )
        .run();
    } else {
      db.delete(schema.menuItems)
        .where(eq(schema.menuItems.menuDayId, existing.id))
        .run();
    }
    db.delete(schema.matchResults).where(eq(schema.matchResults.menuDayId, existing.id)).run();
    db.update(schema.menuDays)
      .set({
        sourceImagePath: options.sourceImagePath ?? existing.sourceImagePath,
        rawModelJson: JSON.stringify(payload),
        createdBy: options.createdBy ?? existing.createdBy,
        createdAt: nowISO(),
      })
      .where(eq(schema.menuDays.id, existing.id))
      .run();
    const rows = flattenMenuToRows(existing.id, menu);
    for (const row of rows) db.insert(schema.menuItems).values(row).run();
    return existing.id;
  }

  const id = randomUUID();
  db.insert(schema.menuDays)
    .values({
      id,
      date: options.date,
      sourceImagePath: options.sourceImagePath || null,
      rawModelJson: JSON.stringify(payload),
      createdBy: options.createdBy || null,
      createdAt: nowISO(),
    })
    .run();
  const rows = flattenMenuToRows(id, menu);
  for (const row of rows) db.insert(schema.menuItems).values(row).run();
  return id;
}

export async function processMenuImage(options: {
  imagePath: string;
  date?: string;
  createdBy?: string;
  useFixtureOnly?: boolean;
  meal?: Exclude<MealType, "other">;
}) {
  if (options.useFixtureOnly) {
    const date = options.date || SAMPLE_MENU.date || todayISO();
    const id = await saveMenuDay({
      date,
      menu: { ...SAMPLE_MENU, date },
      sourceImagePath: options.imagePath,
      createdBy: options.createdBy,
      extractionSource: "fixture",
    });
    return { menuDayId: id, source: "fixture" as const, menu: { ...SAMPLE_MENU, date } };
  }

  if (options.meal) {
    const date = options.date || todayISO();
    const result = await extractMenuWithPython({
      imagePath: options.imagePath,
      date,
      meal: options.meal,
    });
    const id = await saveMenuDay({
      date,
      menu: result.menu,
      sourceImagePath: options.imagePath,
      createdBy: options.createdBy,
      extractionSource: result.source,
      replaceMealTypes: [options.meal],
    });
    return {
      menuDayId: id,
      source: result.source,
      menu: result.menu,
      validation: result.validation,
      duplicate: result.duplicate,
      ingestionId: result.ingestionId,
    };
  }

  const { menu, source, model } = await extractMenuFromImage(options.imagePath);
  const date = options.date || menu.date || todayISO();
  const id = await saveMenuDay({
    date,
    menu: { ...menu, date },
    sourceImagePath: options.imagePath,
    createdBy: options.createdBy,
    extractionSource: source === "ai" ? `ai:${model || "unknown"}` : "fixture",
  });
  return { menuDayId: id, source, model, menu: { ...menu, date } };
}

/**
 * Active menu for employees:
 * 1) Exact office date if posted
 * 2) Else most recently posted menu (admin often posts on a nearby date /
 *    timezone boundary can leave "today" empty while a menu exists)
 */
export function getActiveMenu(preferredDate = todayISO()) {
  const exact = getMenuForDate(preferredDate);
  if (exact) {
    return {
      ...exact,
      requestedDate: preferredDate,
      isFallback: false as const,
    };
  }

  const latest = getDb()
    .select()
    .from(schema.menuDays)
    .orderBy(desc(schema.menuDays.date))
    .limit(1)
    .get();
  if (!latest) return null;

  const pack = getMenuForDate(latest.date);
  if (!pack) return null;
  return {
    ...pack,
    requestedDate: preferredDate,
    isFallback: true as const,
  };
}

export function getMenuForDate(date: string) {
  const db = getDb();
  const day = db.select().from(schema.menuDays).where(eq(schema.menuDays.date, date)).get();
  if (!day) return null;
  const items = db
    .select()
    .from(schema.menuItems)
    .where(eq(schema.menuItems.menuDayId, day.id))
    .all();

  const raw = safeJsonParse<StructuredMenu & { _meta?: unknown }>(day.rawModelJson, {
    date: day.date,
    meals: [],
  });

  // Rebuild structured from items for consistency (include row ids for admin edit)
  const mealMap = new Map<
    string,
    Map<string, { id: string; name: string; tags: string[] }[]>
  >();
  for (const it of items) {
    if (!mealMap.has(it.meal)) mealMap.set(it.meal, new Map());
    const stations = mealMap.get(it.meal)!;
    if (!stations.has(it.station)) stations.set(it.station, []);
    stations.get(it.station)!.push({
      id: it.id,
      name: it.name,
      tags: parseJsonArray(it.tagsJson),
    });
  }

  const mealOrder = ["breakfast", "lunch", "other"];
  const meals = Array.from(mealMap.entries())
    .map(([type, stations]) => ({
      type: type as StructuredMenu["meals"][0]["type"],
      stations: Array.from(stations.entries()).map(([name, its]) => ({
        name,
        items: its,
      })),
    }))
    .sort((a, b) => {
      const ai = mealOrder.indexOf(String(a.type).toLowerCase());
      const bi = mealOrder.indexOf(String(b.type).toLowerCase());
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

  // Always-on Salad Compose (not from photo) — available for match + employee menu
  const structured = mergeAlwaysOnStations({
    date: day.date,
    meals,
  } as StructuredMenu);

  return {
    id: day.id,
    date: day.date,
    sourceImagePath: day.sourceImagePath,
    createdAt: day.createdAt,
    meta: (raw as { _meta?: unknown })._meta,
    menu: structured,
    flatItems: items.map((it) => ({
      id: it.id,
      meal: it.meal,
      station: it.station,
      name: it.name,
      tags: parseJsonArray(it.tagsJson),
    })),
  };
}

export async function getOrCreateMatch(userId: string, date = todayISO()) {
  // Always resolve via active menu (exact day, else latest posted)
  const preferredDate = date || todayISO();
  const menuPack = getActiveMenu(preferredDate);
  if (!menuPack) return { menu: null, match: null, preferredDate };

  const db = getDb();
  const existing = db
    .select()
    .from(schema.matchResults)
    .where(
      and(
        eq(schema.matchResults.userId, userId),
        eq(schema.matchResults.menuDayId, menuPack.id)
      )
    )
    .get();

  if (existing) {
    const payload = safeJsonParse<MatchPayload>(existing.payloadJson, {
      verdict: existing.verdict as MatchPayload["verdict"],
      headline: existing.headline,
      summary: existing.summary,
      score: existing.score,
      items: [],
      combos: [],
    });
    // Recompute if cache predates always-on Salad Compose
    const hasSalad = (payload.items || []).some(
      (i) => i.station === "Salad Compose"
    );
    if (hasSalad) {
      const cleanSummary = scrubLegacyAiErrorSummary(
        existing.summary || payload.summary
      );
      return {
        menu: menuPack,
        preferredDate,
        match: {
          id: existing.id,
          verdict: existing.verdict,
          score: existing.score,
          headline: existing.headline,
          summary: cleanSummary,
          payload: { ...payload, summary: cleanSummary },
          source: payload.source || "baseline",
          aiStatus: payload.aiStatus,
          createdAt: existing.createdAt,
          mode:
            payload.source === "baseline" && payload.aiStatus?.ok === false
              ? "error"
              : "gemini",
        },
      };
    }
  }

  const prefsRow = getPrefs(userId);
  if (!prefsRow) throw new Error("Preferences missing");
  const prefs = prefsRowToInput(prefsRow);
  const temps = getTempRestrictions(userId);
  const payload = await matchMenuToPrefs({
    menu: menuPack.menu,
    prefs,
    tempRestrictions: temps,
  });

  const id = randomUUID();
  const { mode, ...matchPayload } = payload;
  // Ensure clean summary never stores parse stack traces
  matchPayload.summary = scrubLegacyAiErrorSummary(matchPayload.summary);

  // Upsert-ish: avoid duplicate rows for same user+menu day
  db.delete(schema.matchResults)
    .where(
      and(
        eq(schema.matchResults.userId, userId),
        eq(schema.matchResults.menuDayId, menuPack.id)
      )
    )
    .run();

  db.insert(schema.matchResults)
    .values({
      id,
      userId,
      menuDayId: menuPack.id,
      verdict: matchPayload.verdict,
      score: matchPayload.score,
      headline: matchPayload.headline,
      summary: matchPayload.summary,
      payloadJson: JSON.stringify(matchPayload),
      createdAt: nowISO(),
    })
    .run();

  return {
    menu: menuPack,
    preferredDate,
    match: {
      id,
      verdict: matchPayload.verdict,
      score: matchPayload.score,
      headline: matchPayload.headline,
      summary: matchPayload.summary,
      payload: matchPayload,
      source: matchPayload.source || "baseline",
      aiStatus: matchPayload.aiStatus,
      createdAt: nowISO(),
      mode,
    },
  };
}

/** Remove old " (AI busy or errored: ...)" tails from cached summaries. */
function scrubLegacyAiErrorSummary(summary: string): string {
  if (!summary) return summary;
  return summary
    .replace(/\s*\(AI busy or errored:[\s\S]*$/i, "")
    .replace(/\s*\(AI returned invalid JSON[\s\S]*$/i, "")
    .trim();
}

export async function runDigests(date = todayISO()) {
  const db = getDb();
  const menuPack = getMenuForDate(date);
  if (!menuPack) return { sent: 0, message: "No menu for date" };

  const optedIn = db
    .select()
    .from(schema.preferenceProfiles)
    .where(eq(schema.preferenceProfiles.emailEnabled, true))
    .all();

  let sent = 0;
  let emailed = 0;
  for (const p of optedIn) {
    const { match } = await getOrCreateMatch(p.userId, date);
    if (!match) continue;
    const digestPayload = buildDigestPayload(date, match);
    const channel = await deliverDigestEmail(p.userId, digestPayload);
    if (channel === "email") emailed += 1;
    db.insert(schema.digestLogs)
      .values({
        id: randomUUID(),
        userId: p.userId,
        menuDayId: menuPack.id,
        channel,
        payloadJson: JSON.stringify(digestPayload),
        createdAt: nowISO(),
      })
      .run();
    console.log(
      `[digest] user=${p.userId} channel=${channel} verdict=${match.verdict} headline=${match.headline}`
    );
    sent += 1;
  }
  return {
    sent,
    emailed,
    message: `Created ${sent} digests (${emailed} emailed)`,
  };
}

export function latestDigest(userId: string) {
  return getDb()
    .select()
    .from(schema.digestLogs)
    .where(eq(schema.digestLogs.userId, userId))
    .orderBy(desc(schema.digestLogs.createdAt))
    .get();
}
