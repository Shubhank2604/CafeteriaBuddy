"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ThumbsDown,
  ThumbsUp,
  Utensils,
} from "lucide-react";
import {
  Alert,
  BookLoader,
  Card,
  DecisionBadge,
  EmptyState,
  Page,
  PageHeader,
  PageSkeleton,
  ScoreRing,
} from "@/components/ui";
import { DateNav } from "@/components/date-nav";
import { PlateCarousel } from "@/components/plate-carousel";
import { deviceTimeZone, todayOnDevice, withDeviceTz } from "@/lib/client-date";
import { getCache, setCache } from "@/lib/client-cache";
import { ALLERGY_FAMILIES } from "@/lib/matching";
import { weekdayShort } from "@/lib/dates";
// RefreshCw removed — book button is the rematch control

type MatchItem = {
  name: string;
  meal: string;
  station: string;
  decision: string;
  reason: string;
};

type MatchData = {
  verdict: string;
  score: number;
  headline: string;
  summary: string;
  source?: "ai" | "hybrid" | "baseline";
  payload: {
    items: MatchItem[];
    combos: { title: string; items: string[] }[];
  };
};

const verdictLabel: Record<string, string> = {
  great: "Great day",
  mostly_fine: "Mostly fine",
  thin_options: "Thin options",
  not_your_day: "Pack lunch?",
};

type TodayCache = {
  menu: { id?: string; date: string; isFallback?: boolean } | null;
  match: MatchData | null;
  feedback: Record<string, string>;
  week: { date: string; score: number | null; hasMenu: boolean }[];
};

