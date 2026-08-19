"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { UtensilsCrossed } from "lucide-react";
import { Alert, Card, Page } from "@/components/ui";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      setLoading(false);
      setError(data.error || "Could not register");
      return;
    }
    const login = await signIn("credentials", {
      email: email.trim().toLowerCase(),
      password,
      redirect: false,
    });
    if (login?.error || login?.ok === false) {
      setLoading(false);
      setError("Account created. Please sign in.");
      return;
    }
    window.location.assign("/continue");
  }

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
      <Card className="mx-auto w-full max-w-md">
        <h1 className="page-title text-[1.75rem]">Join the table</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          One minute to set up. Free for your office.
        </p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="label" htmlFor="name">
              Name
            </label>
            <input
              id="name"
              className="field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="email">
              Work email
            </label>
            <input
              id="email"
              className="field"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="password">
              Password (6+)
            </label>
            <input
              id="password"
              className="field"
              type="password"
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <Alert tone="bad">{error}</Alert>}
          <button className="btn btn-primary w-full" disabled={loading} type="submit">
            {loading ? "Creating…" : "Continue"}
          </button>
        </form>
        <p className="mt-5 text-center text-sm text-[var(--muted)]">
          Have an account?{" "}
          <Link
            href="/login"
            className="font-semibold text-[var(--accent)] underline-offset-2 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </Card>
    </Page>
  );
}
