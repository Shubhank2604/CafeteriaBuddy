"use client";

import { useCallback, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type PlateCard = {
  title: string;
  items: string[];
  why?: string;
  itemReasons?: string[];
};

/**
 * Cylinder / cover-flow: center card full, left & right half-peek + soft blur.
 * Tap side (or chevrons) to rotate.
 */
const SLOT_ORDER = ["Breakfast idea", "Lunch idea", "Salad bowl"] as const;
/** Hard cap so fixed-height cards never crop a 4th/5th line */
const MAX_ITEMS_PER_CARD = 3;

function normalizeSlots(combos: PlateCard[]): PlateCard[] {
  return SLOT_ORDER.map((title) => {
    const found = combos.find(
      (c) =>
        c.title === title ||
        c.title.toLowerCase().includes(title.split(" ")[0].toLowerCase())
    );
    if (found) {
      return {
        ...found,
        title,
        items: (found.items || []).slice(0, MAX_ITEMS_PER_CARD),
        itemReasons: found.itemReasons?.slice(0, MAX_ITEMS_PER_CARD),
      };
    }
    return {
      title,
      items: [],
      why:
        title === "Salad bowl"
          ? "Few salad toppings fit you today — check the bar"
          : `Thin ${title.replace(" idea", "").toLowerCase()} options for you today`,
    };
  });
}

export function PlateCarousel({
  combos,
}: {
  combos: PlateCard[];
}) {
  const slots = normalizeSlots(combos);
  const n = slots.length; // always 3
  const [active, setActive] = useState(1); // lunch center by default
  const touchX = useRef<number | null>(null);

  const rotate = useCallback(
    (dir: -1 | 1) => {
      setActive((i) => (i + dir + n) % n);
    },
    [n]
  );

  // Relative position: -1 left, 0 center, +1 right (shortest wrap)
  function rel(i: number) {
    let d = i - active;
    if (d > n / 2) d -= n;
    if (d < -n / 2) d += n;
    return d;
  }

  return (
    <div className="plate-carousel">
      <p className="section-title px-1">Plate ideas</p>
      <div
        className="plate-carousel-stage card"
        onTouchStart={(e) => {
          touchX.current = e.changedTouches[0]?.clientX ?? null;
        }}
        onTouchEnd={(e) => {
          if (touchX.current == null) return;
          const x = e.changedTouches[0]?.clientX ?? touchX.current;
          const dx = x - touchX.current;
          touchX.current = null;
          if (Math.abs(dx) < 40) return;
          rotate(dx < 0 ? 1 : -1);
        }}
      >
        {/* Inner track = carousel only; outer uses same .card chrome as score card */}
        <div className="plate-carousel-track">
          {slots.map((c, i) => {
            const r = rel(i);
            const role =
              r === 0 ? "center" : r === -1 ? "left" : r === 1 ? "right" : "hidden";
            return (
              <button
                key={c.title}
                type="button"
                className={cn("plate-carousel-card", `is-${role}`)}
                data-role={role}
                tabIndex={role === "center" ? 0 : -1}
                aria-current={role === "center" ? "true" : undefined}
                aria-label={`${c.title}${role === "center" ? " (selected)" : ", bring to center"}`}
                onClick={() => {
                  if (role === "left") rotate(-1);
                  else if (role === "right") rotate(1);
                }}
              >
                <div className="plate-carousel-card-inner card">
                  <p className="card-title">{c.title}</p>
                  {c.items.length === 0 ? (
                    <p className="mt-2 text-sm text-[var(--muted)]">
                      {c.why || "No strong picks today"}
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-1 text-[0.9375rem] text-[var(--ink-soft)]">
                      {c.items.map((name) => (
                        <li key={name}>{name}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="plate-carousel-controls">
        <button
          type="button"
          className="icon-btn"
          aria-label="Previous plate idea"
          onClick={() => rotate(-1)}
        >
          <ChevronLeft size={18} strokeWidth={2} />
        </button>
        <div className="plate-carousel-dots" role="tablist" aria-label="Plate ideas">
          {slots.map((c, i) => (
            <button
              key={c.title}
              type="button"
              role="tab"
              aria-selected={i === active}
              className="plate-carousel-dot"
              data-active={i === active}
              onClick={() => setActive(i)}
              aria-label={c.title}
            />
          ))}
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label="Next plate idea"
          onClick={() => rotate(1)}
        >
          <ChevronRight size={18} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
