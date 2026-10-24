"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, RotateCcw } from "lucide-react";
import {
  restoreTaskAction,
  purgeTaskAction,
} from "@/presentation/actions/management-task-actions";
import { PageHeader, EmptyState } from "@/presentation/components/shared";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Spinner } from "@/components/ui/spinner";
import { formatDateTimeInTimezone } from "@/domain/rules/date-time";

interface TrashTaskItem {
  id: string;
  title: string;
  deletedAt: Date | string;
  deletedBy: string | null;
  deleteReason: string | null;
  locationName: string | null;
  timezone?: string | null;
}

interface TrashClientProps {
  tasks: TrashTaskItem[];
  canPurge: boolean;
}

export function TrashClient({ tasks, canPurge }: TrashClientProps) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [taskToPurge, setTaskToPurge] = useState<string | null>(null);

  async function handleRestore(taskId: string) {
    setLoadingId(taskId);
    try {
      await restoreTaskAction(taskId);
      router.refresh();
    } finally {
      setLoadingId(null);
    }
  }

  async function handleConfirmPurge() {
    if (!taskToPurge) return;
    setLoadingId(taskToPurge);
    try {
      await purgeTaskAction(taskToPurge);
      setTaskToPurge(null);
      router.refresh();
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Lixeira de tarefas"
        subtitle="Restaure tarefas removidas ou exclua-as definitivamente."
        backHref="/management/tasks"
        actions={
          <Badge
            variant="outline"
            className="text-(length:--type-label) font-semibold px-3 py-1.5 bg-red-100 text-red-800 rounded-full border-red-200"
          >
            {tasks.length} {tasks.length === 1 ? "item" : "itens"}
          </Badge>
        }
      />

      <Card className="bg-surface rounded-[18px] overflow-hidden shadow-none border-(--border-subtle) p-4! grid grid-cols-1 sm:grid-cols-2 gap-5">
        {tasks.length === 0 ? (
          <EmptyState
            title="Lixeira vazia"
            description="As tarefas removidas aparecerão aqui."
            className="bg-canvas/60! col-span-full"
            icon={
              <Trash2
                data-icon="inline-start"
                className="size-6 text-black"
              />
            }
          />
        ) : (
          <div className="divide-y divide-(--border-subtle)">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="px-6 py-4 flex flex-col justify-between gap-6 bg-canvas/80 rounded-xl"
              >
                <div>
                  <h4 className="text-brand-900 text-(length:--type-card-title) font-bold">
                    {task.title}
                  </h4>
                  <div className="text-(length:--type-caption) text-(--text-secondary) flex items-center gap-2 mt-0.5">
                    <span>Unidade: {task.locationName || "Geral"}</span>
                    <span>•</span>
                    <span>
                      Excluída em:{" "}
                      {formatDateTimeInTimezone(task.deletedAt, task.timezone)}
                    </span>
                  </div>
                  {task.deleteReason && (
                    <div className="text-(length:--type-caption) text-red-700 mt-1">
                      Motivo: {task.deleteReason}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleRestore(task.id)}
                    disabled={loadingId === task.id}
                    className="rounded-[12px] bg-canvas border-(--border-subtle) text-brand-900 hover:bg-neutral-200 flex items-center gap-1.5"
                  >
                    {loadingId === task.id ? (
                      <Spinner data-icon="inline-start" />
                    ) : (
                      <RotateCcw
                        data-icon="inline-start"
                        className="size-3.5 text-emerald-600"
                      />
                    )}
                    <span>Restaurar</span>
                  </Button>

                  {canPurge && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setTaskToPurge(task.id)}
                      disabled={loadingId === task.id}
                      className="rounded-[12px] bg-red-50 border-red-200 text-red-700 hover:bg-red-100 flex items-center gap-1.5"
                    >
                      <Trash2 data-icon="inline-start" className="size-3.5" />
                      <span>Excluir definitivamente</span>
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <AlertDialog
        open={taskToPurge !== null}
        onOpenChange={(open) => {
          if (!open) setTaskToPurge(null);
        }}
      >
        <AlertDialogContent className="max-w-xl!">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir tarefa definitivamente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A tarefa e seus registros
              associados serão excluídos definitivamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row! bg-transparent!">
            <AlertDialogCancel onClick={() => setTaskToPurge(null)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleConfirmPurge}
              disabled={loadingId !== null}
            >
              {loadingId !== null ? <Spinner data-icon="inline-start" /> : null}
              <span>Excluir definitivamente</span>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
