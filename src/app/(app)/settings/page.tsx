"use client";

import { useEffect, useState } from "react";
import { Alert, Card, Page, PageHeader, PageSkeleton } from "@/components/ui";
import { deviceTimeZone } from "@/lib/client-date";
import { getCache, setCache } from "@/lib/client-cache";

type SettingsCache = {
  name: string;
  emailEnabled: boolean;
  emailTimeLocal: string;
  timezone: string;
  digest: {
    createdAt: string;
    payload: { headline?: string; summary?: string };
  } | null;
};

export default function SettingsPage() {
  const cached0 = getCache<SettingsCache>("settings");
  const [loading, setLoading] = useState(!cached0);
  const [emailEnabled, setEmailEnabled] = useState(
    cached0?.emailEnabled ?? false
  );
  const [emailTimeLocal, setEmailTimeLocal] = useState(
    cached0?.emailTimeLocal || "07:00"
  );
  const [timezone, setTimezone] = useState(cached0?.timezone || "");
  const [deviceTz, setDeviceTz] = useState("");
  const [name, setName] = useState(cached0?.name || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [digest, setDigest] = useState<{
    createdAt: string;
    payload: { headline?: string; summary?: string };
  } | null>(cached0?.digest ?? null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    const detected = deviceTimeZone();
    setDeviceTz(detected);
    const cached = getCache<SettingsCache>("settings");
    if (cached) {
      setName(cached.name);
      setEmailEnabled(cached.emailEnabled);
      setEmailTimeLocal(cached.emailTimeLocal);
      setTimezone(cached.timezone || detected);
      setDigest(cached.digest);
      setLoading(false);
    } else if (!timezone) {
      setTimezone(detected);
    }
    let cancelled = false;
    (async () => {
      try {
        const me = await fetch("/api/me").then((r) => r.json());
        if (cancelled) return;
        const n = me.user?.name || "";
        if (n) setName(n);
        let en = false;
        let t = "07:00";
        let tz = detected;
        if (me.prefs) {
          en = !!me.prefs.emailEnabled;
          t = me.prefs.emailTimeLocal || "07:00";
          tz = me.prefs.timezone || detected;
          setEmailEnabled(en);
          setEmailTimeLocal(t);
          setTimezone(tz);
        } else setTimezone(detected);
        const d = await fetch("/api/digests/latest").then((r) => r.json());
        if (cancelled) return;
        setDigest(d.digest);
        setCache<SettingsCache>(
          "settings",
          {
            name: n || name,
            emailEnabled: en,
            emailTimeLocal: t,
            timezone: tz,
            digest: d.digest,
          },
          2 * 60_000
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function sendTest() {
    setMessage("");
    setError("");
    setTesting(true);
    try {
      const res = await fetch("/api/digests/test", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Test send failed");
        return;
      }
      setMessage(data.message || "Test digest sent");
      const d = await fetch("/api/digests/latest").then((r) => r.json());
      setDigest(d.digest);
    } catch {
      setError("Test send failed");
    } finally {
      setTesting(false);
    }
  }

  async function saveDigest() {
    setMessage("");
    setError("");
    const res = await fetch("/api/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        emailEnabled,
        emailTimeLocal,
        timezone,
        runAi: false,
      }),
    });
    if (res.ok) setMessage("Digest settings saved");
    else setError("Could not save");
  }

  async function saveAccount() {
    setMessage("");
    setError("");
    const res = await fetch("/api/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        currentPassword: currentPassword || undefined,
        newPassword: newPassword || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Update failed");
      return;
    }
    setMessage("Account updated");
    setCurrentPassword("");
    setNewPassword("");
  }

  if (loading) {
    return (
      <Page>
        <PageHeader title="Settings" />
        <PageSkeleton rows={4} />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader title="Settings" />

      <div className="space-y-4">
        {message && <Alert tone="good">{message}</Alert>}
        {error && <Alert tone="bad">{error}</Alert>}

        <div className="card-grid-2">
          <Card className="space-y-3">
            <h2 className="card-title">Morning digest</h2>
            <p className="text-sm text-[var(--muted)]">
              Get today’s fit, good picks, and skips by email at a time you choose.
            </p>
            <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold">
              <input
                type="checkbox"
                checked={emailEnabled}
                onChange={(e) => setEmailEnabled(e.target.checked)}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              Enable email digests
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Time</label>
                <input
                  className="field"
                  type="time"
                  value={emailTimeLocal}
                  onChange={(e) => setEmailTimeLocal(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Timezone</label>
                <input
                  className="field"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                />
                {deviceTz && timezone !== deviceTz && (
                  <button
                    type="button"
                    className="btn btn-secondary mt-2 !py-1.5 !text-xs"
                    onClick={() => setTimezone(deviceTz)}
                  >
                    Use device timezone
                  </button>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-primary" onClick={saveDigest}>
                Save
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={testing}
                onClick={sendTest}
              >
                {testing ? "Sending…" : "Send test email"}
              </button>
            </div>
          </Card>

          <Card className="space-y-3">
            <h2 className="card-title">Latest digest</h2>
            {!digest && (
              <p className="text-sm text-[var(--muted)]">None yet.</p>
            )}
            {digest && (
              <div>
                {(() => {
                  const when = new Date(digest.createdAt);
                  const dateChip = when.toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  });
                  const timeChip = when.toLocaleTimeString(undefined, {
                    hour: "numeric",
                    minute: "2-digit",
                  });
                  return (
                    <div className="flex flex-wrap gap-1.5" aria-label="Sent at">
                      <span className="chip !cursor-default !py-1 !text-xs pointer-events-none">
                        {dateChip}
                      </span>
                      <span className="chip !cursor-default !py-1 !text-xs pointer-events-none">
                        {timeChip}
                      </span>
                    </div>
                  );
                })()}
                <p className="card-title mt-2.5">{digest.payload.headline}</p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {digest.payload.summary}
                </p>
              </div>
            )}
          </Card>

          <Card className="space-y-3 span-full">
            <h2 className="card-title">Account</h2>
            <div>
              <label className="label">Name</label>
              <input
                className="field field-narrow"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="grid max-w-xl gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Current password</label>
                <input
                  className="field"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
              <div>
                <label className="label">New password</label>
                <input
                  className="field"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
            </div>
            <button type="button" className="btn btn-secondary" onClick={saveAccount}>
              Update account
            </button>
          </Card>
        </div>
      </div>
    </Page>
  );
}
