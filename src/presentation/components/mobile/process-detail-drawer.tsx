"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { StatusBadge } from "../shared";
import {
  getEmployeeProcessExecutionAction,
  completeProcessExecutionAction,
  type EmployeeProcessExecutionDetail,
} from "@/presentation/actions/process-actions";
import { EmployeeTaskDetailDrawer } from "./task-detail-drawer";
export function EmployeeProcessDetailDrawer({
  executionId,
  open,
  onOpenChange,
  onUpdated,
}: {
  executionId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated?: () => void;
}) {
  const router = useRouter(),
    [execution, setExecution] = useState<EmployeeProcessExecutionDetail | null>(
      null,
    ),
    [selectedId, setSelectedId] = useState<string | null>(null),
    [error, setError] = useState<string | null>(null),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setExecution(null);
    setSelectedId(null);
    setError(null);
    if (open && executionId) {
      setLoading(true);
      void getEmployeeProcessExecutionAction(executionId)
        .then((result) => {
          if (active) {
            setExecution(result.execution ?? null);
            setError(result.error ?? null);
          }
        })
        .catch(() => {
          if (active) setError("Não foi possível carregar o processo.");
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }
    return () => {
      active = false;
    };
  }, [open, executionId, revision]);
  const total =
    execution?.requiredTotal ??
    execution?.tasks.filter((t) => t.required).length ??
    0;
  const completed =
    execution?.requiredCompleted ??
    execution?.tasks.filter((t) => t.required && t.status === "COMPLETED")
      .length ??
    0;
  const canFinish =
    !!execution &&
    (execution.canComplete ??
      (total === completed &&
        !["COMPLETED", "CANCELLED", "NOT_COMPLETED"].includes(
          execution.status,
        ) &&
        new Date(execution.scheduledAt).getTime() <= Date.now()));
  const updated = () => {
    setSelectedId(null);
    setRevision((v) => v + 1);
    onUpdated?.();
    router.refresh();
  };
  const finish = async () => {
    if (!execution) return;
    setBusy(true);
    setError(null);
    try {
      const result = await completeProcessExecutionAction(execution.id);
      if (result.error) setError(result.error);
      else updated();
    } catch {
      setError("Não foi possível finalizar o processo. Tente novamente.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>
              {execution?.processName ?? "Detalhe do processo"}
            </DrawerTitle>
            <DrawerDescription>
              Confira as etapas às quais você tem acesso.
            </DrawerDescription>
          </DrawerHeader>
          <div className="overflow-y-auto min-h-0 flex flex-col gap-4 p-4">
            {loading ? <Spinner /> : null}
            {error ? (
              <div role="alert">
                <p>{error}</p>
                <Button
                  variant="outline"
                  onClick={() => setRevision((v) => v + 1)}
                >
                  Tentar novamente
                </Button>
              </div>
            ) : null}
            {execution ? (
              <>
                <p>
                  {completed} de {total} etapas obrigatórias concluídas
                </p>
                <p>
                  {execution.personalCompleted ??
                    execution.tasks.filter((t) => t.status === "COMPLETED")
                      .length}{" "}
                  de {execution.personalTotal ?? execution.tasks.length} etapas
                  no seu acesso
                </p>
                {execution.hasHiddenSteps ? (
                  <p>
                    Outras pessoas também participam deste processo. As etapas
                    fora do seu acesso não são exibidas.
                  </p>
                ) : null}
                {execution.tasks.map((task) => (
                  <Card key={task.id}>
                    <CardHeader>
                      <CardTitle>{task.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                      <StatusBadge status={task.status} />
                      <p>
                        {task.required ? "Etapa obrigatória" : "Etapa opcional"}
                      </p>
                      <Button
                        variant="outline"
                        onClick={() => setSelectedId(task.id)}
                      >
                        Ver etapa
                      </Button>
                    </CardContent>
                  </Card>
                ))}
                {canFinish ? (
                  <Button
                    disabled={busy}
                    onClick={() => {
                      void finish();
                    }}
                  >
                    {busy ? <Spinner /> : null}Finalizar processo
                  </Button>
                ) : null}
              </>
            ) : null}
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar processo
          </Button>
        </DrawerContent>
      </Drawer>
      <EmployeeTaskDetailDrawer
        taskId={selectedId}
        open={!!selectedId && open}
        onOpenChange={(value) => {
          if (!value) setSelectedId(null);
        }}
        onTaskUpdated={updated}
      />
    </>
  );
}
