import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getFeedbackMap, upsertDishFeedback } from "@/lib/services";
import { feedbackSchema } from "@/lib/validation";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const menuDayId = new URL(req.url).searchParams.get("menuDayId");
  if (!menuDayId) {
    return NextResponse.json({ error: "menuDayId required" }, { status: 400 });
  }
  return NextResponse.json({
    feedback: getFeedbackMap(session.user.id, menuDayId),
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const parsed = feedbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid" },
      { status: 400 }
    );
  }
  const result = upsertDishFeedback({
    userId: session.user.id,
    ...parsed.data,
  });
  return NextResponse.json({
    ok: true,
    ...result,
    feedback: getFeedbackMap(session.user.id, parsed.data.menuDayId),
  });
}
