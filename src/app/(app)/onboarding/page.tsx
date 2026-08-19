"use client";

import { useState } from "react";
import { Alert, Card, ChipGroup, Page, PageHeader, Spinner } from "@/components/ui";
import { TagInput } from "@/components/tag-input";
import {
  avoidOptionsForDiet,
  DIET_OPTIONS,
  filterHardAvoidsForDiet,
  GOAL_OPTIONS,
} from "@/lib/pref-options";

const steps = [
  { title: "How do you eat?", hint: "Closest fit is fine." },
  { title: "Hard avoids", hint: "We never recommend these." },
  { title: "Allergies", hint: "Most important step." },
  { title: "Goals", hint: "Optional." },
  { title: "Anything else?", hint: "Free text is OK." },
  { title: "Confirm", hint: "Check what we understood." },
];

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [dietType, setDietType] = useState("non_veg");
  const [hardAvoids, setHardAvoids] = useState<string[]>([]);
  const [allergies, setAllergies] = useState<string[]>([]);
  const [goals, setGoals] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<{
    allergies: string[];
    hard_avoids: string[];
    summary: string;
  } | null>(null);

  async function interpretAndConfirm() {
    setLoading(true);
    setError("");
    const res = await fetch("/api/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dietType,
        hardAvoids,
        allergies,
        goals,
        freeformNotes: notes,
        onboardingCompleted: false,
        runAi: true,
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Could not interpret");
      return;
    }
    const interp = data.prefs?.aiInterpretation;
    setPreview({
      allergies: data.prefs?.allergies || allergies,
      hard_avoids: data.prefs?.hardAvoids || hardAvoids,
      summary: data.prefs?.userFacingSummary || interp?.user_facing_summary || "",
    });
    setStep(5);
  }

  async function finish(ok: boolean) {
    setLoading(true);
    setError("");
    if (!ok) {
      // allow edit back
      setStep(2);
      setLoading(false);
      return;
    }
    const res = await fetch("/api/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        onboardingCompleted: true,
        runAi: false,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      setError("Could not finish");
      return;
    }
    window.location.assign("/today");
  }

  async function skip() {
    setLoading(true);
    await fetch("/api/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onboardingCompleted: true, runAi: false }),
    });
    window.location.assign("/today");
  }

  const meta = steps[step];
  const avoidOptions = avoidOptionsForDiet(dietType);
  const hardAvoidHint =
    dietType === "vegan" ||
    dietType === "vegetarian" ||
    dietType === "eggetarian"
      ? "Only extras — we already skip dishes that don’t match your diet."
      : meta.hint;

  return (
    <Page>
      <PageHeader
        title="Your profile"
        subtitle="About a minute"
        action={
          <button type="button" className="btn btn-ghost !text-sm" onClick={skip}>
            Skip
          </button>
        }
      />

      <div className="mb-4 flex gap-1.5">
        {steps.map((_, i) => (
          <div key={i} className="progress-dot" data-on={i <= step} />
        ))}
      </div>

      <Card className="animate-in">
        <p className="text-[0.65rem] font-bold uppercase tracking-wide text-[var(--muted)]">
          {step + 1} / {steps.length}
        </p>
        <h2 className="card-title mt-1 text-xl">{meta.title}</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {step === 1 ? hardAvoidHint : meta.hint}
        </p>

        <div className="mt-5">
          {step === 0 && (
            <ChipGroup
              multi={false}
              options={DIET_OPTIONS}
              selected={[dietType]}
              onChange={(v) => {
                const next = v[0] || "non_veg";
                setDietType(next);
                setHardAvoids((prev) => filterHardAvoidsForDiet(next, prev));
              }}
            />
          )}
          {step === 1 && (
            <ChipGroup
              options={avoidOptions}
              selected={hardAvoids}
              onChange={setHardAvoids}
            />
          )}
          {step === 2 && (
            <TagInput value={allergies} onChange={setAllergies} placeholder="e.g. dairy, beans" />
          )}
          {step === 3 && (
            <ChipGroup options={GOAL_OPTIONS} selected={goals} onChange={setGoals} />
          )}
          {step === 4 && (
            <textarea
              className="field min-h-[100px]"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="lactose intolerant, no raw onion…"
            />
          )}
          {step === 5 && preview && (
            <div className="space-y-3 text-sm">
              <p className="font-semibold text-[var(--ink-soft)]">{preview.summary}</p>
              <div>
                <p className="text-xs font-bold uppercase text-[var(--muted)]">We will avoid</p>
                <p className="mt-1">
                  {[...new Set([...preview.allergies, ...preview.hard_avoids])].join(", ") ||
                    "nothing extra"}
                </p>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="mt-4">
            <Alert tone="bad">{error}</Alert>
          </div>
        )}
        {loading && (
          <div className="mt-4">
            <Spinner label="Working…" />
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          {step > 0 && step < 5 && (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={loading}
              onClick={() => setStep((s) => s - 1)}
            >
              Back
            </button>
          )}
          {step < 4 && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={loading}
              onClick={() => setStep((s) => s + 1)}
            >
              Continue
            </button>
          )}
          {step === 4 && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={loading}
              onClick={interpretAndConfirm}
            >
              Review
            </button>
          )}
          {step === 5 && (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={loading}
                onClick={() => finish(false)}
              >
                Fix allergies
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={loading}
                onClick={() => finish(true)}
              >
                Looks good
              </button>
            </>
          )}
        </div>
      </Card>
    </Page>
  );
}
