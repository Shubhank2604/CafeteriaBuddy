"use client";

import { useSession } from "next-auth/react";
import { useEffect } from "react";
import { deviceTimeZone } from "@/lib/client-date";

/**
 * Silently keeps the user's profile timezone aligned with their device.
 * No UI — runs once per session when logged in.
 */
export function TimezoneSync() {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.id) return;

    const tz = deviceTimeZone();
    const storageKey = `menu-match:tz:${session.user.id}`;
    try {
      if (sessionStorage.getItem(storageKey) === tz) return;
    } catch {
      /* private mode */
    }

    fetch("/api/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timezone: tz, runAi: false }),
    })
      .then((res) => {
        if (!res.ok) return;
        try {
          sessionStorage.setItem(storageKey, tz);
        } catch {
          /* ignore */
        }
      })
      .catch(() => {
        /* offline / not ready */
      });
  }, [status, session?.user?.id]);

  return null;
}
