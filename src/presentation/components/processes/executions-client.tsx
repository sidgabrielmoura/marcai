"use client";
import Link from "next/link";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlayCircle, RotateCcw, AlertCircle, MapPin } from "lucide-react";
import { reopenExecutionAction, cancelExecutionAction } from "@/presentation/actions/process-actions";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

import {
  PageHeader,
  EmptyState,
  StatusBadge,
} from "@/presentation/components/shared";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import {SelectGroup,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";

interface ExecutionItem {
  id: string;
  processName: string;
  routineRecurrence: string | null;
  locationName: string | null;
  status: string;
  scheduledAt: Date | string;
  startedAt: Date | string | null;
  completedAt: Date | string | null;
  reopenedAt: Date | string | null;
  reopenReason: string | null;
  cancellationReason: string | null;
  totalTasks: number;
  completedTasks: number;
  tasks: Array<{ id: string; title: string; status: string; required: boolean; approval: string | null; occurrences: number }>;
}

interface ExecutionsClientProps {
  executions: ExecutionItem[];
  userRole: string;
}

export function ExecutionsClient({
  executions,
  userRole,
}: ExecutionsClientProps) {
  const router = useRouter();
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Dialog de Reabertura
  const [reopenTargetId, setReopenTargetId] = useState<string | null>(null);
  const [reopenReasonInput, setReopenReasonInput] = useState("");
  const [operation, setOperation] = useState<"REOPEN" | "CANCEL">("REOPEN");
  const [category, setCategory] = useState("OPERACIONAL");

  const filtered = executions.filter((e) => {
    if (filterStatus === "ALL") return true;
    return e.status === filterStatus;
  });

  async function handleConfirmReopen() {
    if (!reopenTargetId || !reopenReasonInput.trim()) return;
    const targetId = reopenTargetId;
    const reason = reopenReasonInput.trim();
    setLoadingId(targetId);
    setErrorMsg(null);
    try {
      const res = operation === "REOPEN" ? await reopenExecutionAction(targetId, reason) : await cancelExecutionAction(targetId, reason, category);
      if (res.error) {
        setErrorMsg(res.error);
      } else {
        setReopenTargetId(null);
        router.refresh();
      }
    } catch {
      setErrorMsg("Não foi possível salvar. Confira a conexão e tente novamente.");
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Execuções"
        subtitle="Acompanhe o andamento de cada execução dos seus processos."
        actions={
          <Select
            items={[
              { value: "ALL", label: "Todos os status" },
              { value: "SCHEDULED", label: "Programada" },
              { value: "AVAILABLE", label: "Disponível" },
              { value: "IN_PROGRESS", label: "Em andamento" },
              { value: "NEEDS_CORRECTION", label: "Correção solicitada" },
              { value: "PAUSED", label: "Pausada" },
              { value: "PENDING_REVIEW", label: "Aguardando aprovação" },
              { value: "NOT_COMPLETED", label: "Não realizada" },
              { value: "COMPLETED", label: "Concluída" },
              { value: "CANCELLED", label: "Cancelada" },
            ]}
            value={filterStatus}
            onValueChange={(val) => setFilterStatus((val as string) ?? "ALL")}
          >
            <SelectTrigger
              aria-label="Filtrar execuções por status"
              className="h-10 text-[length:var(--type-label)] px-3.5 bg-[var(--surface)] border-[var(--border-subtle)] text-[var(--brand-900)] font-medium"
            >
              <SelectValue placeholder="Todos os status" />
            </SelectTrigger>
            <SelectContent><SelectGroup>
              <SelectItem value="ALL">Todos os status</SelectItem>
              <SelectItem value="SCHEDULED">Programada</SelectItem>
              <SelectItem value="AVAILABLE">Disponível</SelectItem>
              <SelectItem value="IN_PROGRESS">Em andamento</SelectItem>
              <SelectItem value="NEEDS_CORRECTION">
                Correção solicitada
              </SelectItem>
              <SelectItem value="PAUSED">Pausada</SelectItem>
              <SelectItem value="PENDING_REVIEW">Aguardando aprovação</SelectItem>
              <SelectItem value="NOT_COMPLETED">Não realizada</SelectItem>
              <SelectItem value="COMPLETED">Concluída</SelectItem>
              <SelectItem value="CANCELLED">Cancelada</SelectItem>
            </SelectGroup></SelectContent>
          </Select>
        }
      />

      {errorMsg && (
        <Alert variant="destructive">
          <AlertCircle className="size-4 shrink-0 text-red-600" />
          <AlertDescription>{errorMsg}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-3">
        {filtered.length === 0 ? (
          <EmptyState
            title="Nenhuma execução encontrada"
            description="Altere os filtros para consultar outras execuções."
            icon={<PlayCircle className="size-6 text-[var(--brand-soft)]" />}
          />
        ) : (
          filtered.map((exec) => {
            const progress =
              exec.totalTasks > 0
                ? Math.round((exec.completedTasks / exec.totalTasks) * 100)
                : 0;

            return (
              <Card key={exec.id} id={`execution-${exec.id}`} className="p-5 flex flex-col gap-3.5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <StatusBadge status={exec.status} />
                      {exec.locationName && (
                        <span className="text-[length:var(--type-label)] text-[var(--text-secondary)] flex items-center gap-1">
                          <MapPin className="size-3" />
                          <span>{exec.locationName}</span>
                        </span>
                      )}
                    </div>

                    <h3 className="text-[var(--text-primary)] text-[length:var(--type-card-title)] font-bold">
                      {exec.processName}
                    </h3>
                    <div className="text-[length:var(--type-label)] text-[var(--text-secondary)] mt-0.5">
                      Programada para:{" "}
                      {new Date(exec.scheduledAt).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>

                    {exec.reopenReason && (
                      <div className="text-[length:var(--type-label)] text-[var(--brand-900)] bg-[var(--brand-soft)] p-2 rounded-[10px] mt-2 border border-[var(--neutral-200)]">
                        <span className="font-semibold">
                          Reaberta com motivo:
                        </span>{" "}
                        {exec.reopenReason}
                      </div>
                    )}
                    {exec.cancellationReason && <p className="text-sm text-muted-foreground mt-2">Cancelamento: {exec.cancellationReason}</p>}
                  </div>

                  {userRole !== "EMPLOYEE" && exec.status === "COMPLETED" && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setOperation("REOPEN");
                        setErrorMsg(null);
                        setReopenTargetId(exec.id);
                        setReopenReasonInput("");
                      }}
                      disabled={loadingId === exec.id}
                      className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)] hover:bg-[var(--neutral-200)] flex items-center gap-1.5 shrink-0 shadow-none"
                      title="Reabrir execução"
                    >
                      {loadingId === exec.id ? (
                        <Spinner
                          className="size-3.5"
                          data-icon="inline-start"
                        />
                      ) : (
                        <RotateCcw
                          className="size-3.5"
                          data-icon="inline-start"
                        />
                      )}
                      <span>Reabrir</span>
                    </Button>
                  )}
                  {userRole !== "EMPLOYEE" && !["COMPLETED", "CANCELLED", "NOT_COMPLETED"].includes(exec.status) && <Button variant="outline" size="sm" disabled={loadingId === exec.id} onClick={() => { setOperation("CANCEL"); setCategory("OPERACIONAL"); setErrorMsg(null); setReopenTargetId(exec.id); setReopenReasonInput(""); }}>Cancelar execução</Button>}
                </div>

                {/* Barra de Progresso das Tarefas da Execução */}
                <div className="pt-2 border-t border-[var(--border-subtle)] flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-[length:var(--type-label)] text-[var(--text-secondary)] font-medium">
                    <span>Progresso das tarefas</span>
                    <span>
                      {exec.completedTasks} de {exec.totalTasks} ({progress}%)
                    </span>
                  </div>
                  <Progress value={progress} className="w-full" />
                </div>
                <details className="execution-task-list"><summary>Ver {exec.tasks.length} tarefas e ocorrências</summary><div className="flex flex-col gap-3 mt-3">{exec.tasks.map(t => <Link key={t.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3" href={`/management/tasks/${t.id}`}><div><strong>{t.title}</strong><p className="text-caption text-muted-foreground">{t.required ? "Obrigatória" : "Opcional"} · {t.occurrences} ocorrências{t.approval ? " · Aprovação: " + ({ PENDING: "pendente", APPROVED: "aprovada", NEEDS_CORRECTION: "correção solicitada", REJECTED: "rejeitada" } as Record<string, string>)[t.approval] : ""}</p></div><StatusBadge status={t.status} /></Link>)}</div></details>
              </Card>
            );
          })
        )}
      </div>

      {/* Dialog Reabertura */}
      <Dialog
        open={!!reopenTargetId}
        onOpenChange={(open) => {
          if (!open && !loadingId) setReopenTargetId(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{operation === "REOPEN" ? "Reabrir execução" : "Cancelar execução"}</DialogTitle>
            <DialogDescription>
              {operation === "REOPEN" ? "As tarefas obrigatórias voltarão para correção e exigirão novas evidências. As entregas anteriores permanecem no histórico." : "As tarefas pendentes serão canceladas e seus responsáveis serão avisados. Tarefas já concluídas e evidências serão preservadas."}
            </DialogDescription>
          </DialogHeader>
          {operation === "CANCEL" && <Field><FieldLabel htmlFor="execution-category">Categoria</FieldLabel><NativeSelect id="execution-category" value={category} onChange={e => setCategory(e.target.value)}>{Object.entries({ OPERACIONAL: "Mudança na operação", PROGRAMACAO: "Erro de programação", DUPLICIDADE: "Execução duplicada", OUTROS: "Outro motivo" }).map(([value, label]) => <NativeSelectOption key={value} value={value}>{label}</NativeSelectOption>)}</NativeSelect></Field>}
          {errorMsg && <Alert variant="destructive"><AlertDescription>{errorMsg}</AlertDescription></Alert>}

          <Field className="py-2">
            <FieldLabel htmlFor="execution-reason" className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]">
              Justificativa *
            </FieldLabel>
            <Textarea
              id="execution-reason"
              minLength={5}
              maxLength={1000}
              value={reopenReasonInput}
              onChange={(e) => setReopenReasonInput(e.target.value)}
              placeholder="Explique o motivo desta alteração"
              rows={3}
              className="text-[length:var(--type-label)]"
              autoFocus
            />
          </Field>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setReopenTargetId(null)}
              disabled={!!loadingId}
              className="text-[length:var(--type-label)]"
            >
              Voltar
            </Button>
            <Button
              type="button"
              onClick={handleConfirmReopen}
              disabled={!!loadingId || reopenReasonInput.trim().length < 5}
              className="bg-[var(--brand-900)] text-white text-[length:var(--type-label)] hover:bg-[var(--brand-700)] shadow-none"
            >
              {loadingId ? "Salvando…" : operation === "REOPEN" ? "Reabrir execução" : "Confirmar cancelamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
