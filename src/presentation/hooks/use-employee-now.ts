"use client";

import { useEffect, useState } from "react";

/** A server-anchored clock shared by every control in an employee view. */
export function useEmployeeNow(snapshotAt?: number) {
  const [now, setNow] = useState(snapshotAt ?? Date.now());
  useEffect(() => {
    const clientAnchor = Date.now();
    const serverAnchor = snapshotAt ?? clientAnchor;
    const tick = () =>
      setNow(serverAnchor + Math.max(0, Date.now() - clientAnchor));
    const timer = window.setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    tick();
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [snapshotAt]);
  return now;
}
