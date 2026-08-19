"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDaysISO } from "@/lib/dates";

export function DateNav({
  date,
  onChange,
  maxDate,
}: {
  date: string;
  onChange: (next: string) => void;
  maxDate?: string;
}) {
  const canNext = !maxDate || date < maxDate;

  return (
    <div className="date-nav">
      <button
        type="button"
        className="icon-btn !h-9 !w-9"
        aria-label="Previous day"
        onClick={() => onChange(addDaysISO(date, -1))}
      >
        <ChevronLeft size={18} strokeWidth={2} />
      </button>
      <span className="date-nav-value">{date.slice(5)}</span>
      <button
        type="button"
        className="icon-btn !h-9 !w-9"
        aria-label="Next day"
        disabled={!canNext}
        onClick={() => canNext && onChange(addDaysISO(date, 1))}
      >
        <ChevronRight size={18} strokeWidth={2} />
      </button>
    </div>
  );
}
