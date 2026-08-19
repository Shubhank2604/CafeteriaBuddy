import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { savePreferences, serializePrefsForClient } from "@/lib/services";
import { prefsSchema } from "@/lib/validation";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const prefs = serializePrefsForClient(session.user.id);
  return NextResponse.json({ prefs });
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = prefsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid preferences" },
        { status: 400 }
      );
    }
    const prefs = await savePreferences(session.user.id, parsed.data);
    return NextResponse.json({ prefs });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save preferences" },
      { status: 500 }
    );
  }
}
