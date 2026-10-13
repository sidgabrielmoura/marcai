"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { createAdHocTaskAction } from "@/presentation/actions/management-task-actions";
import { FormFieldDefinition } from "@/domain/rules/process-definition";
import { FormFieldsEditor } from "@/presentation/components/shared/form-fields-editor";

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
import { toast } from "@/components/ui/toast";
import { Spinner } from "@/components/ui/spinner";

interface CreateTaskFormProps {
  locations: Array<{ id: string; name: string }>;
  teams: Array<{ id: string; name: string }>;
  members: Array<{ id: string; name: string; email: string | null }>;
  initialTaskType?: "STANDARD" | "FORM";
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

const toleranceItems = [
  { label: "0 minutos (Sem tolerância)", value: "0" },
  { label: "5 minutos", value: "5" },
  { label: "10 minutos", value: "10" },
  { label: "15 minutos", value: "15" },
  { label: "20 minutos (Padrão)", value: "20" },
  { label: "30 minutos", value: "30" },
  { label: "45 minutos", value: "45" },
  { label: "60 minutos (1 hora)", value: "60" },
];

export function CreateTaskForm({
  locations,
  teams,
  members,
  initialTaskType = "STANDARD",
}: CreateTaskFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [steps, setSteps] = useState<string[]>([""]);
  const [formFields, setFormFields] = useState<FormFieldDefinition[]>([]);

  const handleStepChange = (index: number, val: string) => {
    setSteps((prev) => {
      const copy = [...prev];
      copy[index] = val;
      return copy;
    });
  };

  const handleAddStep = () => {
    setSteps((prev) => [...prev, ""]);
  };

  const handleRemoveStep = (index: number) => {
    setSteps((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : [""]));
  };

  const [locationId, setLocationId] = useState<string>(locations[0]?.id || "");
  const [teamId, setTeamId] = useState<string>("none");
  const [primaryMemberId, setPrimaryMemberId] = useState<string>("none");
  const [priority, setPriority] = useState<string>("MEDIUM");
  const [criticality, setCriticality] = useState<string>("MEDIUM");
  const [toleranceMinutes, setToleranceMinutes] = useState<string>("20");
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
    formData.set("toleranceMinutes", toleranceMinutes);
    formData.set("taskType", initialTaskType);
    if (initialTaskType === "FORM") {
      formData.set("evidenceType", "");
      formData.set("evidenceRequired", "false");
      formData.set("formFields", JSON.stringify(formFields));
    } else {
      formData.set("evidenceType", evidenceType === "NONE" ? "" : evidenceType);
      formData.set("evidenceRequired", evidenceRequired ? "true" : "false");
    }

    const formattedInstructions = steps
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s, idx) => `${idx + 1}. ${s}`)
      .join("\n");
    formData.set("instructions", formattedInstructions);

    try {
      const res = await createAdHocTaskAction(formData);
      if (res.error) {
        toast.add({
          title: "Erro ao criar tarefa",
          description: res.error,
          type: "error",
        });
      } else {
        toast.add({
          title: "Tarefa criada",
          description: "Tarefa criada com sucesso.",
          type: "success",
        });
        router.push("/management/tasks");
      }
    } catch {
      toast.add({
        title: "Erro inesperado",
        description: "Erro inesperado ao criar tarefa.",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        title={initialTaskType === "FORM" ? "Criar tarefa com perguntas" : "Criar tarefa avulsa"}
        subtitle={initialTaskType === "FORM" ? "Cadastre uma tarefa estruturada com perguntas e respostas para a equipe." : "Cadastre uma demanda pontual para a equipe (fora de rotinas de processos)."}
        backHref="/management/tasks"
      />

      <form onSubmit={handleSubmit} className="task-form-grid ">
        <Card className="bg-[var(--surface)] rounded-[18px] p-5 shadow-none flex flex-col gap-3 border-[var(--border-subtle)]">
          <h3 className="text-[var(--text-secondary)] text-[length:var(--type-card-title)] font-bold">
            Sobre {initialTaskType === "FORM" ? "a tarefa com perguntas" : "a tarefa"}
          </h3>

          <FieldGroup className="gap-3">
            <Field>
              <FieldLabel className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]">
                Título {initialTaskType === "FORM" ? "da tarefa com perguntas" : "da tarefa"} *
              </FieldLabel>
              <Input
                aria-label={initialTaskType === "FORM" ? "Título da tarefa com perguntas" : "Título da tarefa"}
                type="text"
                name="title"
                required
                placeholder={initialTaskType === "FORM" ? "Ex.: Avaliação de Insumos" : "Ex.: Conferir o estoque"}
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

            {initialTaskType === "FORM" ? (
              <Field className="flex flex-col gap-2.5">
                <FormFieldsEditor fields={formFields} onChange={setFormFields} />
              </Field>
            ) : (
              <Field className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <FieldLabel className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]">
                    Instruções passo a passo
                  </FieldLabel>
                  <span className="text-[11px] text-[var(--text-secondary)]">
                    {steps.filter((s) => s.trim()).length} {steps.filter((s) => s.trim()).length === 1 ? "passo definido" : "passos definidos"}
                  </span>
                </div>

                <div className="flex flex-col gap-2.5">
                  {steps.map((step, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="size-7 rounded-lg bg-[var(--canvas)] border border-[var(--border-subtle)] flex items-center justify-center text-xs font-bold text-[var(--brand-900)] shrink-0 select-none">
                        {idx + 1}
                      </span>
                      <Input
                        aria-label={`Passo ${idx + 1}`}
                        placeholder={`Descreva o passo ${idx + 1}...`}
                        value={step}
                        onChange={(e) => handleStepChange(idx, e.target.value)}
                        className="flex-1 h-11 text-[length:var(--type-label)] px-3.5 bg-[var(--canvas)] border-[var(--border-subtle)] rounded-[14px] text-[var(--brand-900)] placeholder:text-[var(--text-secondary)]"
                      />
                      {steps.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveStep(idx)}
                          className="size-9 rounded-xl text-muted-foreground hover:text-red-600 hover:bg-red-50 shrink-0 cursor-pointer"
                          title="Remover passo"
                          aria-label={`Remover passo ${idx + 1}`}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  onClick={handleAddStep}
                  className="w-full h-10 mt-1 rounded-[14px] border-dashed border-[var(--border-subtle)] text-[var(--brand-900)] hover:border-[var(--brand-700)] hover:bg-[var(--canvas)] text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Plus className="size-4" />
                  <span>Adicionar próximo passo</span>
                </Button>
              </Field>
            )}
          </FieldGroup>
        </Card>

        <section className="space-y-4">
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
                  Tempo de tolerância
                </FieldLabel>
                <Select
                  items={toleranceItems}
                  value={toleranceMinutes}
                  onValueChange={(val) => {
                    if (val) setToleranceMinutes(val);
                  }}
                >
                  <SelectTrigger className="w-full h-11 text-[length:var(--type-label)] px-3.5 bg-[var(--canvas)] border-[var(--border-subtle)] rounded-[14px] text-[var(--brand-900)]">
                    <SelectValue placeholder="Tolerância (padrão 20 min)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {toleranceItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </Card>
        </section>

        {initialTaskType !== "FORM" && (
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
        )}

        <Button
          type="submit"
          disabled={loading}
          className="w-full h-13 bg-(--brand-primary) text-white font-semibold text-(length:--type-body) rounded-[16px] shadow-sm hover:bg-(--brand-secondary) active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {loading ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <Plus data-icon="inline-start" className="size-5" />
          )}
          <span>
            {loading
              ? initialTaskType === "FORM"
                ? "Criando tarefa..."
                : "Criando tarefa..."
              : initialTaskType === "FORM"
              ? "Criar tarefa com perguntas"
              : "Criar tarefa"}
          </span>
        </Button>
      </form>
    </div>
  );
}
