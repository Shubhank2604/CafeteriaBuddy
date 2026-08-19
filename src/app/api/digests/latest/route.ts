import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { latestDigest } from "@/lib/services";
import { safeJsonParse } from "@/lib/utils";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const row = latestDigest(session.user.id);
  if (!row) return NextResponse.json({ digest: null });
  return NextResponse.json({
    digest: {
      id: row.id,
      channel: row.channel,
      createdAt: row.createdAt,
      payload: safeJsonParse(row.payloadJson, {}),
    },
  });
}
