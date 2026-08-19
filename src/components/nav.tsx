"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useEffect } from "react";
import {
  LogOut,
  Settings,
  Sparkles,
  Sun,
  UtensilsCrossed,
  Wrench,
} from "lucide-react";

const baseLinks = [
  { href: "/today", label: "Today", Icon: Sun },
  { href: "/menu", label: "Menu", Icon: UtensilsCrossed },
  { href: "/preferences", label: "Prefs", Icon: Sparkles },
  { href: "/settings", label: "Settings", Icon: Settings },
];

export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { data } = useSession();
  const isAdmin = Boolean(data?.user?.isAdmin);

  const links = isAdmin
    ? [...baseLinks, { href: "/admin", label: "Admin", Icon: Wrench }]
    : baseLinks;

  // Warm all tab routes so clicks feel instant
  useEffect(() => {
    for (const l of links) {
      router.prefetch(l.href);
    }
  }, [router, isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {/* Liquid Glass floating nav */}
      <header className="nav-island-wrap">
        <div className="nav-island glass">
          <Link href="/today" className="nav-island-brand">
            <span className="logo-mark" aria-hidden>
              <UtensilsCrossed size={18} strokeWidth={2} />
            </span>
            <span className="brand-wordmark">MealWorks</span>
          </Link>

          <nav className="desktop-nav-links nav-island-links" aria-label="Main">
            {links.map((l) => {
              const active =
                pathname === l.href || pathname.startsWith(l.href + "/");
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className="nav-pill"
                  data-active={active}
                  aria-current={active ? "page" : undefined}
                >
                  <l.Icon size={18} strokeWidth={2} aria-hidden />
                  {l.label}
                </Link>
              );
            })}
          </nav>

          <button
            type="button"
            className="nav-island-out"
            onClick={() => signOut({ callbackUrl: "/" })}
            aria-label="Sign out"
          >
            <LogOut size={18} strokeWidth={2} />
          </button>
        </div>
      </header>

      {/* Liquid Glass mobile dock */}
      <nav className="bottom-dock md:hidden" aria-label="Mobile">
        <div className="bottom-dock-island glass">
          {links.map((l) => {
            const active =
              pathname === l.href || pathname.startsWith(l.href + "/");
            return (
              <Link
                key={l.href}
                href={l.href}
                className="dock-item"
                data-active={active}
                aria-current={active ? "page" : undefined}
              >
                <l.Icon size={20} strokeWidth={2} aria-hidden />
                <span>{l.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
