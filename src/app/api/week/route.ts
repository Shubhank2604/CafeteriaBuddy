import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPrefs, weekFitScores } from "@/lib/services";
import { resolveMenuDate } from "@/lib/utils";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const prefs = getPrefs(session.user.id);
  const anchor = resolveMenuDate({
    date: searchParams.get("date"),
    timeZone: searchParams.get("tz") || prefs?.timezone || undefined,
  });
  const days = weekFitScores(session.user.id, anchor);
  return NextResponse.json({ anchor, days });
}
