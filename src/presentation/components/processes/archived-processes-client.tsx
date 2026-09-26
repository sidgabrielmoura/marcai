"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  RotateCcw,
  Search,
  MapPin,
  Archive,
  ArrowRight,
  ListChecks,
  CalendarClock,
  PlayCircle,
  AlertCircle,
} from "lucide-react";
import { PageHeader, EmptyState, StatusBadge, Modal } from "../shared";
import { toggleProcessStatusAction } from "@/presentation/actions/process-actions";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  CardAction,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InputGroup, InputGroupInput, InputGroupAddon } from "@/components/ui/input-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";

interface ProcessItem {
  id: string;
  name: string;
  description: string | null;
  status: string;
  criticality: string;
  locationName: string | null;
  routinesCount: number;
  tasksCount: number;
  executionsCount: number;
  validFrom: Date | string | null;
  validUntil: Date | string | null;
}

const CRITICALITY_LABELS: Record<string, string> = {
  LOW: "Baixa",
  MEDIUM: "Média",
  HIGH: "Alta",
  CRITICAL: "Crítica",
};

export function ArchivedProcessesClient({
  processes,
  userRole,
}: {
  processes: ProcessItem[];
  userRole: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState<ProcessItem | null>(null);

  const canRestore = ["OWNER", "ADMIN"].includes(userRole);

  const filtered = processes.filter((p) => {
    const text = `${p.name} ${p.locationName ?? ""}`.toLocaleLowerCase("pt-BR");
    return text.includes(query.toLocaleLowerCase("pt-BR"));
  });

  async function handleRestore() {
    if (!target) return;
    setBusy(true);
    setError("");
    try {
      const res = await toggleProcessStatusAction(target.id, "PAUSED");
      if (res.error) {
        setError(res.error);
      } else {
        const name = target.name;
        setTarget(null);
        setNotice(`O processo "${name}" foi restaurado como pausado.`);
        router.refresh();
      }
    } catch {
      setError("Não foi possível restaurar o processo. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Processos arquivados"
        subtitle="Processos desativados ou descontinuados da organização. Podem ser consultados ou restaurados para a lista ativa a qualquer momento."
      />

      {notice && (
        <Alert className="bg-[var(--brand-soft)] border-[var(--sage-400)]/40 text-[var(--brand-900)]">
          <AlertDescription className="flex items-center justify-between gap-4 flex-wrap">
            <span>{notice}</span>
            <Button
              size="sm"
              variant="outline"
              nativeButton={false}
              render={<Link href="/management/processes" />}
              className="text-xs h-7 gap-1 border-[var(--brand-700)]/30 text-[var(--brand-900)]"
            >
              Ir para Processos ativos
              <ArrowRight className="size-3" />
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <InputGroup className="max-w-md py-5.5!">
          <InputGroupAddon>
            <Search className="size-4 text-muted-foreground" />
          </InputGroupAddon>
          <InputGroupInput
            aria-label="Buscar processos arquivados"
            placeholder="Buscar por nome ou unidade"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="text-sm!"
          />
        </InputGroup>
        <span className="text-xs text-(--text-secondary) whitespace-nowrap self-end sm:self-center">
          {filtered.length} {filtered.length === 1 ? "processo arquivado" : "processos arquivados"}
        </span>
      </div>

      {!filtered.length ? (
        <EmptyState
          icon={Archive}
          title={processes.length ? "Nenhum processo encontrado" : "Nenhum processo arquivado"}
          description={
            processes.length
              ? "Tente buscar por outro termo ou limpe o campo de busca."
              : "Quando você arquivar processos inativos na aba de Processos, eles serão listados aqui para consulta e restauração."
          }
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((p) => (
            <Card
              key={p.id}
              className="bg-surface border border-(--border-subtle) rounded-2xl p-5! hover:border-(--brand-700)/30 transition-all flex flex-col justify-between gap-4 shadow-none"
            >
              <CardHeader className="p-0 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <StatusBadge status="ARCHIVED" showIcon />
                    <Badge
                      variant="outline"
                      className="text-xs font-normal text-(--text-secondary) bg-canvas border-(--border-subtle)"
                    >
                      Criticidade {CRITICALITY_LABELS[p.criticality] ?? p.criticality}
                    </Badge>
                  </div>
                  {p.locationName && (
                    <span className="flex items-center gap-1 text-xs text-(--text-secondary)">
                      <MapPin className="size-3.5 text-muted-foreground" />
                      {p.locationName}
                    </span>
                  )}
                </div>

                <div>
                  <CardTitle className="text-base font-bold text-(--text-primary)">
                    {p.name}
                  </CardTitle>
                  {p.description && (
                    <CardDescription className="text-xs text-(--text-secondary) line-clamp-2 mt-1">
                      {p.description}
                    </CardDescription>
                  )}
                </div>
              </CardHeader>

              <CardContent className="p-0 flex flex-col gap-3">
                {/* Micro-metrics */}
                <div className="flex items-center gap-4 py-2 px-3 bg-[var(--canvas)] rounded-xl text-xs text-[var(--text-secondary)]">
                  <span className="flex items-center gap-1">
                    <ListChecks className="size-3.5 text-[var(--brand-700)]" />
                    <strong>{p.tasksCount}</strong> tarefas
                  </span>
                  <span className="flex items-center gap-1">
                    <CalendarClock className="size-3.5 text-[var(--brand-700)]" />
                    <strong>{p.routinesCount}</strong> rotinas
                  </span>
                  <span className="flex items-center gap-1">
                    <PlayCircle className="size-3.5 text-[var(--brand-700)]" />
                    <strong>{p.executionsCount}</strong> execuções
                  </span>
                </div>

                {(p.validFrom || p.validUntil) && (
                  <p className="text-[11px] text-muted-foreground">
                    Validade original:{" "}
                    {p.validFrom
                      ? new Date(p.validFrom).toLocaleDateString("pt-BR", { timeZone: "UTC" })
                      : "sem início"}{" "}
                    até{" "}
                    {p.validUntil
                      ? new Date(p.validUntil).toLocaleDateString("pt-BR", { timeZone: "UTC" })
                      : "indeterminada"}
                  </p>
                )}
              </CardContent>

              <CardFooter className="p-0 pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  nativeButton={false}
                  render={<Link href={`/management/executions?process=${p.id}`} />}
                  className="text-xs h-8 text-[var(--text-secondary)] gap-1.5"
                >
                  <PlayCircle className="size-3.5" />
                  Ver histórico de execuções
                </Button>

                {canRestore ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setTarget(p)}
                    className="text-xs h-8 gap-1.5 border-[var(--brand-700)]/40 text-[var(--brand-900)] hover:bg-[var(--brand-soft)]"
                  >
                    <RotateCcw className="size-3.5" />
                    Restaurar processo
                  </Button>
                ) : (
                  <span className="text-[11px] text-muted-foreground italic">
                    Apenas administradores podem restaurar
                  </span>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* Modal de Restauração */}
      {target && (
        <Modal
          open
          title="Restaurar processo"
          onClose={() => {
            if (!busy) {
              setTarget(null);
              setError("");
            }
          }}
        >
          <div className="flex flex-col gap-4">
            <p className="text-sm text-[var(--text-primary)]">
              Deseja restaurar o processo <strong>{target.name}</strong>?
            </p>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              O processo voltará para a lista ativa com status <strong>Pausado</strong>. Você
              poderá revisar sua configuração e reativá-lo para que as rotinas programadas voltem a
              gerar novas execuções.
            </p>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => {
                  setTarget(null);
                  setError("");
                }}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                disabled={busy}
                onClick={handleRestore}
                className="bg-[var(--brand-900)] hover:bg-[var(--brand-700)] text-white gap-1.5"
              >
                {busy && <Spinner className="size-3.5" />}
                <RotateCcw className="size-3.5" />
                Restaurar para lista ativa
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
