import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { runDigests } from "@/lib/services";
import { todayISO } from "@/lib/utils";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!session.user.isAdmin) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const date = body.date || todayISO();
  const result = await runDigests(date);
  return NextResponse.json(result);
}
