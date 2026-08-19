import { NextResponse } from "next/server";
import { runDueDigests } from "@/lib/services";

/**
 * Cron-friendly tick: create digests for users whose local time matches.
 * Secure with CRON_SECRET header in production.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const h = req.headers.get("authorization") || "";
    if (h !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  const result = await runDueDigests();
  return NextResponse.json({ ok: true, ...result });
}
