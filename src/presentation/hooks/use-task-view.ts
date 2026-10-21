"use client";

import { useEffect, useRef } from "react";
import { recordTaskViewAction } from "@/presentation/actions/task-actions";

export function useTaskView(taskId: string | null) {
  const visit = useRef<{ taskId: string; receipt: string; sent: boolean } | null>(null);
  useEffect(() => {
    if (!taskId) {
      visit.current = null;
      return;
    }
    if (visit.current?.taskId !== taskId)
      visit.current = { taskId, receipt: crypto.randomUUID(), sent: false };
    const current = visit.current;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function send(attempt = 0) {
      if (cancelled || current.sent) return;
      try {
        const result = await recordTaskViewAction(current.taskId, current.receipt);
        if (result.success) current.sent = true;
        else if (!cancelled && attempt < 2) timer = setTimeout(() => void send(attempt + 1), 2000);
      } catch {
        if (!cancelled && attempt < 2) timer = setTimeout(() => void send(attempt + 1), 2000);
      }
    }
    void send();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [taskId]);
}
