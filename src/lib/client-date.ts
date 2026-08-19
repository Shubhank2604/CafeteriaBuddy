/**
 * Browser-only date helpers. Uses the device IANA timezone automatically
 * (e.g. America/Los_Angeles, Asia/Kolkata) via the Intl API — no hardcoding.
 */

import { todayISO } from "./utils";

/** Device IANA zone, e.g. "America/New_York". Falls back to UTC. */
export function deviceTimeZone(): string {
  try {
    return (
      Intl.DateTimeFormat().resolvedOptions().timeZone ||
      "UTC"
    );
  } catch {
    return "UTC";
  }
}

/** "Today" as YYYY-MM-DD in the device (or provided) timezone. */
export function todayOnDevice(timeZone = deviceTimeZone()): string {
  return todayISO(new Date(), timeZone);
}

/** Append ?tz= / &tz= for APIs so server resolves the same calendar day. */
export function withDeviceTz(
  path: string,
  extra?: Record<string, string | undefined>
): string {
  const url = new URL(path, "http://local.invalid");
  url.searchParams.set("tz", deviceTimeZone());
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v != null && v !== "") url.searchParams.set(k, v);
    }
  }
  return url.pathname + url.search;
}