export default function TodayPage() {
  const [date, setDate] = useState(() => todayOnDevice());
  const cached0 = getCache<TodayCache>(`today:${todayOnDevice()}`);
  const [loading, setLoading] = useState(!cached0?.match && !cached0?.menu);
  const [polishing, setPolishing] = useState(false);
  /** True only after user taps the book — pages flip until done */
  const [bookBusy, setBookBusy] = useState(false);
  const [error, setError] = useState("");
  const [menu, setMenu] = useState<{
    id?: string;
    date: string;
    isFallback?: boolean;
  } | null>(cached0?.menu ?? null);
  const [match, setMatch] = useState<MatchData | null>(cached0?.match ?? null);
  const [filter, setFilter] = useState<"all" | "recommended" | "avoid">(
    "recommended"
  );
  const [feedback, setFeedback] = useState<Record<string, string>>(
    cached0?.feedback ?? {}
  );
  const [week, setWeek] = useState<
    { date: string; score: number | null; hasMenu: boolean }[]
  >(cached0?.week ?? []);
  const [openWhy, setOpenWhy] = useState<string | null>(null);

  const applyPayload = useCallback((data: Record<string, unknown>) => {
    const m = data.menu as {
      id?: string;
      date: string;
      isFallback?: boolean;
    } | null;
    setMenu(m);
    const raw = data.match as MatchData | null;
    if (!raw) {
      setMatch(null);
      return;
    }
    const payload =
      raw.payload?.items != null
        ? raw.payload
        : {
            items: (raw as unknown as { items?: MatchItem[] }).items || [],
            combos:
              (raw as unknown as { combos?: MatchData["payload"]["combos"] })
                .combos || [],
          };
    setMatch({
      verdict: raw.verdict,
      score: raw.score,
      headline: raw.headline,
      summary: raw.summary,
      source: raw.source,
      payload: {
        items: payload.items || [],
        combos: payload.combos || [],
      },
    });
    if (data.feedback && typeof data.feedback === "object") {
      setFeedback(data.feedback as Record<string, string>);
    }
  }, []);

  const load = useCallback(
    async (opts?: { rematch?: boolean; d?: string }) => {
      const d = opts?.d || date;
      const rematch = opts?.rematch || false;
      const cacheKey = `today:${d}`;
      const cached = !rematch ? getCache<TodayCache>(cacheKey) : undefined;

      if (rematch) setBookBusy(true);

      // Instant paint from cache — no full-page spinner on revisit
      if (cached) {
        setMenu(cached.menu);
        setMatch(cached.match);
        setFeedback(cached.feedback || {});
        setWeek(cached.week || []);
        setLoading(false);
      } else {
        setLoading(true);
      }

      setError("");
      setPolishing(false);
      const tz = deviceTimeZone();

      try {
        if (!rematch) {
          const baseRes = await fetch(
            withDeviceTz("/api/match/today", { date: d, phase: "baseline" })
          );
          const baseData = await baseRes.json();
          if (baseRes.ok && baseData.menu) {
            applyPayload(baseData);
            setLoading(false);
            setPolishing(true);
          }
        }

        const res = await fetch(
          rematch
            ? "/api/match/today"
            : withDeviceTz("/api/match/today", { date: d }),
          {
            method: rematch ? "POST" : "GET",
            headers: rematch
              ? { "Content-Type": "application/json" }
              : undefined,
            body: rematch ? JSON.stringify({ date: d, tz }) : undefined,
          }
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load");
        applyPayload(data);

        const w = await fetch(withDeviceTz("/api/week", { date: d })).then(
          (r) => r.json()
        );
        const weekDays = w.days || [];
        setWeek(weekDays);

        // Persist for next navigation
        const m = data.menu as TodayCache["menu"];
        const raw = data.match as MatchData | null;
        let matchSnap: MatchData | null = null;
        if (raw) {
          const payload =
            raw.payload?.items != null
              ? raw.payload
              : {
                  items:
                    (raw as unknown as { items?: MatchItem[] }).items || [],
                  combos:
                    (
                      raw as unknown as {
                        combos?: MatchData["payload"]["combos"];
                      }
                    ).combos || [],
                };
          matchSnap = {
            verdict: raw.verdict,
            score: raw.score,
            headline: raw.headline,
            summary: raw.summary,
            source: raw.source,
            payload: {
              items: payload.items || [],
              combos: payload.combos || [],
            },
          };
        }
        setCache<TodayCache>(
          cacheKey,
          {
            menu: m,
            match: matchSnap,
            feedback:
              (data.feedback as Record<string, string>) ||
              (cached?.feedback ?? {}),
            week: weekDays,
          },
          3 * 60_000
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
        setPolishing(false);
        setBookBusy(false);
      }
    },
    [applyPayload, date]
  );

  useEffect(() => {
    load({ d: date });
  }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

  const items = useMemo(() => match?.payload?.items || [], [match?.payload?.items]);
  const recCount = items.filter((i) => i.decision === "recommended").length;
  const avoidCount = items.filter((i) => i.decision === "avoid").length;

  const filtered = useMemo(() => {
    return items.filter((i) =>
      filter === "all" ? true : i.decision === filter
    );
  }, [items, filter]);

  async function vote(dishName: string, v: "up" | "down") {
    if (!menu?.id) return;
    const res = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ menuDayId: menu.id, dishName, vote: v }),
    });
    const data = await res.json();
    if (res.ok && data.feedback) setFeedback(data.feedback);
  }

  function familyHint(reason: string): string[] | null {
    const m = reason.match(/[“"]([^”"]+)[”"]/);
    const term = (m?.[1] || "").toLowerCase();
    if (term && ALLERGY_FAMILIES[term]) return ALLERGY_FAMILIES[term];
    for (const k of Object.keys(ALLERGY_FAMILIES)) {
      if (reason.toLowerCase().includes(k)) return ALLERGY_FAMILIES[k];
    }
    return null;
  }

  const label = match
    ? verdictLabel[match.verdict] || "Your day"
    : "Today";

  return (
    <Page>
      <PageHeader
        title="Today"
        subtitle={menu?.date || undefined}
        action={
          <>
            <DateNav
              date={date}
              onChange={setDate}
              maxDate={todayOnDevice()}
            />
            {/* Book stays always; pages flip only while rematch is running */}
            <button
              type="button"
              className="icon-btn book-refresh-btn"
              aria-label={bookBusy ? "Refreshing match" : "Refresh match"}
              disabled={bookBusy}
              onClick={() => load({ rematch: true })}
            >
              <BookLoader label="" compact flipping={bookBusy} />
            </button>
          </>
        }
      />

      {week.length > 0 && (
        <div className="week-strip mb-5" role="navigation" aria-label="Week">
          {week.map((d) => (
            <button
              key={d.date}
              type="button"
              className="week-day"
              data-active={d.date === date}
              data-empty={!d.hasMenu}
              onClick={() => d.hasMenu && setDate(d.date)}
              disabled={!d.hasMenu}
            >
              <div className="week-day-name">{weekdayShort(d.date)}</div>
              <div className="week-day-score">
                {d.hasMenu && d.score != null ? d.score : "–"}
              </div>
            </button>
          ))}
        </div>
      )}

      {loading && !match && !menu && <PageSkeleton rows={4} />}

      {error && <Alert tone="bad">{error}</Alert>}

      {!loading && !menu && (
        <EmptyState
          icon={Utensils}
          title="No menu yet"
          body="Usually up by mid-morning. Check again after the café posts."
          action={
            <Link href="/menu" className="btn btn-secondary">
              Open menu
            </Link>
          }
        />
      )}

      {menu && match && (
        <div className="animate-in space-y-5">
          {/* Hero */}
          <Card className="!p-5 sm:!p-6">
            <div className="flex flex-wrap items-center gap-5">
              <ScoreRing score={match.score} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[var(--accent-ink)]">
                  {label}
                </p>
                <h2 className="font-display mt-1 text-[1.35rem] font-semibold tracking-tight text-[var(--ink)] sm:text-[1.55rem]">
                  {match.headline}
                </h2>
                <p className="mt-1.5 text-[0.9375rem] leading-snug text-[var(--muted)]">
                  {recCount} good · {avoidCount} skip
                </p>
                {polishing && (
                  <p className="mt-2 text-xs font-medium text-[var(--muted)]" role="status">
                    Updating…
                  </p>
                )}
                {menu.isFallback && (
                  <p className="mt-1 text-xs text-[var(--caution-ink)]">
                    Showing latest menu ({menu.date})
                  </p>
                )}
                {match.source === "baseline" && !polishing && (
                  <button
                    type="button"
                    className="mt-2 text-xs font-semibold text-[var(--accent)]"
                    onClick={() => load({ rematch: true })}
                  >
                    Refresh match
                  </button>
                )}
              </div>
            </div>
          </Card>

          {match.payload.combos?.length > 0 && (
            <PlateCarousel combos={match.payload.combos} />
          )}

          <div
            className="flex flex-wrap gap-1.5"
            role="radiogroup"
            aria-label="Filter"
          >
            {(
              [
                ["recommended", `Good ${recCount}`],
                ["avoid", `Skip ${avoidCount}`],
                ["all", "All"],
              ] as const
            ).map(([id, text]) => (
              <button
                key={id}
                type="button"
                className="chip"
                role="radio"
                aria-checked={filter === id}
                data-active={filter === id}
                data-tone={
                  id === "recommended" ? "good" : id === "avoid" ? "bad" : undefined
                }
                onClick={() => setFilter(id)}
              >
                {text}
              </button>
            ))}
          </div>

          <div className="card-grid-2">
            {filtered.map((item) => {
              const fam = familyHint(item.reason);
              const open = openWhy === item.name;
              const fb = feedback[item.name];
              const tint =
                item.decision === "recommended"
                  ? "mint"
                  : item.decision === "avoid"
                    ? "rose"
                    : undefined;
              return (
                <Card
                  key={`${item.station}-${item.name}`}
                  tint={tint}
                  className="!p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold tracking-tight text-[var(--ink)]">
                          {item.name}
                        </p>
                        <DecisionBadge decision={item.decision} />
                      </div>
                      <p className="mt-0.5 text-xs capitalize text-[var(--muted)]">
                        {item.meal} · {item.station}
                      </p>
                      <p className="mt-1.5 text-sm leading-snug text-[var(--ink-soft)]">
                        {item.reason}
                      </p>
                      {fam && (
                        <button
                          type="button"
                          className="mt-1.5 inline-flex items-center gap-0.5 text-xs font-semibold text-[var(--lavender-ink)]"
                          onClick={() => setOpenWhy(open ? null : item.name)}
                        >
                          Why
                          <ChevronDown
                            size={12}
                            className={open ? "rotate-180" : undefined}
                          />
                        </button>
                      )}
                      {open && fam && (
                        <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                          Includes: {fam.slice(0, 10).join(", ")}
                          {fam.length > 10 ? "…" : ""}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        className="icon-btn !h-9 !w-9"
                        data-on={
                          fb === "up" || fb === "ate" ? "true" : undefined
                        }
                        aria-label="Helpful"
                        onClick={() => vote(item.name, "up")}
                      >
                        <ThumbsUp size={16} strokeWidth={2} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn !h-9 !w-9"
                        data-on={fb === "down" ? "down" : undefined}
                        aria-label="Wrong"
                        onClick={() => vote(item.name, "down")}
                      >
                        <ThumbsDown size={16} strokeWidth={2} />
                      </button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
          {filtered.length === 0 && (
            <p className="text-sm text-[var(--muted)]">Nothing in this filter.</p>
          )}
        </div>
      )}
    </Page>
  );
}
