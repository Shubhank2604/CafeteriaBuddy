import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getActiveMenu, getPrefs } from "@/lib/services";
import { resolveMenuDate } from "@/lib/utils";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const prefs = getPrefs(session.user.id);
  const preferredDate = resolveMenuDate({
    date: searchParams.get("date"),
    timeZone: searchParams.get("tz") || prefs?.timezone || undefined,
  });
  const menu = getActiveMenu(preferredDate);
  return NextResponse.json({
    menu,
    date: preferredDate,
    activeDate: menu?.date ?? null,
    isFallback: menu?.isFallback ?? false,
    timezone: searchParams.get("tz") || prefs?.timezone || null,
  });
}
