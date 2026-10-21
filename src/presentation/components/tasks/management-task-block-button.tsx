"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setTaskManagementBlockAction } from "@/presentation/actions/management-task-actions";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/presentation/components/shared/modal";

export function ManagementTaskBlockButton({
  taskId,
  blocked,
}: {
  taskId: string;
  blocked: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const result = await setTaskManagementBlockAction(
        taskId,
        !blocked,
        reason,
      );
      if (result.error) setError(result.error);
      else {
        setOpen(false);
        setReason("");
        router.refresh();
      }
    } catch {
      setError("Não foi possível alterar o bloqueio. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button variant="outline" disabled={busy} onClick={() => setOpen(true)}>
        {blocked ? "Remover bloqueio da gestão" : "Bloquear tarefa"}
      </Button>
      <Modal
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title={blocked ? "Remover bloqueio da gestão" : "Bloquear tarefa"}
      >
        <div className="flex flex-col gap-4">
          {blocked ? (
            <p>
              As dependências e os limites de tempo continuam sendo validados
              após a liberação.
            </p>
          ) : (
            <Field>
              <FieldLabel htmlFor="task-block-reason">
                Motivo do bloqueio
              </FieldLabel>
              <Textarea
                id="task-block-reason"
                value={reason}
                maxLength={1000}
                disabled={busy}
                onChange={(event) => setReason(event.target.value)}
              />
            </Field>
          )}
          {error ? <p role="alert">{error}</p> : null}
          <Button
            disabled={busy || (!blocked && reason.trim().length < 3)}
            onClick={() => {
              void submit();
            }}
          >
            {busy
              ? "Salvando…"
              : blocked
                ? "Remover bloqueio"
                : "Confirmar bloqueio"}
          </Button>
        </div>
      </Modal>
    </>
  );
}
