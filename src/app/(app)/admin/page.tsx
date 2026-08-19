"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import {
  Camera,
  Eye,
  LayoutDashboard,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import {
  Alert,
  Card,
  Page,
  PageHeader,
  Spinner,
  StatPill,
} from "@/components/ui";
import { deviceTimeZone, todayOnDevice } from "@/lib/client-date";

type Tab = "overview" | "post" | "extract" | "team" | "preview";
type MealChoice = "breakfast" | "lunch";

type FlatItem = {
  id: string;
  meal: string;
  station: string;
  name: string;
  tags: string[];
};

type Overview = {
  today: string;
  menu: { date: string; itemCount: number; matchCount: number; id?: string } | null;
  stats: {
    employees: number;
    admins: number;
    digestOptIn: number;
    menuDays: number;
  };
  recentMenus: {
    id: string;
    date: string;
    itemCount: number;
    matchCount: number;
  }[];
};

export default function AdminPage() {
  const { data: session } = useSession();
  const [tab, setTab] = useState<Tab>("overview");
  const [date, setDate] = useState(() => todayOnDevice());
  const [deviceTz] = useState(() => deviceTimeZone());
  const [file, setFile] = useState<File | null>(null);
  const [meal, setMeal] = useState<MealChoice>("lunch");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [stage, setStage] = useState("");
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [flatItems, setFlatItems] = useState<FlatItem[]>([]);
  const [menuDayId, setMenuDayId] = useState<string | null>(null);
  const [employees, setEmployees] = useState<
    { id: string; name: string; email: string; isAdmin: boolean }[]
  >([]);
  const [previewDiet, setPreviewDiet] = useState("vegetarian");
  const [previewAllergies, setPreviewAllergies] = useState("dairy");
  const [previewResult, setPreviewResult] = useState<{
    score: number;
    rec: number;
    avoid: number;
    items: { name: string; decision: string; reason: string }[];
  } | null>(null);

  const loadOverview = useCallback(async () => {
    const res = await fetch("/api/admin/overview");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed");
    setOverview(data);
  }, []);

  const loadExtract = useCallback(async (d: string) => {
    const res = await fetch(`/api/admin/menus?date=${encodeURIComponent(d)}`);
    if (res.status === 404) {
      setFlatItems([]);
      setMenuDayId(null);
      return;
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed");
    setMenuDayId(data.id);
    // Prefer flatItems with ids
    if (data.flatItems) setFlatItems(data.flatItems);
    else {
      const flat: FlatItem[] = [];
      for (const meal of data.menu?.meals || []) {
        for (const st of meal.stations || []) {
          for (const it of st.items || []) {
            flat.push({
              id: it.id || `${meal.type}-${st.name}-${it.name}`,
              meal: meal.type,
              station: st.name,
              name: it.name,
              tags: it.tags || [],
            });
          }
        }
      }
      setFlatItems(flat);
    }
  }, []);

  const loadTeam = useCallback(async () => {
    const res = await fetch("/api/admin/users");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed");
    setEmployees(data.users || []);
  }, []);

  const refreshAll = useCallback(async (opts?: { soft?: boolean }) => {
    // Soft: no full-panel spinner when data already on screen
    if (!opts?.soft) setBooting(true);
    setError("");
    try {
      await Promise.all([loadOverview(), loadExtract(date), loadTeam()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setBooting(false);
    }
  }, [date, loadExtract, loadOverview, loadTeam]);

  useEffect(() => {
    if (session?.user?.isAdmin) refreshAll();
    else setBooting(false);
    // Only re-run when admin session becomes available — not on every callback identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.isAdmin]);

  if (session && !session.user?.isAdmin) {
    return (
      <Page>
        <Alert tone="bad">Admin only.</Alert>
        <Link href="/today" className="btn btn-secondary mt-4">
          Back
        </Link>
      </Page>
    );
  }

  function onFile(f: File | null) {
    setFile(f);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(f ? URL.createObjectURL(f) : null);
  }

  async function upload() {
    if (!file) {
      setError("Choose a photo");
      return;
    }
    setLoading(true);
    setError("");
    setMessage("");
    try {
      setStage("Uploading");
      const form = new FormData();
      form.append("file", file);
      form.append("date", date);
      form.append("meal", meal);
      setStage("Reading photo");
      const res = await fetch("/api/admin/menu", { method: "POST", body: form });
      setStage("Structuring menu");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setStage("Done");
      setMessage(`Live · ${data.menu ? "extracted" : "saved"} for ${date}`);
      setFile(null);
      onFile(null);
      await refreshAll();
      setTab("extract");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
      setStage("");
    }
  }

  async function loadSample(useAi: boolean) {
    setLoading(true);
    setError("");
    try {
      setStage(useAi ? "AI sample…" : "Fixture…");
      const res = await fetch("/api/admin/menu/sample", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, useAi }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setMessage(`Sample ready for ${date}`);
      await refreshAll();
      setTab("extract");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
      setStage("");
    }
  }

  async function patchItem(item: FlatItem, patch: Partial<FlatItem> & { delete?: boolean }) {
    if (!menuDayId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/menu/items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          menuDayId,
          itemId: item.id,
          name: patch.name,
          tags: patch.tags,
          delete: patch.delete,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      await loadExtract(date);
      setMessage("Menu updated · matches cleared");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function runPreview() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          dietType: previewDiet,
          allergies: previewAllergies
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setPreviewResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function toggleAdmin(userId: string, isAdmin: boolean) {
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, isAdmin }),
    });
    if (res.ok) await loadTeam();
  }

  async function deleteDay(d: string) {
    if (!confirm(`Delete ${d}?`)) return;
    await fetch(`/api/admin/menus?date=${encodeURIComponent(d)}`, {
      method: "DELETE",
    });
    await refreshAll();
  }

  const tabs: { id: Tab; label: string; Icon: typeof LayoutDashboard }[] = [
    { id: "overview", label: "Home", Icon: LayoutDashboard },
    { id: "post", label: "Post", Icon: Upload },
    { id: "extract", label: "Edit", Icon: Camera },
    { id: "preview", label: "Preview", Icon: Eye },
    { id: "team", label: "Team", Icon: Users },
  ];

  return (
    <Page>
      <PageHeader
        title="Admin"
        action={
          <button
            type="button"
            className="btn btn-secondary !text-sm"
            onClick={() => refreshAll()}
            disabled={loading || booting}
          >
            Refresh
          </button>
        }
      />

      <div className="mb-5 flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className="nav-pill"
            data-active={tab === t.id}
            onClick={() => setTab(t.id)}
          >
            <t.Icon size={18} strokeWidth={2} />
            {t.label}
          </button>
        ))}
      </div>

      {message && <Alert tone="good">{message}</Alert>}
      {error && (
        <div className="mt-2">
          <Alert tone="bad">{error}</Alert>
        </div>
      )}
      {(loading || booting) && (
        <div className="mt-2">
          <Spinner label={stage || "Working…"} />
        </div>
      )}

      <div className="mt-4 space-y-4">
        {(tab === "post" || tab === "extract" || tab === "preview") && (
          <Card className="!p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="label">Date</label>
                <input
                  className="field max-w-xs"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <button
                type="button"
                className="btn btn-secondary !text-sm"
                onClick={() => setDate(todayOnDevice(deviceTz))}
              >
                Device today
              </button>
              <button
                type="button"
                className="btn btn-secondary !text-sm"
                onClick={() => loadExtract(date)}
              >
                Load
              </button>
            </div>
          </Card>
        )}

        {tab === "overview" && overview && (
          <>
            <Card>
              <p className="card-title">
                {overview.menu
                  ? `Live · ${overview.menu.itemCount} dishes · ${overview.menu.date}`
                  : "No menu for office today"}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setTab("post")}
                >
                  Post menu
                </button>
                {overview.menu && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setDate(overview.menu!.date);
                      setTab("extract");
                    }}
                  >
                    Edit extraction
                  </button>
                )}
              </div>
            </Card>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatPill label="People" value={overview.stats.employees} tone="lavender" />
              <StatPill label="Admins" value={overview.stats.admins} tone="peach" />
              <StatPill label="Digest" value={overview.stats.digestOptIn} tone="mint" />
              <StatPill label="Days" value={overview.stats.menuDays} tone="butter" />
            </div>
            <Card>
              <h3 className="card-title">Recent</h3>
              <ul className="mt-2 divide-y divide-[var(--line)]">
                {overview.recentMenus.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between gap-2 py-2 text-sm"
                  >
                    <span>
                      <strong>{m.date}</strong> · {m.itemCount} dishes
                    </span>
                    <button
                      type="button"
                      className="icon-btn !h-8 !w-8"
                      onClick={() => deleteDay(m.date)}
                      aria-label="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          </>
        )}

        {tab === "post" && (
          <>
            <Card className="space-y-3">
              <h2 className="card-title">Sample</h2>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={loading}
                  onClick={() => loadSample(true)}
                >
                  Sample + AI
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={loading}
                  onClick={() => loadSample(false)}
                >
                  Fixture
                </button>
              </div>
            </Card>
            <Card
              className="space-y-3"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) onFile(f);
              }}
            >
              <h2 className="card-title">Upload photo</h2>
              <p className="text-sm text-[var(--muted)]">
                Drop image or pick · max 8MB · camera OK on phone
              </p>
              <div
                className="grid grid-cols-2 gap-2"
                role="group"
                aria-label="Menu meal"
              >
                {(["breakfast", "lunch"] as const).map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    className={
                      meal === choice ? "btn btn-primary" : "btn btn-secondary"
                    }
                    aria-pressed={meal === choice}
                    onClick={() => setMeal(choice)}
                  >
                    {choice === "breakfast" ? "Breakfast" : "Lunch"}
                  </button>
                ))}
              </div>
              <input
                type="file"
                accept="image/jpeg,image/png"
                capture="environment"
                className="block w-full text-sm"
                onChange={(e) => onFile(e.target.files?.[0] || null)}
              />
              {previewUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="max-h-56 w-full rounded-xl object-contain bg-black/5"
                />
              )}
              <button
                type="button"
                className="btn btn-primary"
                disabled={loading || !file}
                onClick={upload}
              >
                Upload & extract
              </button>
            </Card>
          </>
        )}

        {tab === "extract" && (
          <Card>
            <h2 className="card-title">
              Extraction · {flatItems.length} dishes
            </h2>
            {flatItems.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--muted)]">
                Nothing for this date. Post first.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {flatItems.map((it) => (
                  <li
                    key={it.id}
                    className="rounded-xl border border-[var(--line)] p-3"
                  >
                    <div className="flex flex-wrap gap-2">
                      <input
                        className="field !py-1.5"
                        value={it.name}
                        onChange={(e) =>
                          setFlatItems((rows) =>
                            rows.map((r) =>
                              r.id === it.id
                                ? { ...r, name: e.target.value }
                                : r
                            )
                          )
                        }
                        onBlur={() => patchItem(it, { name: it.name })}
                      />
                      <input
                        className="field !py-1.5"
                        value={it.tags.join(", ")}
                        onChange={(e) =>
                          setFlatItems((rows) =>
                            rows.map((r) =>
                              r.id === it.id
                                ? {
                                    ...r,
                                    tags: e.target.value
                                      .split(",")
                                      .map((s) => s.trim())
                                      .filter(Boolean),
                                  }
                                : r
                            )
                          )
                        }
                        onBlur={() => patchItem(it, { tags: it.tags })}
                        placeholder="tags"
                      />
                      <button
                        type="button"
                        className="icon-btn !h-9 !w-9"
                        onClick={() => patchItem(it, { delete: true })}
                        aria-label="Delete dish"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {it.meal} · {it.station}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {tab === "preview" && (
          <Card className="space-y-3">
            <h2 className="card-title">Preview as employee</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <label className="label">Diet</label>
                <select
                  className="field"
                  value={previewDiet}
                  onChange={(e) => setPreviewDiet(e.target.value)}
                >
                  <option value="vegan">Vegan</option>
                  <option value="vegetarian">Vegetarian</option>
                  <option value="eggetarian">Eggetarian</option>
                  <option value="non_veg">Non-veg</option>
                </select>
              </div>
              <div>
                <label className="label">Allergies (comma)</label>
                <input
                  className="field"
                  value={previewAllergies}
                  onChange={(e) => setPreviewAllergies(e.target.value)}
                />
              </div>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={loading}
              onClick={runPreview}
            >
              Run preview
            </button>
            {previewResult && (
              <div className="mt-2 space-y-2 text-sm">
                <p className="card-title">
                  Fit {previewResult.score} · Good {previewResult.rec} · Skip{" "}
                  {previewResult.avoid}
                </p>
                <ul className="max-h-64 space-y-1 overflow-auto">
                  {previewResult.items.slice(0, 40).map((i) => (
                    <li key={i.name}>
                      <strong>{i.decision}</strong> {i.name}{" "}
                      <span className="text-[var(--muted)]">— {i.reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        )}

        {tab === "team" && (
          <Card>
            <h2 className="card-title">Team</h2>
            <ul className="mt-3 divide-y divide-[var(--line)]">
              {employees.map((u) => (
                <li
                  key={u.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"
                >
                  <div>
                    <p className="font-bold">
                      {u.name}
                      {u.isAdmin ? " · admin" : ""}
                    </p>
                    <p className="text-[var(--muted)]">{u.email}</p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary !py-1.5 !text-xs"
                    disabled={u.id === session?.user?.id}
                    onClick={() => toggleAdmin(u.id, !u.isAdmin)}
                  >
                    {u.isAdmin ? "Remove admin" : "Make admin"}
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </Page>
  );
}
