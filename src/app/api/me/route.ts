import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { serializePrefsForClient } from "@/lib/services";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ user: null });
  }
  return NextResponse.json({
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      isAdmin: session.user.isAdmin,
    },
    prefs: serializePrefsForClient(session.user.id),
  });
}
