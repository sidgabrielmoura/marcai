"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, AlertCircle } from "lucide-react";
import { createAdHocTaskAction } from "@/presentation/actions/management-task-actions";

import { PageHeader } from "@/presentation/components/shared";
import { Card } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";

interface CreateTaskFormProps {
  locations: Array<{ id: string; name: string }>;
  teams: Array<{ id: string; name: string }>;
  members: Array<{ id: string; name: string; email: string | null }>;
}

const priorityItems = [
  { label: "Baixa", value: "LOW" },
  { label: "Média", value: "MEDIUM" },
  { label: "Alta", value: "HIGH" },
  { label: "Crítica", value: "CRITICAL" },
];

const criticalityItems = [
  { label: "Baixa", value: "LOW" },
  { label: "Média", value: "MEDIUM" },
  { label: "Alta", value: "HIGH" },
  { label: "Crítica", value: "CRITICAL" },
];

const evidenceTypeItems = [
  { label: "Nenhuma evidência obrigatória", value: "NONE" },
  { label: "Foto", value: "PHOTO" },
  { label: "Vídeo", value: "VIDEO" },
  { label: "Texto ou observação", value: "TEXT" },
  { label: "Número ou medição", value: "NUMBER" },
  { label: "Assinatura", value: "SIGNATURE" },
  { label: "Localização (GPS)", value: "LOCATION" },
  { label: "Arquivo", value: "FILE" },
];

