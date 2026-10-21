"use client";

import { useTaskView } from "@/presentation/hooks/use-task-view";

export function TaskViewTracker({ taskId }: { taskId: string }) {
  useTaskView(taskId);
  return null;
}
