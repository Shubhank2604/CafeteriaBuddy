import fs from "fs";
import path from "path";
import {
  extractJson,
  friendlyGeminiError,
  geminiTextJson,
  geminiVision,
  hasGeminiKey,
} from "./gemini-ai";
import { interpretPreferencesLocal, matchMenuLocal } from "./matching";
import { SAMPLE_MENU } from "./sample-menu";
import type {
  AiInterpretation,
  ItemDecision,
  MatchPayload,
  MatchSource,
  PrefsInput,
  StructuredMenu,
  TempRestrictionInput,
  Verdict,
} from "./types";
import { uniqueStrings } from "./utils";

export type AiMode = "gemini" | "error";

function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return uniqueStrings(tags.map(String));
}

/** Normalize dish names so AI typos still match menu rows. */
function normName(name: string) {
  return name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decisionOf(v: unknown): ItemDecision {
  const s = String(v || "").toLowerCase();
  if (s === "recommended" || s === "good" || s === "eat" || s === "yes") {
    return "recommended";
  }
  if (s === "avoid" || s === "skip" || s === "no" || s === "bad") return "avoid";
  if (s === "caution" || s === "maybe" || s === "ok") return "caution";
  return "caution";
}

function scoreFromItems(items: { decision: ItemDecision }[]) {
  const total = items.length || 1;
  const rec = items.filter((i) => i.decision === "recommended").length;
  const avoid = items.filter((i) => i.decision === "avoid").length;
  const ratio = rec / total;
  const avoidRatio = avoid / total;
  let score = Math.round(ratio * 100 - avoidRatio * 10);
  score = Math.max(0, Math.min(100, score));
  let verdict: MatchPayload["verdict"] = "mostly_fine";
  if (ratio >= 0.4) verdict = "great";
  else if (ratio >= 0.2) verdict = "mostly_fine";
  else if (ratio >= 0.08) verdict = "thin_options";
  else verdict = "not_your_day";
  return { score, verdict, rec };
}

/** Fallback 3-slot combos if baseline combos missing (mirrors matching.ts). */
function buildCombos(items: MatchPayload["items"]): MatchPayload["combos"] {
  const slots: {
    title: string;
    filter: (i: MatchPayload["items"][number]) => boolean;
    max: number;
    empty: string;
  }[] = [
    {
      title: "Breakfast idea",
      filter: (i) =>
        i.meal === "breakfast" &&
        i.decision === "recommended" &&
        i.station !== "Salad Compose",
      max: 3,
      empty: "Thin breakfast options for you today",
    },
    {
      title: "Lunch idea",
      filter: (i) =>
        i.meal === "lunch" &&
        i.decision === "recommended" &&
        i.station !== "Salad Compose",
      max: 3,
      empty: "Thin lunch options for you today",
    },
    {
      title: "Salad bowl",
      filter: (i) =>
        i.station === "Salad Compose" && i.decision === "recommended",
      max: 3,
      empty: "Few salad toppings fit you today — check the bar",
    },
  ];

  return slots.map(({ title, filter, max, empty }) => {
    const pool = items.filter(filter);
    if (!pool.length) {
      return { title, items: [], itemReasons: [], why: empty };
    }
    const picked = pool.slice(0, max);
    return {
      title,
      items: picked.map((p) => p.name),
      itemReasons: picked.map((p) => p.reason || "Fits your prefs"),
      why: "Built from dishes marked Good for you",
    };
  });
}

function normalizeMenu(raw: StructuredMenu): StructuredMenu {
  return {
    date: raw.date || new Date().toISOString().slice(0, 10),
    meals: (raw.meals || []).map((meal) => ({
      type: (meal.type as StructuredMenu["meals"][0]["type"]) || "other",
      stations: (meal.stations || []).map((station) => ({
        name: station.name || "Station",
        items: (station.items || []).map((item) => ({
          name: item.name,
          tags: normalizeTags(item.tags),
          notes: item.notes ?? null,
        })),
      })),
    })),
  };
}

export function fileToDataUrl(filePath: string) {
  const abs = path.isAbsolute(filePath)
    ? filePath
    : path.join(/* turbopackIgnore: true */ process.cwd(), filePath);
  const buf = fs.readFileSync(abs);
  const ext = path.extname(abs).toLowerCase();
  const mime =
    ext === ".png"
      ? "image/png"
      : ext === ".webp"
        ? "image/webp"
        : ext === ".gif"
          ? "image/gif"
          : "image/jpeg";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

/** Compact list for AI polish (names + baseline decision only). */
function compactBaselineForAi(items: MatchPayload["items"]) {
  return items.map((i) => ({
    name: i.name,
    meal: i.meal,
    station: i.station,
    decision: i.decision,
    tags: i.tags || [],
  }));
}

export async function extractMenuFromImage(
  imagePathOrDataUrl: string,
  options?: { allowFixtureFallback?: boolean }
): Promise<{ menu: StructuredMenu; source: "ai" | "fixture"; model?: string }> {
  const allowFixture = options?.allowFixtureFallback === true;
  const dataUrl = imagePathOrDataUrl.startsWith("data:")
    ? imagePathOrDataUrl
    : fileToDataUrl(imagePathOrDataUrl);

  if (!hasGeminiKey()) {
    if (allowFixture) return { menu: SAMPLE_MENU, source: "fixture" };
    throw new Error("GEMINI_API_KEY not set");
  }

  const system = `You extract office cafeteria menus from photos.
Return ONLY JSON:
{
  "date": "YYYY-MM-DD or best guess",
  "meals": [
    {
      "type": "breakfast" | "lunch" | "other",
      "stations": [
        {
          "name": "station name",
          "items": [
            {
              "name": "dish name",
              "tags": ["vegan","vegetarian","egg","dairy","gluten","meat","chicken","beef","pork","fish","shellfish","turkey","spicy","beans","legume"],
              "notes": null
            }
          ]
        }
      ]
    }
  ]
}
Tag ingredients you can infer (chickpea -> beans,legume; cheese -> dairy).
Do not invent dishes. Never use em dashes.`;

  try {
    const { text, model } = await geminiVision(
      system,
      "Extract the full structured menu. Valid compact JSON only. No trailing commas.",
      dataUrl,
      { maxTokens: 12000 }
    );
    const parsed = normalizeMenu(extractJson<StructuredMenu>(text));
    const itemCount = parsed.meals.reduce(
      (n, m) => n + m.stations.reduce((s, st) => s + st.items.length, 0),
      0
    );
    if (itemCount < 3) throw new Error("Too few items extracted");
    return { menu: parsed, source: "ai", model };
  } catch (err) {
    console.error("[extractMenu] failed", err);
    if (allowFixture) return { menu: SAMPLE_MENU, source: "fixture" };
    throw new Error(friendlyGeminiError(err));
  }
}

export async function interpretPreferences(
  input: PrefsInput
): Promise<AiInterpretation & { mode: AiMode }> {
  if (!hasGeminiKey()) {
    return { ...interpretPreferencesLocal(input), mode: "error" };
  }

  const system = `You are the preference brain for an office cafe app.
Understand diet chips, avoids, allergies, free-form notes, goals.

Return ONLY JSON:
{
  "diet_type": "vegan"|"vegetarian"|"eggetarian"|"non_veg"|"custom",
  "hard_avoids": string[],
  "soft_dislikes": string[],
  "likes": string[],
  "goals": string[],
  "allergies": string[],
  "interpreted_notes": string,
  "user_facing_summary": string
}

CRITICAL:
1. "beans" means whole legume family: beans, chickpea, lentil, dal, hummus, edamame, falafel, soy bean, legume. Put original and related terms in allergies and hard_avoids.
2. lactose intolerant -> dairy (milk, cheese, yogurt, curd, butter, cream, paneer).
3. Expand shellfish, nuts, gluten, pork, egg similarly.
4. Prefer safety when unsure.
5. Merge user chips; do not drop them.
6. Never use em dashes in strings.`;

  try {
    const { data: parsed } = await geminiTextJson<AiInterpretation>(
      system,
      JSON.stringify(input, null, 2),
      { maxTokens: 2048 }
    );
    return {
      diet_type: parsed.diet_type || input.dietType,
      hard_avoids: uniqueStrings([
        ...input.hardAvoids,
        ...input.allergies,
        ...(parsed.hard_avoids || []),
        ...(parsed.allergies || []),
      ]),
      soft_dislikes: uniqueStrings([
        ...input.softDislikes,
        ...(parsed.soft_dislikes || []),
      ]),
      likes: uniqueStrings([...input.likes, ...(parsed.likes || [])]),
      goals: uniqueStrings([...input.goals, ...(parsed.goals || [])]),
      allergies: uniqueStrings([
        ...input.allergies,
        ...(parsed.allergies || []),
      ]),
      interpreted_notes: parsed.interpreted_notes || input.freeformNotes,
      user_facing_summary:
        parsed.user_facing_summary ||
        `Diet ${input.dietType}; allergies ${(parsed.allergies || input.allergies).join(", ") || "none"}`,
      mode: "gemini",
    };
  } catch (err) {
    console.warn(
      "[interpretPreferences] AI failed, using local",
      friendlyGeminiError(err)
    );
    return { ...interpretPreferencesLocal(input), mode: "error" };
  }
}

type AiPolish = {
  verdict?: Verdict | string;
  headline?: string;
  summary?: string;
  combos?: MatchPayload["combos"];
  overrides?: {
    name: string;
    decision: string;
    reason?: string;
  }[];
};

/**
 * Baseline-first match: local rules own hard safety and scores.
 * AI only polishes copy, plate ideas, and optional soft overrides.
 * Never puts raw AI errors into user-facing summary.
 */
export async function matchMenuToPrefs(options: {
  menu: StructuredMenu;
  prefs: PrefsInput;
  tempRestrictions: TempRestrictionInput[];
}): Promise<
  MatchPayload & {
    mode: AiMode;
    source: MatchSource;
  }
> {
  const baseline = matchMenuLocal(
    options.menu,
    options.prefs,
    options.tempRestrictions
  );

  const withMeta = (
    payload: MatchPayload,
    source: MatchSource,
    mode: AiMode,
    aiStatus?: MatchPayload["aiStatus"]
  ): MatchPayload & { mode: AiMode; source: MatchSource } => {
    const items = payload.items;
    const { score, verdict, rec } = scoreFromItems(items);
    // Always 3 slots (Breakfast · Lunch · Salad) from local plate builder
    const combos =
      baseline.combos?.length === 3
        ? baseline.combos
        : buildCombos(items);
    return {
      verdict: payload.verdict || verdict,
      headline: payload.headline || baseline.headline,
      summary:
        payload.summary ||
        `${rec} of ${items.length} dishes look good for your profile today. Score is your personal fit (not a fixed number).`,
      score,
      items,
      combos,
      source,
      aiStatus,
      mode,
    };
  };

  if (!hasGeminiKey()) {
    return withMeta(baseline, "baseline", "error", {
      ok: false,
      detail: "GEMINI_API_KEY missing",
    });
  }

  const system = `You polish a cafeteria match for ONE employee.
Local rules already decided each dish (recommended|caution|avoid). Hard avoids are FINAL.

Return ONLY this compact JSON (no full item list):
{
  "verdict": "great"|"mostly_fine"|"thin_options"|"not_your_day",
  "headline": string,
  "summary": string (1-2 sentences, friendly, no JSON errors or technical jargon),
  "combos": [
    {
      "title": string,
      "items": string[] (exact dish names from recommended only, max 3),
      "itemReasons": string[],
      "why": string
    }
  ],
  "overrides": [
    {
      "name": string (exact dish name),
      "decision": "recommended"|"caution"|"avoid",
      "reason": string (under 12 words)
    }
  ]
}

RULES:
1. Max 2 combos. Only use dishes whose baseline decision is recommended (or you override TO recommended without violating allergies).
2. overrides: ONLY soft disagreements (likes, goals, soft dislikes). Do NOT override hard allergy/avoid baseline "avoid" to recommended.
3. Keep overrides under 12 entries. Prefer empty overrides if baseline is fine.
4. Never use em dashes. Compact valid JSON only.`;

  const userPayload = {
    preferences: options.prefs,
    active_temporary_restrictions: options.tempRestrictions,
    baseline_counts: {
      total: baseline.items.length,
      recommended: baseline.items.filter((i) => i.decision === "recommended")
        .length,
      caution: baseline.items.filter((i) => i.decision === "caution").length,
      avoid: baseline.items.filter((i) => i.decision === "avoid").length,
      score: baseline.score,
      verdict: baseline.verdict,
    },
    dishes: compactBaselineForAi(baseline.items),
  };

  try {
    const { data: parsed } = await geminiTextJson<AiPolish>(
      system,
      JSON.stringify(userPayload),
      { maxTokens: 4096 }
    );

    // Start from baseline; apply soft overrides only
    const items: MatchPayload["items"] = baseline.items.map((it) => ({
      ...it,
    }));
    const byName = new Map(items.map((i) => [normName(i.name), i]));
    let overrideCount = 0;

    for (const ov of parsed.overrides || []) {
      if (!ov?.name) continue;
      const row = byName.get(normName(ov.name));
      if (!row) continue;
      const next = decisionOf(ov.decision);
      // Never lift a hard avoid to recommended/caution that looks safe
      if (row.decision === "avoid" && next !== "avoid") {
        // Only allow if baseline avoid was not allergy-like? Keep strict: no lift.
        continue;
      }
      // Do not soften avoid at all
      if (row.decision === "avoid") continue;

      row.decision = next;
      if (ov.reason) row.reason = ov.reason;
      overrideCount += 1;
    }

    const recNames = new Set(
      items.filter((i) => i.decision === "recommended").map((i) => i.name)
    );

    let combos = buildCombos(items);
    const aiCombos = (parsed.combos || [])
      .map((c) => {
        const pairs = (c.items || [])
          .map((name, idx) => {
            const real =
              items.find(
                (i) =>
                  normName(i.name) === normName(name) &&
                  i.decision === "recommended"
              )?.name || "";
            return {
              name: real,
              reason: c.itemReasons?.[idx] || "On your Good list",
            };
          })
          .filter((p) => p.name && recNames.has(p.name));
        return {
          title: c.title || "Plate idea",
          items: pairs.map((p) => p.name),
          itemReasons: pairs.map((p) => p.reason),
          why: c.why || "Built from dishes marked Good for you",
        };
      })
      .filter((c) => c.items.length >= 2);
    if (aiCombos.length) combos = aiCombos;
    if (!combos.length) combos = buildCombos(items);

    const { score, verdict, rec } = scoreFromItems(items);
    const validVerdicts = new Set([
      "great",
      "mostly_fine",
      "thin_options",
      "not_your_day",
    ]);
    const aiVerdict =
      parsed.verdict && validVerdicts.has(String(parsed.verdict))
        ? (parsed.verdict as Verdict)
        : verdict;

    const source: MatchSource =
      overrideCount > 0 || aiCombos.length > 0 || Boolean(parsed.headline)
        ? overrideCount > 0
          ? "hybrid"
          : "ai"
        : "hybrid";

    return withMeta(
      {
        verdict: aiVerdict,
        headline:
          (parsed.headline && String(parsed.headline).trim()) ||
          baseline.headline,
        summary:
          (parsed.summary && String(parsed.summary).trim()) ||
          `${rec} of ${items.length} dishes look good for your profile today. Score is your personal fit (not a fixed number).`,
        score,
        items,
        combos,
      },
      source,
      "gemini",
      { ok: true }
    );
  } catch (err) {
    const detail = friendlyGeminiError(err);
    console.error("[matchMenuToPrefs] AI polish failed, using baseline", detail);
    // Clean baseline only — never append raw parse errors to summary
    return withMeta(baseline, "baseline", "gemini", {
      ok: false,
      detail,
    });
  }
}
