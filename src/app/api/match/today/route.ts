import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import {
  getActiveMenu,
  getFeedbackMap,
  getOrCreateMatch,
  getPrefs,
  matchBaselineOnly,
} from "@/lib/services";
import { getDb, schema } from "@/lib/db";
import { resolveMenuDate } from "@/lib/utils";

function dateFromRequest(
  userId: string,
  opts: { date?: string | null; tz?: string | null }
) {
  const prefs = getPrefs(userId);
  return resolveMenuDate({
    date: opts.date,
    timeZone: opts.tz || prefs?.timezone || undefined,
  });
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const date = dateFromRequest(session.user.id, {
    date: searchParams.get("date"),
    tz: searchParams.get("tz"),
  });
  const phase = searchParams.get("phase"); // baseline | full

  try {
    if (phase === "baseline") {
      const quick = matchBaselineOnly(session.user.id, date);
      if (!quick) {
        return NextResponse.json({
          menu: null,
          match: null,
          resolvedDate: date,
        });
      }
      const { items, combos, ...rest } = quick.match;
      return NextResponse.json({
        menu: quick.menu,
        match: {
          ...rest,
          source: "baseline",
          phase: "baseline",
          payload: { items, combos },
        },
        preferredDate: date,
        resolvedDate: date,
        cached: false,
        phase: "baseline",
      });
    }

    const result = await getOrCreateMatch(session.user.id, date);
    const feedback =
      result.menu?.id && session.user.id
        ? getFeedbackMap(session.user.id, result.menu.id)
        : {};
    return NextResponse.json({
      ...result,
      resolvedDate: date,
      feedback,
      timezone: searchParams.get("tz") || getPrefs(session.user.id)?.timezone,
      phase: "full",
      cached: Boolean(result.match),
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Match failed" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const date = dateFromRequest(session.user.id, {
    date: body.date,
    tz: body.tz || body.timezone,
  });

  // Scoped rematch: only wipe match for the active menu day
  const menuPack = getActiveMenu(date);
  if (menuPack) {
    getDb()
      .delete(schema.matchResults)
      .where(
        and(
          eq(schema.matchResults.userId, session.user.id),
          eq(schema.matchResults.menuDayId, menuPack.id)
        )
      )
      .run();
  }

  try {
    const result = await getOrCreateMatch(session.user.id, date);
    const feedback =
      result.menu?.id
        ? getFeedbackMap(session.user.id, result.menu.id)
        : {};
    return NextResponse.json({
      ...result,
      resolvedDate: date,
      feedback,
      timezone: body.tz || body.timezone || getPrefs(session.user.id)?.timezone,
      phase: "full",
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Match failed" },
      { status: 500 }
    );
  }
}
