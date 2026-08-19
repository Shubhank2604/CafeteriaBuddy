import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin";
import { getDb, schema } from "@/lib/db";

/** List office employees for the admin suite. */
export async function GET() {
  const gate = await requireAdmin();
  if ("error" in gate && gate.error) return gate.error;

  const db = getDb();
  const users = db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      isAdmin: schema.users.isAdmin,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .orderBy(desc(schema.users.createdAt))
    .all();

  const withPrefs = users.map((u) => {
    const prefs = db
      .select({
        onboardingCompleted: schema.preferenceProfiles.onboardingCompleted,
        emailEnabled: schema.preferenceProfiles.emailEnabled,
        dietType: schema.preferenceProfiles.dietType,
        userFacingSummary: schema.preferenceProfiles.userFacingSummary,
        updatedAt: schema.preferenceProfiles.updatedAt,
      })
      .from(schema.preferenceProfiles)
      .where(eq(schema.preferenceProfiles.userId, u.id))
      .get();
    return {
      ...u,
      onboardingCompleted: prefs?.onboardingCompleted ?? false,
      emailEnabled: prefs?.emailEnabled ?? false,
      dietType: prefs?.dietType ?? null,
      prefsSummary: prefs?.userFacingSummary || "",
      prefsUpdatedAt: prefs?.updatedAt || null,
    };
  });

  return NextResponse.json({ users: withPrefs });
}

/** Promote / demote admin (cannot demote yourself). */
export async function PATCH(req: Request) {
  const gate = await requireAdmin();
  if ("error" in gate && gate.error) return gate.error;
  const session = gate.session!;

  const body = await req.json().catch(() => ({}));
  const userId = String(body.userId || "");
  const isAdmin = Boolean(body.isAdmin);

  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }
  if (userId === session.user.id && !isAdmin) {
    return NextResponse.json(
      { error: "You cannot remove your own admin access." },
      { status: 400 }
    );
  }

  const db = getDb();
  const target = db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .get();
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  db.update(schema.users)
    .set({ isAdmin })
    .where(eq(schema.users.id, userId))
    .run();

  return NextResponse.json({ ok: true, userId, isAdmin });
}
