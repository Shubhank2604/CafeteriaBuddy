import { NextResponse } from "next/server";
import { count, desc, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin";
import { getDb, schema } from "@/lib/db";
import { getMenuForDate } from "@/lib/services";
import { todayISO } from "@/lib/utils";

/** List menu days or fetch one date's full structured menu. */
export async function GET(req: Request) {
  const gate = await requireAdmin();
  if ("error" in gate && gate.error) return gate.error;

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");

  if (date) {
    const pack = getMenuForDate(date);
    if (!pack) {
      return NextResponse.json({ error: "No menu for that date" }, { status: 404 });
    }
    const itemCount = pack.menu.meals.reduce(
      (n, m) => n + m.stations.reduce((s, st) => s + st.items.length, 0),
      0
    );
    return NextResponse.json({
      id: pack.id,
      date: pack.date,
      sourceImagePath: pack.sourceImagePath,
      createdAt: pack.createdAt,
      meta: pack.meta,
      itemCount,
      menu: pack.menu,
      flatItems: "flatItems" in pack ? pack.flatItems : undefined,
    });
  }

  const db = getDb();
  const rows = db
    .select()
    .from(schema.menuDays)
    .orderBy(desc(schema.menuDays.date))
    .all();

  const menus = rows.map((m) => {
    const itemCount =
      db
        .select({ n: count() })
        .from(schema.menuItems)
        .where(eq(schema.menuItems.menuDayId, m.id))
        .get()?.n ?? 0;
    return {
      id: m.id,
      date: m.date,
      sourceImagePath: m.sourceImagePath,
      createdAt: m.createdAt,
      createdBy: m.createdBy,
      itemCount,
    };
  });

  return NextResponse.json({ menus, today: todayISO() });
}

/** Delete a menu day (and its items + matches). */
export async function DELETE(req: Request) {
  const gate = await requireAdmin();
  if ("error" in gate && gate.error) return gate.error;

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  if (!date) {
    return NextResponse.json({ error: "date query required" }, { status: 400 });
  }

  const db = getDb();
  const day = db
    .select()
    .from(schema.menuDays)
    .where(eq(schema.menuDays.date, date))
    .get();
  if (!day) {
    return NextResponse.json({ error: "Menu not found" }, { status: 404 });
  }

  db.delete(schema.matchResults)
    .where(eq(schema.matchResults.menuDayId, day.id))
    .run();
  db.delete(schema.digestLogs)
    .where(eq(schema.digestLogs.menuDayId, day.id))
    .run();
  db.delete(schema.menuItems)
    .where(eq(schema.menuItems.menuDayId, day.id))
    .run();
  db.delete(schema.menuDays).where(eq(schema.menuDays.id, day.id)).run();

  return NextResponse.json({ ok: true, deletedDate: date });
}
