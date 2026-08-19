"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { UtensilsCrossed } from "lucide-react";
import { Alert, Card, Page } from "@/components/ui";

function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(
    searchParams.get("error") === "session"
      ? "Session ended. Sign in again."
      : ""
  );
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) {
      setLoading(false);
      setError("Enter email and password.");
      return;
    }
    try {
      const res = await signIn("credentials", {
        email: cleanEmail,
        password,
        redirect: false,
      });
      if (!res || res.error || res.ok === false) {
        setLoading(false);
        setError("Wrong email or password.");
        return;
      }
      window.location.assign("/continue");
    } catch {
      setLoading(false);
      setError("Sign-in failed. Try again.");
    }
  }

  return (
    <Card className="mx-auto w-full max-w-md">
      <h1 className="page-title text-[1.75rem]">Welcome back</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Sign in for today’s personal menu.
      </p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            className="field"
            type="text"
            inputMode="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
          />
        </div>
        <div>
          <label className="label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            className="field"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
          />
        </div>
        {error && <Alert tone="bad">{error}</Alert>}
        <button className="btn btn-primary w-full" disabled={loading} type="submit">
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="mt-5 text-center text-sm text-[var(--muted)]">
        New?{" "}
        <Link
          href="/register"
          className="font-semibold text-[var(--accent)] underline-offset-2 hover:underline"
        >
          Create account
        </Link>
      </p>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Page className="flex min-h-screen flex-col justify-center !py-10">
      <div className="mb-8 text-center">
        <Link href="/" className="inline-flex items-center gap-2.5">
          <span className="logo-mark">
            <UtensilsCrossed size={15} strokeWidth={2.5} />
          </span>
          <span className="brand-wordmark">MealWorks</span>
        </Link>
      </div>
      <Suspense fallback={<Card className="mx-auto w-full max-w-md">Loading…</Card>}>
        <LoginForm />
      </Suspense>
    </Page>
  );
}
