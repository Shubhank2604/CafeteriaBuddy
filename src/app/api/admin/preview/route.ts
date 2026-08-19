import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { getActiveMenu } from "@/lib/services";
import { matchMenuLocal } from "@/lib/matching";
import type { PrefsInput } from "@/lib/types";
import { resolveMenuDate } from "@/lib/utils";

/** Admin: preview how a diet/allergy profile sees today's menu. */
export async function POST(req: Request) {
  const gate = await requireAdmin();
  if ("error" in gate && gate.error) return gate.error;

  const body = await req.json().catch(() => ({}));
  const date = resolveMenuDate({
    date: body.date,
    timeZone: body.tz,
  });
  const menuPack = getActiveMenu(date);
  if (!menuPack) {
    return NextResponse.json({ error: "No menu" }, { status: 404 });
  }

  const prefs: PrefsInput = {
    dietType: body.dietType || "non_veg",
    hardAvoids: body.hardAvoids || [],
    softDislikes: body.softDislikes || [],
    likes: body.likes || [],
    goals: body.goals || [],
    allergies: body.allergies || [],
    freeformNotes: body.freeformNotes || "",
  };

  const match = matchMenuLocal(menuPack.menu, prefs, []);
  return NextResponse.json({
    date: menuPack.date,
    score: match.score,
    verdict: match.verdict,
    rec: match.items.filter((i) => i.decision === "recommended").length,
    avoid: match.items.filter((i) => i.decision === "avoid").length,
    caution: match.items.filter((i) => i.decision === "caution").length,
    items: match.items,
  });
}
