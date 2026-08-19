import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin";
import { getDb, schema } from "@/lib/db";
import { getMenuForDate } from "@/lib/services";
import { todayISO } from "@/lib/utils";

/**
 * Wipe cached personal matches so employees recompute on next open.
 * Optional date body; defaults to today.
 */
export async function POST(req: Request) {
  const gate = await requireAdmin();
  if ("error" in gate && gate.error) return gate.error;

  const body = await req.json().catch(() => ({}));
  const date = String(body.date || todayISO());
  const menuPack = getMenuForDate(date);
  if (!menuPack) {
    return NextResponse.json(
      { error: `No menu for ${date}` },
      { status: 404 }
    );
  }

  const db = getDb();
  db.delete(schema.matchResults)
    .where(eq(schema.matchResults.menuDayId, menuPack.id))
    .run();

  return NextResponse.json({
    ok: true,
    date,
    message: `Cleared personal match cache for ${date}. Employees will rematch on next open.`,
  });
}
