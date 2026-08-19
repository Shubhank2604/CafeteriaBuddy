import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Camera, Sparkles, UtensilsCrossed } from "lucide-react";

export default async function HomePage() {
  const session = await auth();
  // Route through /continue so admin vs onboarding vs today is decided correctly
  if (session?.user) redirect("/continue");

  return (
    <div className="min-h-screen">
      <div className="relative z-[1] mx-auto flex min-h-screen w-full max-w-[72rem] flex-col px-5 py-8 sm:px-8">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="logo-mark">
              <UtensilsCrossed size={15} strokeWidth={2} />
            </span>
            <span className="brand-wordmark">MealWorks</span>
          </div>
          <Link href="/login" className="btn btn-secondary !py-2 !text-sm">
            Sign in
          </Link>
        </header>

        <section className="flex flex-1 flex-col justify-center py-14 sm:py-16">
          <p className="eyebrow w-fit">Office café, personal</p>
          <h1 className="hero-title mt-5 max-w-xl text-[2.5rem] text-[var(--ink)] sm:text-[3rem]">
            Know what to eat before you walk over.
          </h1>
          <p className="mt-5 max-w-md text-[1.075rem] leading-relaxed text-[var(--muted)]">
            Your diet and allergies, matched to today’s board. Clear good and
            skip — fast decisions.
          </p>
          <div className="mt-9 flex flex-wrap gap-2.5">
            <Link href="/register" className="btn btn-primary">
              Get started
            </Link>
            <Link href="/login" className="btn btn-secondary">
              I have an account
            </Link>
          </div>

          <div className="card-grid card-grid-3 mt-16 max-w-5xl">
            {[
              {
                n: "01",
                t: "Your taste",
                d: "Diet, allergies, notes — in your words.",
                Icon: Sparkles,
              },
              {
                n: "02",
                t: "Daily photo",
                d: "Admin posts the café menu.",
                Icon: Camera,
              },
              {
                n: "03",
                t: "Your board",
                d: "Clear good and skip for today’s dishes.",
                Icon: UtensilsCrossed,
              },
            ].map((x) => (
              <div key={x.t} className="card p-5 sm:p-6">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-[var(--muted)]">
                    {x.n}
                  </p>
                  <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[var(--bg)] text-[var(--ink)]">
                    <x.Icon size={18} strokeWidth={2} aria-hidden />
                  </span>
                </div>
                <h3 className="card-title mt-3 text-lg">{x.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
                  {x.d}
                </p>
              </div>
            ))}
          </div>

          <div className="card-grid-2 mt-4 max-w-5xl">
            <div className="card p-5">
              <p className="card-title">Plate ideas</p>
              <p className="mt-1.5 text-sm text-[var(--muted)]">
                Breakfast and lunch combos from dishes marked good for you.
              </p>
            </div>
            <div className="card p-5">
              <p className="card-title">Morning digest</p>
              <p className="mt-1.5 text-sm text-[var(--muted)]">
                Optional morning email before you head to the café.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
