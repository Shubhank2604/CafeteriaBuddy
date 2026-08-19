import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isEmailConfigured } from "@/lib/email";
import { rateLimit } from "@/lib/rate-limit";
import { sendTestDigest } from "@/lib/services";

/** Send a test morning digest to the signed-in user's email. */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = rateLimit(`digest-test:${session.user.id}`, {
    limit: 3,
    windowMs: 60_000,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Too many tests. Try again in ${rl.retryAfterSec}s.` },
      { status: 429 }
    );
  }

  const result = await sendTestDigest(session.user.id);
  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        emailConfigured: isEmailConfigured(),
      },
      { status: 400 }
    );
  }
  return NextResponse.json({
    ...result,
    emailConfigured: isEmailConfigured(),
  });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ emailConfigured: isEmailConfigured() });
}
