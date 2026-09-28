"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { claimTaskAction } from "@/presentation/actions/management-task-actions";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export function ClaimTaskButton({
  taskId,
  onClaimed,
}: {
  taskId: string;
  onClaimed?: (taskId: string) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function claim() {
    setBusy(true);
    setError("");
    try {
      const result = await claimTaskAction(taskId);
      if (result.error) {
        setError(result.error);
      } else {
        if (onClaimed) {
          onClaimed(taskId);
        } else {
          router.push(`/tasks/${taskId}`);
        }
        router.refresh();
      }
    } catch {
      setError("Não foi possível assumir. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={claim} disabled={busy} className="w-full">
        {busy && <Spinner data-icon="inline-start" />}
        {busy ? "Assumindo…" : "Assumir tarefa"}
      </Button>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