export function CreateTaskForm({
  locations,
  teams,
  members,
}: CreateTaskFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [locationId, setLocationId] = useState<string>(locations[0]?.id || "");
  const [teamId, setTeamId] = useState<string>("none");
  const [primaryMemberId, setPrimaryMemberId] = useState<string>("none");
  const [priority, setPriority] = useState<string>("MEDIUM");
  const [criticality, setCriticality] = useState<string>("MEDIUM");
  const [evidenceType, setEvidenceType] = useState<string>("NONE");
  const [evidenceRequired, setEvidenceRequired] = useState<boolean>(true);

  const locationItems = locations.map((loc) => ({
    label: loc.name,
    value: loc.id,
  }));
  const teamItems = [
    { label: "Nenhuma equipe específica", value: "none" },
    ...teams.map((t) => ({ label: t.name, value: t.id })),
  ];
  const memberItems = [
    { label: "A equipe poderá assumir a tarefa", value: "none" },
    ...members.map((m) => ({
      label: `${m.name} (${m.email || "Operador"})`,
      value: m.id,
    })),
  ];

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    const formData = new FormData(e.currentTarget);
    // Explicitly guarantee values in formData
    formData.set("locationId", locationId);
    formData.set("teamId", teamId === "none" ? "" : teamId);
    formData.set(
      "primaryMemberId",
      primaryMemberId === "none" ? "" : primaryMemberId,
    );
    formData.set("priority", priority);
    formData.set("criticality", criticality);
    formData.set("evidenceType", evidenceType === "NONE" ? "" : evidenceType);
    formData.set("evidenceRequired", evidenceRequired ? "true" : "false");

    try {
      const res = await createAdHocTaskAction(formData);
      if (res.error) {
        setErrorMsg(res.error);
      } else {
        router.push("/management/tasks");
      }
    } catch {
      setErrorMsg("Erro inesperado ao criar tarefa.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Criar tarefa"
        subtitle="Defina o que precisa ser feito e quem será responsável."
        backHref="/management/tasks"
      />

      {errorMsg && (
        <Alert variant="destructive" className="rounded-[14px]">
          <AlertCircle data-icon="inline-start" />
          <AlertDescription>{errorMsg}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="task-form-grid">
        {/* Bloco 1: Dados Gerais */}
        <Card className="bg-[var(--surface)] rounded-[18px] p-5 shadow-none flex flex-col gap-3 border-[var(--border-subtle)]">
          <h3 className="text-[var(--text-secondary)] text-[length:var(--type-card-title)] font-bold">
            Sobre a tarefa
          </h3>

          <FieldGroup className="gap-3">
            <Field>
              <FieldLabel className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]">
                Título da tarefa *
              </FieldLabel>
              <Input
                aria-label="Título da tarefa"
                type="text"
                name="title"
                required
                placeholder="Ex.: Conferir o estoque"
                className="w-full h-11 text-[length:var(--type-label)] px-3.5 bg-[var(--canvas)] border-[var(--border-subtle)] rounded-[14px] text-[var(--brand-900)] placeholder:text-[var(--text-secondary)]"
              />
            </Field>

            <Field>
              <FieldLabel className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]">
                Objetivo
              </FieldLabel>
              <Textarea
                aria-label="Objetivo"
                name="description"
                rows={2}
                placeholder="Explique o que precisa ser verificado ou executado..."
                className="w-full text-[length:var(--type-label)] p-3 bg-[var(--canvas)] border-[var(--border-subtle)] rounded-[14px] text-[var(--brand-900)] placeholder:text-[var(--text-secondary)] resize-none"
              />
            </Field>

            <Field>
              <FieldLabel className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]">
                Instruções passo a passo
              </FieldLabel>
              <Textarea
                aria-label="Instruções passo a passo"
                name="instructions"
                rows={3}
                placeholder={
                  "1. Verificar prateleira A\n2. Contar caixas fechadas\n3. Tirar foto do painel"
                }
                className="w-full text-[length:var(--type-label)] font-mono p-3 bg-[var(--canvas)] border-[var(--border-subtle)] rounded-[14px] text-[var(--brand-900)] placeholder:text-[var(--text-secondary)] resize-none"
              />
            </Field>
          </FieldGroup>
        </Card>

        {/* Bloco 2: Escopo Operacional e Responsável */}
        <Card className="bg-[var(--surface)] rounded-[18px] p-5 shadow-none flex flex-col gap-3.5 border-[var(--border-subtle)]">
          <h3 className="text-[var(--text-secondary)] text-[length:var(--type-card-title)] font-bold">
            Unidade e responsável
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <Field>
              <FieldLabel className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]">
                Unidade *
              </FieldLabel>
              <Select
                items={locationItems}
                value={locationId}
                onValueChange={(val) => {
                  if (val) setLocationId(val);
                }}
              >
                <SelectTrigger className="w-full h-11 text-[length:var(--type-label)] px-3.5 bg-[var(--canvas)] border-[var(--border-subtle)] rounded-[14px] text-[var(--brand-900)]">
                  <SelectValue placeholder="Selecione a unidade..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {locationItems.map((loc) => (
                      <SelectItem key={loc.value} value={loc.value}>
                        {loc.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]">
                Equipe
              </FieldLabel>
              <Select
                items={teamItems}
                value={teamId}
                onValueChange={(val) => {
                  if (val) setTeamId(val);
                }}
              >
                <SelectTrigger className="w-full h-11 text-[length:var(--type-label)] px-3.5 bg-[var(--canvas)] border-[var(--border-subtle)] rounded-[14px] text-[var(--brand-900)]">
                  <SelectValue placeholder="Nenhuma equipe específica" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {teamItems.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field>
            <FieldLabel className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]">
              Responsável principal
            </FieldLabel>
            <Select
              items={memberItems}
              value={primaryMemberId}
              onValueChange={(val) => {
                if (val) setPrimaryMemberId(val);
              }}
            >
              <SelectTrigger className="w-full h-11 text-[length:var(--type-label)] px-3.5 bg-[var(--canvas)] border-[var(--border-subtle)] rounded-[14px] text-[var(--brand-900)]">
                <SelectValue placeholder="A equipe poderá assumir a tarefa" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {memberItems.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </Card>

        {/* Bloco 3: Parâmetros de Tempo e Prioridade */}
        <Card className="bg-[var(--surface)] rounded-[18px] p-5 shadow-none flex flex-col gap-3.5 border-[var(--border-subtle)]">
          <h3 className="text-[var(--text-secondary)] text-[length:var(--type-card-title)] font-bold">
            Prazos e prioridade
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <Field>
              <FieldLabel className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]">
                Prioridade
              </FieldLabel>
              <Select
                items={priorityItems}
                value={priority}
                onValueChange={(val) => {
                  if (val) setPriority(val);
                }}
              >
                <SelectTrigger className="w-full h-11 text-[length:var(--type-label)] px-3.5 bg-[var(--canvas)] border-[var(--border-subtle)] rounded-[14px] text-[var(--brand-900)]">
                  <SelectValue placeholder="Prioridade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {priorityItems.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]">
                Criticidade
              </FieldLabel>
              <Select
                items={criticalityItems}
                value={criticality}
                onValueChange={(val) => {
                  if (val) setCriticality(val);
                }}
              >
                <SelectTrigger className="w-full h-11 text-[length:var(--type-label)] px-3.5 bg-[var(--canvas)] border-[var(--border-subtle)] rounded-[14px] text-[var(--brand-900)]">
                  <SelectValue placeholder="Criticidade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {criticalityItems.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]">
                Prazo final
              </FieldLabel>
              <Input
                aria-label="Prazo final"
                type="datetime-local"
                name="deadlineAt"
                className="w-full h-11 text-[length:var(--type-label)] px-3 bg-[var(--canvas)] border-[var(--border-subtle)] rounded-[14px] text-[var(--brand-900)]"
              />
            </Field>

            <Field>
              <FieldLabel className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]">
                Tempo limite (minutos)
              </FieldLabel>
              <Input
                aria-label="Tempo limite (minutos)"
                type="number"
                name="slaDurationMinutes"
                placeholder="Ex: 60"
                className="w-full h-11 text-[length:var(--type-label)] px-3.5 bg-[var(--canvas)] border-[var(--border-subtle)] rounded-[14px] text-[var(--brand-900)]"
              />
            </Field>
          </div>
        </Card>

        {/* Bloco 4: Requisitos de Evidência */}
        <Card className="bg-[var(--surface)] rounded-[18px] p-5 shadow-none flex flex-col gap-3.5 border-[var(--border-subtle)]">
          <h3 className="text-[var(--text-secondary)] text-[length:var(--type-card-title)] font-bold">
            Evidências para conclusão
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <Field>
              <FieldLabel className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]">
                Tipo de evidência
              </FieldLabel>
              <Select
                items={evidenceTypeItems}
                value={evidenceType}
                onValueChange={(val) => {
                  if (val) setEvidenceType(val);
                }}
              >
                <SelectTrigger className="w-full h-11 text-[length:var(--type-label)] px-3.5 bg-[var(--canvas)] border-[var(--border-subtle)] rounded-[14px] text-[var(--brand-900)]">
                  <SelectValue placeholder="Tipo de evidência" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {evidenceTypeItems.map((e) => (
                      <SelectItem key={e.value} value={e.value}>
                        {e.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <div className="flex items-center gap-2.5 pt-6">
              <Checkbox
                id="evidenceRequired"
                name="evidenceRequired"
                checked={evidenceRequired}
                onCheckedChange={(checked) =>
                  setEvidenceRequired(Boolean(checked))
                }
              />
              <Label
                htmlFor="evidenceRequired"
                className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)] cursor-pointer select-none"
              >
                Bloquear conclusão sem evidência válida
              </Label>
            </div>
          </div>
        </Card>

        <Button
          type="submit"
          disabled={loading}
          className="w-full h-13 bg-[var(--brand-primary)] text-white font-semibold text-[length:var(--type-body)] rounded-[16px] shadow-sm hover:bg-[var(--brand-secondary)] active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {loading ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <Plus data-icon="inline-start" className="size-5" />
          )}
          <span>{loading ? "Criando tarefa..." : "Criar tarefa"}</span>
        </Button>
      </form>
    </div>
  );
}
