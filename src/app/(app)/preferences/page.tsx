"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Card,
  ChipGroup,
  Page,
  PageHeader,
  PageSkeleton,
} from "@/components/ui";
import { TagInput } from "@/components/tag-input";
import {
  avoidOptionsForDiet,
  DIET_OPTIONS,
  filterHardAvoidsForDiet,
  GOAL_OPTIONS,
} from "@/lib/pref-options";
import { todayOnDevice } from "@/lib/client-date";
import { getCache, invalidateCache, setCache } from "@/lib/client-cache";

type Prefs = {
  dietType: string;
  hardAvoids: string[];
  softDislikes: string[];
  likes: string[];
  goals: string[];
  allergies: string[];
  freeformNotes: string;
  userFacingSummary: string;
  temporaryRestrictions: {
    id: string;
    label: string;
    avoidTags: string[];
    startsOn: string;
    endsOn: string;
    reason: string;
  }[];
};

export default function PreferencesPage() {
  const cached0 = getCache<Prefs>("prefs");
  const [prefs, setPrefs] = useState<Prefs | null>(cached0 ?? null);
  const [loading, setLoading] = useState(!cached0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [tempLabel, setTempLabel] = useState("");
  const [tempTags, setTempTags] = useState<string[]>([]);
  const [tempEnd, setTempEnd] = useState("");

  useEffect(() => {
    const cached = getCache<Prefs>("prefs");
    if (cached) {
      setPrefs(cached);
      setLoading(false);
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/preferences");
        const data = await res.json();
        if (cancelled) return;
        setPrefs(data.prefs);
        if (data.prefs) setCache("prefs", data.prefs, 5 * 60_000);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    if (!prefs) return;
    setSaving(true);
    setError("");
    setMessage("Saved — refining…");
    const snapshot = prefs;
    const res = await fetch("/api/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...prefs,
        runAi: true,
        onboardingCompleted: true,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setPrefs(snapshot);
      setError(data.error || "Save failed");
      setMessage("");
      return;
    }
    setPrefs(data.prefs);
    if (data.prefs) setCache("prefs", data.prefs, 5 * 60_000);
    invalidateCache("today:");
    setMessage(data.prefs?.userFacingSummary || "Updated");
  }

  async function addTemp() {
    if (!tempLabel || !tempEnd) return;
    await fetch("/api/preferences/temporary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: tempLabel,
        avoidTags: tempTags,
        startsOn: todayOnDevice(),
        endsOn: tempEnd,
      }),
    });
    setTempLabel("");
    setTempTags([]);
    setTempEnd("");
    const res = await fetch("/api/preferences");
    const data = await res.json();
    setPrefs(data.prefs);
    if (data.prefs) setCache("prefs", data.prefs, 5 * 60_000);
    invalidateCache("today:");
  }

  async function removeTemp(id: string) {
    await fetch(`/api/preferences/temporary?id=${id}`, { method: "DELETE" });
    const res = await fetch("/api/preferences");
    const data = await res.json();
    setPrefs(data.prefs);
    if (data.prefs) setCache("prefs", data.prefs, 5 * 60_000);
    invalidateCache("today:");
  }

  if (loading && !prefs) {
    return (
      <Page>
        <PageHeader title="Preferences" />
        <PageSkeleton rows={5} />
      </Page>
    );
  }

  if (!prefs) {
    return (
      <Page>
        <PageHeader title="Preferences" />
        <Alert tone="bad">Could not load preferences.</Alert>
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        title="Preferences"
        action={
          <button
            type="button"
            className="btn btn-primary"
            disabled={saving}
            onClick={save}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        }
      />

      <div className="animate-in space-y-4">
        {message && <Alert tone="good">{message}</Alert>}
        {error && <Alert tone="bad">{error}</Alert>}

        {prefs.userFacingSummary && (
          <Card className="!p-4">
            <p className="text-sm font-semibold text-[var(--accent-ink)]">
              {prefs.userFacingSummary}
            </p>
          </Card>
        )}

        <div className="card-grid-2">
          <Card className="space-y-3">
            <h2 className="card-title">Diet</h2>
            <ChipGroup
              multi={false}
              options={DIET_OPTIONS}
              selected={[prefs.dietType]}
              onChange={(v) => {
                const dietType = v[0] || "non_veg";
                setPrefs({
                  ...prefs,
                  dietType,
                  hardAvoids: filterHardAvoidsForDiet(
                    dietType,
                    prefs.hardAvoids
                  ),
                });
              }}
            />
          </Card>

          <Card className="space-y-3">
            <h2 className="card-title">Allergies</h2>
            <TagInput
              value={prefs.allergies}
              onChange={(allergies) => setPrefs({ ...prefs, allergies })}
            />
          </Card>

          <Card className="space-y-3">
            <h2 className="card-title">Hard avoids</h2>
            <p className="text-xs text-[var(--muted)]">
              Extras only — your diet already filters mismatched dishes.
            </p>
            <ChipGroup
              options={avoidOptionsForDiet(prefs.dietType)}
              selected={prefs.hardAvoids}
              onChange={(hardAvoids) => setPrefs({ ...prefs, hardAvoids })}
            />
          </Card>

          <Card className="space-y-3">
            <h2 className="card-title">Goals</h2>
            <ChipGroup
              options={GOAL_OPTIONS}
              selected={prefs.goals}
              onChange={(goals) => setPrefs({ ...prefs, goals })}
            />
          </Card>

          <Card className="space-y-3">
            <h2 className="card-title">Notes</h2>
            <textarea
              className="field min-h-[88px]"
              value={prefs.freeformNotes}
              onChange={(e) =>
                setPrefs({ ...prefs, freeformNotes: e.target.value })
              }
              placeholder="Anything free-form…"
            />
          </Card>

          <Card className="space-y-3">
            <h2 className="card-title">Temporary</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                className="field"
                placeholder="Label"
                value={tempLabel}
                onChange={(e) => setTempLabel(e.target.value)}
              />
              <input
                className="field"
                type="date"
                value={tempEnd}
                onChange={(e) => setTempEnd(e.target.value)}
              />
            </div>
            <TagInput value={tempTags} onChange={setTempTags} placeholder="Tags" />
            <button type="button" className="btn btn-secondary" onClick={addTemp}>
              Add
            </button>
            <ul className="space-y-2 text-sm">
              {prefs.temporaryRestrictions?.map((t) => (
                <li
                  key={t.id}
                  className="glass-content flex items-center justify-between gap-2 rounded-xl px-3 py-2"
                >
                  <span>
                    <strong>{t.label}</strong> · until {t.endsOn}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost !py-1 !text-xs"
                    onClick={() => removeTemp(t.id)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </Page>
  );
}
