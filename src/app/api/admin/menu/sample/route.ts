import { NextResponse } from "next/server";
import path from "path";
import { auth } from "@/lib/auth";
import { processMenuImage } from "@/lib/services";
import { todayISO } from "@/lib/utils";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!session.user.isAdmin) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const date = body.date || todayISO();
    const useAi = body.useAi !== false;
    const imagePath = path.join(process.cwd(), "public", "sample-menu.png");

    const result = await processMenuImage({
      imagePath,
      date,
      createdBy: session.user.id,
      useFixtureOnly: !useAi,
    });

    // Point image to public sample
    const { getDb, schema } = await import("@/lib/db");
    const { eq } = await import("drizzle-orm");
    getDb()
      .update(schema.menuDays)
      .set({ sourceImagePath: "/sample-menu.png" })
      .where(eq(schema.menuDays.id, result.menuDayId))
      .run();

    return NextResponse.json({
      ok: true,
      menuDayId: result.menuDayId,
      source: result.source,
      model: "model" in result ? result.model : undefined,
      menu: result.menu,
      imagePath: "/sample-menu.png",
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sample load failed" },
      { status: 500 }
    );
  }
}
