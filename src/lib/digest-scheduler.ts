/**
 * Lightweight in-process digest scheduler.
 * Checks once a minute; honors each user's emailTimeLocal + timezone.
 * (For production, prefer Vercel Cron hitting /api/admin/digests/tick.)
 */

import { runDueDigests } from "./services";

const g = globalThis as unknown as { __menuMatchDigestTimer?: NodeJS.Timeout };

export function startDigestScheduler() {
  if (typeof window !== "undefined") return;
  if (g.__menuMatchDigestTimer) return;
  if (process.env.DIGEST_SCHEDULER === "0") return;

  g.__menuMatchDigestTimer = setInterval(() => {
    runDueDigests().then((r) => {
      if (r.sent > 0) console.log(`[digest-scheduler] sent ${r.sent}`);
    }).catch((e) => console.error("[digest-scheduler]", e));
  }, 60_000);

  // don't keep process alive solely for timer in some envs
  g.__menuMatchDigestTimer.unref?.();
  console.log("[digest-scheduler] started (1m tick)");
}
