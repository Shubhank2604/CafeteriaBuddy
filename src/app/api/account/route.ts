import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { updateAccount } from "@/lib/services";
import { accountUpdateSchema } from "@/lib/validation";

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const parsed = accountUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid" },
      { status: 400 }
    );
  }
  try {
    const user = await updateAccount(session.user.id, parsed.data);
    return NextResponse.json({
      ok: true,
      user: user
        ? { id: user.id, name: user.name, email: user.email, isAdmin: user.isAdmin }
        : null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Update failed" },
      { status: 400 }
    );
  }
}
