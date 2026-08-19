import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb, schema } from "./db";

const authSecret =
  process.env.AUTH_SECRET ||
  (process.env.NODE_ENV === "production"
    ? undefined
    : "dev-only-secret-not-for-prod");

if (!authSecret && process.env.NODE_ENV === "production") {
  console.error("[auth] AUTH_SECRET is required in production");
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: authSecret,
  trustHost: true,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email || "")
          .trim()
          .toLowerCase();
        const password = String(credentials?.password || "");
        if (!email || !password) {
          console.warn("[auth] missing email or password");
          return null;
        }

        const { rateLimit } = await import("./rate-limit");
        const rl = rateLimit(`login:${email}`, {
          limit: 12,
          windowMs: 15 * 60_000,
        });
        if (!rl.ok) {
          console.warn("[auth] rate limited", email);
          return null;
        }

        const db = getDb();
        const user = db
          .select()
          .from(schema.users)
          .where(eq(schema.users.email, email))
          .get();
        if (!user) {
          console.warn("[auth] no user for", email);
          return null;
        }
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) {
          console.warn("[auth] bad password for", email);
          return null;
        }
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          // SQLite may return 0/1; force real boolean for JWT
          isAdmin: Boolean(user.isAdmin),
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.isAdmin = Boolean((user as { isAdmin?: boolean }).isAdmin);
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.id || token.sub || "");
        session.user.isAdmin = Boolean(token.isAdmin);
      }
      return session;
    },
  },
});
