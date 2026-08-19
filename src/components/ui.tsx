"use client";

import { useEffect, useId, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Reading column — never stretches to full monitor width. */
export function Page({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <main className={cn("page-content", className)}>{children}</main>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
  icon: Icon,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          {Icon && (
            <span className="logo-mark !h-10 !w-10">
              <Icon size={18} strokeWidth={2} aria-hidden />
            </span>
          )}
          <h1 className="page-title text-[1.65rem] text-[var(--ink)] sm:text-[1.85rem]">
            {title}
          </h1>
        </div>
        {subtitle && (
          <p className="mt-1.5 text-[0.95rem] leading-snug text-[var(--muted)]">
            {subtitle}
          </p>
        )}
      </div>
      {action && (
        <div className="flex shrink-0 items-center gap-1.5">{action}</div>
      )}
    </div>
  );
}

export function Card({
  children,
  className,
  tint,
  ...rest
}: {
  children: React.ReactNode;
  className?: string;
  tint?:
    | "mint"
    | "rose"
    | "warm"
    | "brand"
    | "lavender"
    | "peach"
    | "butter"
    | "sky";
} & React.HTMLAttributes<HTMLDivElement>) {
  const tintClass =
    tint === "warm"
      ? "card-tint-warm"
      : tint === "brand"
        ? "card-tint-brand"
        : tint
          ? `card-tint-${tint}`
          : undefined;
  return (
    <div className={cn("card p-4 sm:p-5", tintClass, className)} {...rest}>
      {children}
    </div>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="section-title mb-2.5">{children}</h2>;
}

export function EmptyState({
  title,
  body,
  action,
  icon: Icon,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <Card className="text-center">
      <div className="mx-auto max-w-sm py-9">
        {Icon && (
          <span className="logo-mark mx-auto !h-12 !w-12">
            <Icon size={22} strokeWidth={2} aria-hidden />
          </span>
        )}
        <h2 className="card-title mt-4 text-xl text-[var(--ink)]">{title}</h2>
        <p className="mt-2 text-[0.95rem] leading-relaxed text-[var(--muted)]">
          {body}
        </p>
        {action && <div className="mt-5 flex justify-center">{action}</div>}
      </div>
    </Card>
  );
}

export function DecisionBadge({ decision }: { decision: string }) {
  const map: Record<string, string> = {
    recommended: "badge-recommended",
    caution: "badge-caution",
    avoid: "badge-avoid",
  };
  const label: Record<string, string> = {
    recommended: "Good",
    caution: "Maybe",
    avoid: "Skip",
  };
  return (
    <span className={cn("badge", map[decision] || "badge-caution")}>
      {label[decision] || decision}
    </span>
  );
}

export function ChipGroup({
  options,
  selected,
  onChange,
  multi = true,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
  multi?: boolean;
}) {
  return (
    <div
      className="flex flex-wrap gap-2"
      role={multi ? "group" : "radiogroup"}
      aria-label="Choices"
    >
      {options.map((opt) => {
        const active = selected.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            className="chip"
            data-active={active}
            aria-pressed={multi ? active : undefined}
            aria-checked={!multi ? active : undefined}
            role={multi ? "button" : "radio"}
            onClick={() => {
              if (multi) {
                onChange(
                  active
                    ? selected.filter((s) => s !== opt.value)
                    : [...selected, opt.value]
                );
              } else {
                onChange([opt.value]);
              }
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function Alert({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  return (
    <div className={cn("alert", `alert-${tone}`)} role="status">
      {children}
    </div>
  );
}

/** Tiny book with pages flipping — loading easter egg. */
export function BookLoader({
  label = "Flipping through…",
  compact = false,
  /** When false, show a still book (no page flip). Default: flip. */
  flipping = true,
}: {
  label?: string;
  compact?: boolean;
  flipping?: boolean;
}) {
  const showLabel = Boolean(label && label.trim());
  return (
    <div
      className={cn(
        "book-loader",
        compact ? "book-loader-compact" : undefined,
        flipping ? "is-flipping" : "is-still"
      )}
      role="status"
      aria-live="polite"
      aria-label={showLabel ? label : flipping ? "Loading" : "Ready"}
    >
      <div className="book" aria-hidden>
        <div className="book-cover book-cover-left" />
        <div className="book-pages">
          <div className="book-page book-page-static" />
          <div className="book-page book-page-flip" />
          <div className="book-page book-page-flip book-page-flip-delay" />
        </div>
        <div className="book-cover book-cover-right" />
        <div className="book-spine" />
      </div>
      {showLabel ? <p className="book-loader-label">{label}</p> : null}
    </div>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return <BookLoader label={label} compact flipping />;
}

/** Soft placeholder — prefer over full-page Spinner for navigation. */
export function Skeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-[10px] bg-[rgba(0,0,0,0.06)]",
        className
      )}
      aria-hidden
    />
  );
}

export function PageSkeleton({
  rows = 3,
  label = "Flipping through today’s menu…",
}: {
  rows?: number;
  label?: string;
}) {
  return (
    <div className="space-y-5" role="status" aria-label={label}>
      <BookLoader label={label} />
      <div className="space-y-3">
        <Skeleton className="h-20 w-full" />
        {Array.from({ length: Math.max(0, rows - 1) }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    </div>
  );
}

export function StatPill({
  label,
  value,
  tone = "mint",
}: {
  label: string;
  value: string | number;
  tone?: "mint" | "peach" | "lavender" | "butter" | "rose";
}) {
  const bg: Record<string, string> = {
    mint: "bg-[var(--good-soft)] text-[var(--good-ink)]",
    peach: "bg-[var(--peach)] text-[var(--peach-ink)]",
    lavender: "bg-[var(--lavender)] text-[var(--lavender-ink)]",
    butter: "bg-[var(--caution-soft)] text-[var(--caution-ink)]",
    rose: "bg-[var(--skip-soft)] text-[var(--skip-ink)]",
  };
  return (
    <div className={cn("rounded-2xl px-3 py-2", bg[tone])}>
      <p className="text-[0.65rem] font-semibold uppercase tracking-wide opacity-75">
        {label}
      </p>
      <p className="font-display text-xl font-semibold tracking-tight">
        {value}
      </p>
    </div>
  );
}

/** Modern thin SVG arc score — Apple Fitness / Linear style. */
export function ScoreRing({
  score,
  label = "Fit",
}: {
  score: number;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(100, Number(score) || 0));
  const uid = useId().replace(/:/g, "");
  const r = 42;
  const c = 2 * Math.PI * r;
  const [drawn, setDrawn] = useState(0);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setDrawn(pct);
      return;
    }
    setDrawn(0);
    const id = requestAnimationFrame(() => setDrawn(pct));
    return () => cancelAnimationFrame(id);
  }, [pct]);

  const offset = c - (drawn / 100) * c;
  const band =
    pct >= 70 ? "good" : pct >= 40 ? "mid" : pct > 0 ? "low" : "empty";
  const stroke =
    band === "good"
      ? "var(--accent)"
      : band === "mid"
        ? "var(--caution)"
        : band === "low"
          ? "var(--ink-soft)"
          : "var(--line)";

  return (
    <div
      className={cn("score-arc", `score-arc-${band}`)}
      aria-label={`${label} ${Math.round(pct)}`}
    >
      <svg className="score-arc-svg" viewBox="0 0 100 100" aria-hidden>
        <defs>
          <linearGradient id={`score-grad-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={stroke} stopOpacity="1" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0.65" />
          </linearGradient>
        </defs>
        {/* Track */}
        <circle
          className="score-arc-track"
          cx="50"
          cy="50"
          r={r}
          fill="none"
          strokeWidth="7"
        />
        {/* Progress */}
        <circle
          className="score-arc-progress"
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={`url(#score-grad-${uid})`}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform="rotate(-90 50 50)"
        />
      </svg>
      <div className="score-arc-center">
        <div className="score-arc-value">{Math.round(pct)}</div>
        <div className="score-arc-label">{label}</div>
      </div>
    </div>
  );
}
