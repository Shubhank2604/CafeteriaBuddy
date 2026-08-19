"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { ClipboardList } from "lucide-react";
import {
  Card,
  EmptyState,
  Page,
  PageHeader,
  PageSkeleton,
} from "@/components/ui";
import { DateNav } from "@/components/date-nav";
import { todayOnDevice, withDeviceTz } from "@/lib/client-date";
import { getCache, setCache } from "@/lib/client-cache";

type MenuPack = {
  date: string;
  sourceImagePath?: string | null;
  isFallback?: boolean;
  menu: {
    meals: {
      type: string;
      stations: { name: string; items: { name: string; tags: string[] }[] }[];
    }[];
  };
};

export default function MenuPage() {
  const [date, setDate] = useState(() => todayOnDevice());
  const cached0 = getCache<MenuPack | null>(`menu:${todayOnDevice()}`);
  const [loading, setLoading] = useState(cached0 === undefined);
  const [menu, setMenu] = useState<MenuPack | null>(
    cached0 === undefined ? null : cached0
  );
  const [mealFilter, setMealFilter] = useState<
    "all" | "breakfast" | "lunch" | "salad"
  >("all");

  useEffect(() => {
    const key = `menu:${date}`;
    const cached = getCache<MenuPack | null>(key);
    if (cached !== undefined) {
      setMenu(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(withDeviceTz("/api/menu/today", { date }));
        const data = await res.json();
        if (cancelled) return;
        setMenu(data.menu ?? null);
        setCache(key, data.menu ?? null, 3 * 60_000);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [date]);

  const stations = useMemo(() => {
    if (!menu) return [];
    const all = menu.menu.meals.flatMap((meal) =>
      meal.stations.map((st) => ({
        ...st,
        meal: meal.type,
        alwaysOn: st.name === "Salad Compose",
      }))
    );
    if (mealFilter === "salad") {
      return all.filter((st) => st.alwaysOn);
    }
    if (mealFilter === "breakfast") {
      return all.filter(
        (st) =>
          !st.alwaysOn && String(st.meal).toLowerCase() === "breakfast"
      );
    }
    if (mealFilter === "lunch") {
      // Lunch specials + always-on salad bar
      return all.filter(
        (st) =>
          st.alwaysOn || String(st.meal).toLowerCase() === "lunch"
      );
    }
    return all;
  }, [menu, mealFilter]);

  return (
    <Page>
      <PageHeader
        title="Menu"
        subtitle={menu?.date}
        action={
          <DateNav date={date} onChange={setDate} maxDate={todayOnDevice()} />
        }
      />

      {loading && !menu && <PageSkeleton rows={4} />}

      {!loading && !menu && (
        <EmptyState
          icon={ClipboardList}
          title="Nothing posted"
          body="Menus usually land mid-morning."
        />
      )}

      {menu && (
        <div className="animate-in space-y-5">
          {menu.isFallback && (
            <p className="text-xs font-semibold text-[var(--muted)]">
              Latest posted · {menu.date}
            </p>
          )}

          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Meal">
            {(
              [
                ["all", "All"],
                ["breakfast", "Breakfast"],
                ["lunch", "Lunch"],
                ["salad", "Salad"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className="chip"
                role="radio"
                aria-checked={mealFilter === id}
                data-active={mealFilter === id}
                onClick={() => setMealFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>

          {menu.sourceImagePath && (
            <Card className="!overflow-hidden !p-2">
              <div className="overflow-hidden rounded-[12px]">
                <Image
                  src={menu.sourceImagePath}
                  alt="Today’s café menu"
                  width={1200}
                  height={1200}
                  className="mx-auto h-auto max-h-[320px] w-full object-contain"
                  unoptimized
                />
              </div>
            </Card>
          )}

          <div className="card-grid-2">
            {stations.map((st) => (
              <Card key={`${st.meal}-${st.name}`}>
                <p className="text-[0.68rem] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">
                  {st.alwaysOn
                    ? "Always available"
                    : `${st.meal} · ${st.name}`}
                </p>
                {st.alwaysOn && (
                  <p className="card-title mt-1 text-base">Salad Compose</p>
                )}
                {!st.alwaysOn && (
                  <p className="mt-0.5 text-sm font-semibold text-[var(--ink)]">
                    {st.name}
                  </p>
                )}
                <ul className="mt-2">
                  {st.items.map((it) => (
                    <li key={it.name} className="dish-line">
                      <span>{it.name}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
          {stations.length === 0 && (
            <p className="text-sm text-[var(--muted)]">No stations in this meal.</p>
          )}
        </div>
      )}
    </Page>
  );
}
