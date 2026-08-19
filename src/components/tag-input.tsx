"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { ALLERGY_FAMILIES } from "@/lib/matching";

const SUGGESTIONS = Object.keys(ALLERGY_FAMILIES).sort();

export function TagInput({
  value,
  onChange,
  placeholder = "Type and press Enter",
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");

  const hints = useMemo(() => {
    const q = draft.trim().toLowerCase();
    if (!q) return SUGGESTIONS.filter((s) => !value.includes(s)).slice(0, 8);
    return SUGGESTIONS.filter(
      (s) => s.includes(q) && !value.includes(s)
    ).slice(0, 8);
  }, [draft, value]);

  function add(tag: string) {
    const t = tag.trim().toLowerCase();
    if (!t || value.includes(t)) return;
    onChange([...value, t]);
    setDraft("");
  }

  function remove(tag: string) {
    onChange(value.filter((v) => v !== tag));
  }

  return (
    <div>
      <div className="field flex flex-wrap gap-1.5 !py-2">
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-0.5 rounded-full bg-[var(--bg)] px-2.5 py-1 text-xs font-semibold text-[var(--ink)] ring-1 ring-black/10"
          >
            {tag}
            <button
              type="button"
              className="ml-0.5 text-[var(--muted)] hover:text-[var(--ink)]"
              onClick={() => remove(tag)}
              aria-label={`Remove ${tag}`}
            >
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          className="min-w-[8rem] flex-1 bg-transparent px-1 py-1 text-sm text-[var(--ink)] outline-none placeholder:text-[#8e8e93]"
          value={draft}
          placeholder={value.length ? "" : placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add(draft.replace(/,/g, ""));
            }
            if (e.key === "Backspace" && !draft && value.length) {
              remove(value[value.length - 1]);
            }
          }}
        />
      </div>
      {hints.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {hints.map((h) => (
            <button
              key={h}
              type="button"
              className="chip !py-1 !text-xs"
              onClick={() => add(h)}
            >
              + {h}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
