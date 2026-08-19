"use client";

import { SessionProvider } from "next-auth/react";
import { TimezoneSync } from "./timezone-sync";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <TimezoneSync />
      {children}
    </SessionProvider>
  );
}
