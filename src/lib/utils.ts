export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/**
 * Fallback only when no device/user timezone is available (server cron, etc.).
 * Prefer: client `deviceTimeZone()` → user prefs.timezone → this env default.
 */
export const OFFICE_TIMEZONE =
  process.env.OFFICE_TIMEZONE?.trim() || "UTC";

/**
 * Calendar YYYY-MM-DD in a given IANA timezone.
 * Never use bare `toISOString().slice(0,10)` for "today" — that is always UTC
 * and will disagree with the user's phone/laptop clock near midnight.
 */
export function todayISO(date = new Date(), timeZone = OFFICE_TIMEZONE) {
  try {
    // en-CA yields YYYY-MM-DD
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    // Invalid zone → local offset approximation via formatToParts is hard; use UTC
    return date.toISOString().slice(0, 10);
  }
}

/** Resolve "which calendar day" for a request: explicit date, else today in tz. */
export function resolveMenuDate(options?: {
  date?: string | null;
  timeZone?: string | null;
}): string {
  if (options?.date && /^\d{4}-\d{2}-\d{2}$/.test(options.date)) {
    return options.date;
  }
  const tz = options?.timeZone?.trim() || OFFICE_TIMEZONE;
  return todayISO(new Date(), tz);
}

export function nowISO() {
  return new Date().toISOString();
}

export function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const t = v.trim().toLowerCase();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

export function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
