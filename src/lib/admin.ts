import { NextResponse } from "next/server";
import { auth } from "./auth";

export async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (!session.user.isAdmin) {
    return {
      error: NextResponse.json({ error: "Admin only" }, { status: 403 }),
    };
  }
  return { session };
}
