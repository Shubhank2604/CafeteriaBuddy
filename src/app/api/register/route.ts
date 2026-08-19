import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { nowISO } from "@/lib/utils";
import { rateLimit } from "@/lib/rate-limit";
import { registerSchema } from "@/lib/validation";

export async function POST(req: Request) {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    const rl = rateLimit(`register:${ip}`, { limit: 8, windowMs: 15 * 60_000 });
    if (!rl.ok) {
      return NextResponse.json(
        { error: `Too many attempts. Try again in ${rl.retryAfterSec}s.` },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ||
            "Name, email, and password (6+ chars) are required.",
        },
        { status: 400 }
      );
    }
    const name = parsed.data.name;
    const email = parsed.data.email.toLowerCase();
    const password = parsed.data.password;

    const db = getDb();
    const existing = db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .get();
    if (existing) {
      return NextResponse.json(
        { error: "Email already registered." },
        { status: 409 }
      );
    }

    // Seed admin already exists; new users are employees (not auto-admin)
    const id = randomUUID();
    const passwordHash = await bcrypt.hash(password, 10);

    db.insert(schema.users)
      .values({
        id,
        name,
        email,
        passwordHash,
        isAdmin: false,
        createdAt: nowISO(),
      })
      .run();

    db.insert(schema.preferenceProfiles)
      .values({
        userId: id,
        updatedAt: nowISO(),
      })
      .run();

    return NextResponse.json({
      ok: true,
      isAdmin: false,
      message: "Account created.",
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Registration failed." }, { status: 500 });
  }
}
