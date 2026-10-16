"use client";

import {useSubmissionReceipts} from "@/presentation/lib/submission-receipts";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { completeTaskAction } from "@/presentation/actions/task-actions";
import { Button } from "@/components/ui/button";
import { Check, Loader2 } from "lucide-react";

interface QuickCompleteButtonProps {
  taskId: string;
  roundId:string;
  taskTitle?: string;
  className?: string;
  disabled?: boolean;
}

export function QuickCompleteButton({
  taskId,
  roundId,
  taskTitle,
  className = "",
  disabled = false,
}: QuickCompleteButtonProps) {
  const router = useRouter();
  const receipt=useSubmissionReceipts(taskId+":"+roundId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleComplete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy || disabled) return;

    setBusy(true);
    setError("");

    try {
      const result = await completeTaskAction(taskId,undefined,roundId,await receipt("complete",{}));
      if (result.error) {
        setError(result.error);
        alert(`Não foi possível concluir: ${result.error}`);
      } else {
        router.refresh();
      }
    } catch {
      setError("Erro de rede");
      alert("Não foi possível concluir a tarefa. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      disabled={busy || disabled}
      onClick={handleComplete}
      aria-label={`Concluir tarefa: ${taskTitle || ""}`}
      className={`w-full h-8 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-all flex items-center justify-center gap-1.5 ${disabled ? "opacity-60 cursor-not-allowed bg-slate-300 text-slate-500 hover:bg-slate-300" : ""} ${className}`}
    >
      {busy ? (
        <>
          <Loader2 className="size-3.5 animate-spin" />
          <span>Concluindo...</span>
        </>
      ) : (
        <>
          <Check className="size-3.5 stroke-[2.5]" />
          <span>Concluir tarefa</span>
        </>
      )}
    </Button>
  );
}
