import { NextResponse } from "next/server";
import { count, desc, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin";
import { getDb, schema } from "@/lib/db";
import { getActiveMenu } from "@/lib/services";
import { todayISO } from "@/lib/utils";

export async function GET() {
  const gate = await requireAdmin();
  if ("error" in gate && gate.error) return gate.error;

  const db = getDb();
  const date = todayISO();
  const menuPack = getActiveMenu(date);

  const userCount =
    db.select({ n: count() }).from(schema.users).get()?.n ?? 0;
  const adminCount =
    db
      .select({ n: count() })
      .from(schema.users)
      .where(eq(schema.users.isAdmin, true))
      .get()?.n ?? 0;
  const digestOptIn =
    db
      .select({ n: count() })
      .from(schema.preferenceProfiles)
      .where(eq(schema.preferenceProfiles.emailEnabled, true))
      .get()?.n ?? 0;
  const menuDayCount =
    db.select({ n: count() }).from(schema.menuDays).get()?.n ?? 0;

  let itemCount = 0;
  if (menuPack) {
    itemCount = menuPack.menu.meals.reduce(
      (n, m) =>
        n + m.stations.reduce((s, st) => s + st.items.length, 0),
      0
    );
  }

  const matchCountToday = menuPack
    ? db
        .select({ n: count() })
        .from(schema.matchResults)
        .where(eq(schema.matchResults.menuDayId, menuPack.id))
        .get()?.n ?? 0
    : 0;

  const recentMenus = db
    .select({
      id: schema.menuDays.id,
      date: schema.menuDays.date,
      sourceImagePath: schema.menuDays.sourceImagePath,
      createdAt: schema.menuDays.createdAt,
      createdBy: schema.menuDays.createdBy,
    })
    .from(schema.menuDays)
    .orderBy(desc(schema.menuDays.date))
    .limit(10)
    .all();

  const recentWithCounts = recentMenus.map((m) => {
    const items =
      db
        .select({ n: count() })
        .from(schema.menuItems)
        .where(eq(schema.menuItems.menuDayId, m.id))
        .get()?.n ?? 0;
    const matches =
      db
        .select({ n: count() })
        .from(schema.matchResults)
        .where(eq(schema.matchResults.menuDayId, m.id))
        .get()?.n ?? 0;
    return { ...m, itemCount: items, matchCount: matches };
  });

  const latestDigests =
    db
      .select({ n: count() })
      .from(schema.digestLogs)
      .get()?.n ?? 0;

  return NextResponse.json({
    today: date,
    menu: menuPack
      ? {
          id: menuPack.id,
          date: menuPack.date,
          itemCount,
          sourceImagePath: menuPack.sourceImagePath,
          meta: menuPack.meta,
          matchCount: matchCountToday,
        }
      : null,
    stats: {
      employees: userCount,
      admins: adminCount,
      digestOptIn,
      menuDays: menuDayCount,
      digestsLogged: latestDigests,
    },
    recentMenus: recentWithCounts,
  });
}
