"use client";
import { useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Plus,
  Trash2,
  ListChecks,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Clock,
  HelpCircle,
} from "lucide-react";
import { createProcessAction } from "@/presentation/actions/process-actions";
import {
  defaultSchedule,
  describeSchedule,
  processDefinitionSchema,
  type ProcessDefinition,
  type ProcessTaskDefinition,
} from "@/domain/rules/process-definition";
import { PageHeader } from "../shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "@/components/ui/toast";
import { Field, FieldLabel, FieldGroup, FieldSet, FieldLegend } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { ScheduleFields } from "./schedule-fields";
import { cn } from "cn";

export interface ProcessMemberOption {
  id: string;
  name: string;
  role: string;
  teamIds: string[];
  locationIds: string[];
}

type Option = { id: string; name: string };

const steps = ["Dados", "Tarefas", "Dependências", "Rotina", "Aprovações", "Revisão"];
const descriptions = [
  "Dê um nome claro e escolha onde este processo acontece.",
  "Adicione as tarefas passo a passo que a equipe deve realizar.",
  "Defina o que precisa terminar antes de outra tarefa começar.",
  "Escolha os dias e horários em que o processo se repete.",
  "Defina se alguma tarefa exige conferência de um gestor antes de finalizar.",
  "Confira o fluxo completo antes de salvar.",
];

const evidenceOptions: Record<string, string> = {
  "": "Nenhuma (apenas marcar como feita)",
  PHOTO: "Foto obrigatória",
  VIDEO: "Vídeo",
  SIGNATURE: "Assinatura na tela",
  LOCATION: "Localização GPS",
  TEXT: "Texto / Resposta",
  NUMBER: "Valor numérico",
  FILE: "Anexo de arquivo",
};

const durationOptions = [
  { value: 5, label: "5 minutos" },
  { value: 10, label: "10 minutos" },
  { value: 15, label: "15 minutos" },
  { value: 30, label: "30 minutos" },
  { value: 45, label: "45 minutos" },
  { value: 60, label: "1 hora" },
  { value: 90, label: "1 hora e meia" },
  { value: 120, label: "2 horas" },
  { value: 240, label: "4 horas" },
  { value: 480, label: "Turno completo (8 horas)" },
];

const slaOptions = [
  { value: 15, label: "15 minutos" },
  { value: 30, label: "30 minutos" },
  { value: 60, label: "1 hora" },
  { value: 120, label: "2 horas" },
  { value: 240, label: "4 horas" },
  { value: 480, label: "8 horas" },
  { value: 720, label: "12 horas" },
  { value: 1440, label: "24 horas (1 dia)" },
];

export function ProcessEditorWizard({
  locations,
  teams,
  members,
  initial,
  processId,
}: {
  locations: Option[];
  teams: Option[];
  members: ProcessMemberOption[];
  initial?: ProcessDefinition;
  processId?: string;
}) {
  const router = useRouter();
  const heading = useRef<HTMLHeadingElement>(null);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  const [value, setValue] = useState<ProcessDefinition>(
    initial ?? {
      name: "",
      description: "",
      locationId: locations.length === 1 ? locations[0].id : "",
      criticality: "MEDIUM",
      validFrom: "",
      validUntil: "",
      tasks: [],
      schedule: defaultSchedule(),
    },
  );

  // Accordion: controla qual tarefa está aberta na edição de tarefas
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(
    value.tasks.length > 0 ? value.tasks[0].id : null,
  );

  const update = (patch: Partial<ProcessDefinition>) => setValue((v) => ({ ...v, ...patch }));

  const updateTask = (id: string, patch: Partial<ProcessTaskDefinition>) =>
    setValue((v) => ({
      ...v,
      tasks: v.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }));

  const addTask = () => {
    const newId = crypto.randomUUID();
    const newTask: ProcessTaskDefinition = {
      id: newId,
      title: "",
      instructions: "",
      teamId: teams.length === 1 ? teams[0].id : "",
      primaryMemberId: "",
      estimatedDuration: 15,
      slaMinutes: 60,
      required: true,
      evidenceType: "",
      dependsOn: [],
      dependencyType: "BLOCKING",
      dependencyLogic: "AND",
      approverIds: [],
      approvalMode: "SEQUENTIAL",
    };
    update({ tasks: [...value.tasks, newTask] });
    // Fecha todas as outras e abre a nova tarefa
    setExpandedTaskId(newId);
  };

  function removeTask(id: string) {
    update({
      tasks: value.tasks
        .filter((v) => v.id !== id)
        .map((v) => ({ ...v, dependsOn: v.dependsOn.filter((d) => d !== id) })),
    });
    if (expandedTaskId === id) {
      setExpandedTaskId(null);
    }
  }

  function navigate(next: number) {
    if (next > step) {
      if (step === 0 && (value.name.trim().length < 3 || !value.locationId)) {
        toast.add({
          title: "Campos obrigatórios",
          description: "Informe o nome do processo e escolha uma unidade para continuar.",
          type: "warning",
        });
        return;
      }
      if (
        step >= 1 &&
        (!value.tasks.length ||
          value.tasks.some(
            (t) =>
              t.title.trim().length < 3 ||
              !t.teamId ||
              t.estimatedDuration < 1 ||
              t.slaMinutes < 1,
          ))
      ) {
        toast.add({
          title: "Tarefas incompletas",
          description: "Adicione pelo menos uma tarefa e preencha nome, equipe e tempos válidos.",
          type: "warning",
        });
        return;
      }
    }
    setStep(next);
    requestAnimationFrame(() => heading.current?.focus());
  }

  async function save() {
    const parsed = processDefinitionSchema.safeParse(value);
    if (!parsed.success) {
      toast.add({
        title: "Erro de validação",
        description: parsed.error.issues[0].message,
        type: "error",
      });
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.set("definition", JSON.stringify(parsed.data));
      if (processId) form.set("processId", processId);
      const result = await createProcessAction(form);
      if (result.error) {
        toast.add({
          title: "Erro ao salvar processo",
          description: result.error,
          type: "error",
        });
      } else {
        toast.add({
          title: processId ? "Processo atualizado" : "Processo criado",
          description: processId
            ? "O processo foi atualizado com sucesso."
            : "O processo foi criado com sucesso.",
          type: "success",
        });
        router.push("/management/processes");
        router.refresh();
      }
    } catch {
      toast.add({
        title: "Erro ao salvar",
        description: "Não foi possível salvar. Seus dados continuam nesta tela; tente novamente.",
        type: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-stack process-editor">
      <PageHeader
        title={processId ? "Editar processo" : "Criar processo"}
        subtitle="Defina o checklist de tarefas da sua operação para a equipe seguir."
        backHref="/management/processes"
      />

      {(!locations.length || !teams.length) && (
        <Alert>
          <AlertDescription>
            Antes de criar um processo, certifique-se de ter cadastrado ao menos uma{" "}
            <Link className="underline font-semibold" href="/management/locations">
              unidade
            </Link>{" "}
            e uma{" "}
            <Link className="underline font-semibold" href="/management/teams">
              equipe
            </Link>
            .
          </AlertDescription>
        </Alert>
      )}

      <div className="process-builder-layout">
        <nav className="process-step-nav" aria-label="Etapas do processo">
          {steps.map((label, i) => (
            <Button
              key={label}
              type="button"
              variant="ghost"
              aria-current={step === i ? "step" : undefined}
              onClick={() => navigate(i)}
              disabled={busy}
              className={cn(
                "h-auto justify-start font-normal whitespace-normal shadow-none",
                step === i ? "is-current font-bold" : "",
              )}
            >
              <span>{i < step ? <Check size={16} /> : i + 1}</span>
              <span>{label}</span>
            </Button>
          ))}
          <p className="text-caption text-muted-foreground">Etapa {step + 1} de 6</p>
        </nav>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>
              <h2 ref={heading} tabIndex={-1}>
                {steps[step]}
              </h2>
            </CardTitle>
            <CardDescription>{descriptions[step]}</CardDescription>
          </CardHeader>

          <CardContent className="flex flex-col gap-6">
            {step === 0 && (
              <FieldGroup className="gap-4">
                <Field>
                  <FieldLabel htmlFor="process-name">Nome do processo *</FieldLabel>
                  <Input
                    id="process-name"
                    autoFocus
                    value={value.name}
                    onChange={(e) => update({ name: e.target.value })}
                    placeholder="Ex.: Abertura da Loja, Limpeza dos Vestiários, Fechamento de Caixa"
                    maxLength={150}
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="process-description">
                    Descrição ou orientações gerais (opcional)
                  </FieldLabel>
                  <Textarea
                    id="process-description"
                    value={value.description}
                    onChange={(e) => update({ description: e.target.value })}
                    placeholder="Explique resumidamente qual o objetivo deste procedimento para a equipe."
                    rows={3}
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="process-location">Unidade onde este processo acontece *</FieldLabel>
                  <NativeSelect
                    id="process-location"
                    className="w-full"
                    value={value.locationId}
                    onChange={(e) => update({ locationId: e.target.value })}
                  >
                    <NativeSelectOption value="">Selecione a unidade</NativeSelectOption>
                    {locations.map((l) => (
                      <NativeSelectOption key={l.id} value={l.id}>
                        {l.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
              </FieldGroup>
            )}

            {/* ETAPA 1: TAREFAS (COM ACCORDION E SELETORES DE TEMPO) */}
            {step === 1 && (
              <div className="flex flex-col gap-4">
                {!value.tasks.length && (
                  <div className="process-builder-empty">
                    <ListChecks className="size-10 text-brand-700" />
                    <h3>Qual é a primeira tarefa deste processo?</h3>
                    <p>
                      Adicione os passos necessários. Cada tarefa será criada para o colaborador
                      executar e comprovar.
                    </p>
                  </div>
                )}

                {value.tasks.map((t, i) => {
                  const isExpanded = expandedTaskId === t.id;
                  const teamName = teams.find((tm) => tm.id === t.teamId)?.name;

                  return (
                    <div
                      key={t.id}
                      className={cn(
                        "rounded-xl border transition-all",
                        isExpanded
                          ? "border-brand-700 bg-surface shadow-xs"
                          : "border-(--border-subtle) bg-canvas hover:border-brand-300",
                      )}
                    >
                      {/* Accordion Header */}
                      <div
                        className="p-3.5 flex items-center justify-between gap-3 cursor-pointer select-none"
                        onClick={() => setExpandedTaskId(isExpanded ? null : t.id)}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-900 text-xs font-bold">
                            {i + 1}
                          </span>
                          <span className="font-semibold text-sm text-(--text-primary) truncate">
                            {t.title.trim() || `Nova Tarefa ${i + 1}`}
                          </span>
                          {teamName && (
                            <Badge variant="secondary" className="text-xs shrink-0 hidden sm:inline-flex">
                              {teamName}
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-xs shrink-0 text-muted-foreground hidden md:inline-flex">
                            {t.estimatedDuration} min
                          </Badge>
                        </div>

                        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            aria-label={`Remover tarefa ${i + 1}`}
                            onClick={() => removeTask(t.id)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground"
                            onClick={() => setExpandedTaskId(isExpanded ? null : t.id)}
                            aria-label={isExpanded ? "Fechar detalhes" : "Abrir detalhes"}
                          >
                            {isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                          </Button>
                        </div>
                      </div>

                      {/* Accordion Body */}
                      {isExpanded && (
                        <div className="p-4 pt-1 border-t border-(--border-subtle) flex flex-col gap-4">
                          <Field>
                            <FieldLabel htmlFor={`title-${t.id}`}>O que precisa ser feito? *</FieldLabel>
                            <Input
                              id={`title-${t.id}`}
                              value={t.title}
                              onChange={(e) => updateTask(t.id, { title: e.target.value })}
                              placeholder="Ex.: Ligar iluminação e sistema de som"
                              autoFocus={!t.title}
                            />
                          </Field>

                          <Field>
                            <FieldLabel htmlFor={`instructions-${t.id}`}>
                              Instruções passo a passo (opcional)
                            </FieldLabel>
                            <Textarea
                              id={`instructions-${t.id}`}
                              value={t.instructions}
                              onChange={(e) => updateTask(t.id, { instructions: e.target.value })}
                              placeholder="Orientações que o colaborador verá ao iniciar a tarefa."
                              rows={2}
                            />
                          </Field>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <Field>
                              <FieldLabel htmlFor={`team-${t.id}`}>Equipe responsável *</FieldLabel>
                              <NativeSelect
                                id={`team-${t.id}`}
                                className="w-full"
                                value={t.teamId}
                                onChange={(e) =>
                                  updateTask(t.id, {
                                    teamId: e.target.value,
                                    primaryMemberId: "",
                                  })
                                }
                              >
                                <NativeSelectOption value="">Selecione a equipe</NativeSelectOption>
                                {teams.map((v) => (
                                  <NativeSelectOption key={v.id} value={v.id}>
                                    {v.name}
                                  </NativeSelectOption>
                                ))}
                              </NativeSelect>
                            </Field>

                            <Field>
                              <FieldLabel htmlFor={`member-${t.id}`}>
                                Pessoa específica (opcional)
                              </FieldLabel>
                              <NativeSelect
                                id={`member-${t.id}`}
                                className="w-full"
                                value={t.primaryMemberId}
                                onChange={(e) => updateTask(t.id, { primaryMemberId: e.target.value })}
                              >
                                <NativeSelectOption value="">
                                  Qualquer membro da equipe poderá assumir
                                </NativeSelectOption>
                                {members
                                  .filter(
                                    (m) =>
                                      m.teamIds.includes(t.teamId) &&
                                      m.locationIds.includes(value.locationId),
                                  )
                                  .map((m) => (
                                    <NativeSelectOption key={m.id} value={m.id}>
                                      {m.name}
                                    </NativeSelectOption>
                                  ))}
                              </NativeSelect>
                            </Field>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <Field>
                              <FieldLabel htmlFor={`duration-${t.id}`}>
                                Tempo estimado para fazer
                              </FieldLabel>
                              <NativeSelect
                                id={`duration-${t.id}`}
                                className="w-full"
                                value={String(t.estimatedDuration)}
                                onChange={(e) =>
                                  updateTask(t.id, { estimatedDuration: Number(e.target.value) })
                                }
                              >
                                {durationOptions.map((opt) => (
                                  <NativeSelectOption key={opt.value} value={String(opt.value)}>
                                    {opt.label}
                                  </NativeSelectOption>
                                ))}
                              </NativeSelect>
                            </Field>

                            <Field>
                              <FieldLabel htmlFor={`sla-${t.id}`}>
                                Prazo limite para concluir (SLA)
                              </FieldLabel>
                              <NativeSelect
                                id={`sla-${t.id}`}
                                className="w-full"
                                value={String(t.slaMinutes)}
                                onChange={(e) =>
                                  updateTask(t.id, { slaMinutes: Number(e.target.value) })
                                }
                              >
                                {slaOptions.map((opt) => (
                                  <NativeSelectOption key={opt.value} value={String(opt.value)}>
                                    {opt.label}
                                  </NativeSelectOption>
                                ))}
                              </NativeSelect>
                            </Field>
                          </div>

                          <Field>
                            <FieldLabel htmlFor={`evidence-${t.id}`}>
                              Exigir comprovante da entrega
                            </FieldLabel>
                            <NativeSelect
                              id={`evidence-${t.id}`}
                              className="w-full"
                              value={t.evidenceType}
                              onChange={(e) =>
                                updateTask(t.id, {
                                  evidenceType: e.target.value as ProcessTaskDefinition["evidenceType"],
                                })
                              }
                            >
                              {Object.entries(evidenceOptions).map(([v, label]) => (
                                <NativeSelectOption key={v} value={v}>
                                  {label}
                                </NativeSelectOption>
                              ))}
                            </NativeSelect>
                          </Field>

                          <Field orientation="horizontal" className="pt-1">
                            <Checkbox
                              id={`required-${t.id}`}
                              checked={t.required}
                              onCheckedChange={(v) => updateTask(t.id, { required: !!v })}
                            />
                            <FieldLabel htmlFor={`required-${t.id}`}>
                              Tarefa obrigatória (o checklist só fecha após a conclusão desta tarefa)
                            </FieldLabel>
                          </Field>
                        </div>
                      )}
                    </div>
                  );
                })}

                <Button type="button" variant="outline" onClick={addTask} className="h-10 gap-2">
                  <Plus className="size-4" />
                  Adicionar tarefa
                </Button>
              </div>
            )}

            {/* ETAPA 2: DEPENDÊNCIAS */}
            {step === 2 && (
              <div className="flex flex-col gap-4">
                <Alert className="bg-canvas border-(--border-subtle)">
                  <HelpCircle className="size-4 text-brand-700" />
                  <AlertDescription>
                    Se alguma tarefa só puder começar após o término de outra, marque abaixo. Caso
                    contrário, deixe em branco para que todas possam ser iniciadas livremente.
                  </AlertDescription>
                </Alert>

                {value.tasks.map((t, i) => (
                  <FieldSet key={t.id} className="process-task-editor p-4 rounded-xl border border-(--border-subtle)">
                    <FieldLegend className="font-bold text-sm">
                      {i + 1}. {t.title}
                    </FieldLegend>

                    {value.tasks.length === 1 ? (
                      <p className="text-xs text-muted-foreground">
                        Com uma única tarefa, ela inicia de forma independente.
                      </p>
                    ) : (
                      <div className="flex flex-col gap-3 pt-2">
                        <span className="text-xs font-semibold text-brand-900">
                          Esta tarefa só pode começar depois de:
                        </span>
                        {value.tasks
                          .filter((v) => v.id !== t.id)
                          .map((v) => (
                            <Field key={v.id} orientation="horizontal">
                              <Checkbox
                                id={`dep-${t.id}-${v.id}`}
                                checked={t.dependsOn.includes(v.id)}
                                onCheckedChange={(checked) =>
                                  updateTask(t.id, {
                                    dependsOn: checked
                                      ? [...t.dependsOn, v.id]
                                      : t.dependsOn.filter((id) => id !== v.id),
                                  })
                                }
                              />
                              <FieldLabel htmlFor={`dep-${t.id}-${v.id}`}>{v.title}</FieldLabel>
                            </Field>
                          ))}
                      </div>
                    )}
                  </FieldSet>
                ))}
              </div>
            )}

            {/* ETAPA 3: ROTINA */}
            {step === 3 &&
              (processId ? (
                <Alert>
                  <AlertDescription>
                    A edição atualiza as tarefas e a estrutura definida para este processo.
                  </AlertDescription>
                </Alert>
              ) : (
                <FieldGroup className="gap-4">
                  <Field orientation="horizontal">
                    <Checkbox
                      id="has-schedule"
                      checked={!!value.schedule}
                      onCheckedChange={(v) => update({ schedule: v ? defaultSchedule() : null })}
                    />
                    <FieldLabel htmlFor="has-schedule" className="font-semibold text-brand-900">
                      Programar repetição automática agora (Rotina)
                    </FieldLabel>
                  </Field>

                  {value.schedule ? (
                    <ScheduleFields value={value.schedule} onChange={(schedule) => update({ schedule })} />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Você pode salvar agora sem agendamento e programar a rotina quando quiser.
                    </p>
                  )}
                </FieldGroup>
              ))}

            {/* ETAPA 4: APROVAÇÕES (SIMPLIFICADO E EXPLICADO) */}
            {step === 4 && (
              <div className="flex flex-col gap-4">
                <Alert className="bg-brand-soft/30 border-brand-200">
                  <ShieldCheck className="size-4 text-brand-900 shrink-0" />
                  <AlertDescription className="text-xs leading-relaxed text-brand-900">
                    <strong>O que é Aprovação?</strong> Quando uma tarefa tem aprovação ativada, assim
                    que o funcionário clica em Concluir e anexa a foto, a tarefa entra em{" "}
                    <em>Aguardando Aprovação</em>. Um gerente precisa conferir e aprovar para que ela
                    seja finalizada oficialmente. Se não precisa de conferência, deixe desmarcado!
                  </AlertDescription>
                </Alert>

                {value.tasks.map((t, i) => {
                  const hasApprover = t.approverIds.length > 0;
                  const eligibleManagers = members.filter(
                    (m) =>
                      ["OWNER", "ADMIN", "MANAGER"].includes(m.role) &&
                      (m.role !== "MANAGER" ||
                        (m.teamIds.includes(t.teamId) && m.locationIds.includes(value.locationId))),
                  );

                  return (
                    <FieldSet key={t.id} className="process-task-editor p-4 rounded-xl border border-(--border-subtle)">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <FieldLegend className="font-bold text-sm">
                          {i + 1}. {t.title}
                        </FieldLegend>
                        {hasApprover && (
                          <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-900">
                            Exige aprovação
                          </Badge>
                        )}
                      </div>

                      <div className="flex flex-col gap-2.5">
                        <Field orientation="horizontal">
                          <Checkbox
                            id={`require-approval-${t.id}`}
                            checked={hasApprover}
                            onCheckedChange={(checked) => {
                              if (!checked) {
                                updateTask(t.id, { approverIds: [] });
                              } else {
                                // Seleciona o primeiro gestor por padrão
                                const first = eligibleManagers[0];
                                updateTask(t.id, {
                                  approverIds: first ? [first.id] : [],
                                });
                              }
                            }}
                          />
                          <FieldLabel htmlFor={`require-approval-${t.id}`} className="font-medium text-xs">
                            Exigir que um gerente aprove esta tarefa após o envio
                          </FieldLabel>
                        </Field>

                        {hasApprover && (
                          <div className="pl-6 pt-1 flex flex-col gap-2">
                            <span className="text-xs text-muted-foreground">
                              Quem pode revisar e aprovar esta tarefa:
                            </span>
                            <div className="flex flex-wrap gap-3">
                              {eligibleManagers.map((m) => (
                                <Field key={m.id} orientation="horizontal" className="w-auto">
                                  <Checkbox
                                    id={`appr-${t.id}-${m.id}`}
                                    checked={t.approverIds.includes(m.id)}
                                    onCheckedChange={(v) =>
                                      updateTask(t.id, {
                                        approverIds: v
                                          ? [...t.approverIds, m.id]
                                          : t.approverIds.filter((id) => id !== m.id),
                                      })
                                    }
                                  />
                                  <FieldLabel htmlFor={`appr-${t.id}-${m.id}`} className="text-xs">
                                    {m.name} ({m.role})
                                  </FieldLabel>
                                </Field>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </FieldSet>
                  );
                })}
              </div>
            )}

            {/* ETAPA 5: REVISÃO */}
            {step === 5 && (
              <>
                <div className="process-review-summary p-4 bg-brand-soft/20 rounded-xl border border-brand-200">
                  <h3 className="text-lg font-bold text-brand-900">{value.name}</h3>
                  <p className="text-sm text-brand-800">
                    {locations.find((l) => l.id === value.locationId)?.name} · {value.tasks.length}{" "}
                    {value.tasks.length === 1 ? "tarefa" : "tarefas"}
                  </p>
                  <p className="text-xs text-brand-700 mt-1">
                    {value.schedule ? describeSchedule(value.schedule) : "Sem repetição automática programada"}
                  </p>
                </div>

                <ol className="process-flow" aria-label="Fluxo do processo">
                  {value.tasks.map((t, i) => (
                    <li key={t.id}>
                      <span className="process-flow-number">{i + 1}</span>
                      <div>
                        <h3 className="font-semibold text-sm">{t.title}</h3>
                        <p className="text-xs text-muted-foreground">
                          {teams.find((v) => v.id === t.teamId)?.name} · {t.estimatedDuration} min ·{" "}
                          {t.required ? "Obrigatória" : "Opcional"}
                        </p>
                        {t.evidenceType && (
                          <div className="mt-1">
                            <Badge variant="secondary" className="text-xs">
                              {evidenceOptions[t.evidenceType]}
                            </Badge>
                          </div>
                        )}
                        {t.approverIds.length > 0 && (
                          <p className="text-xs text-amber-700 font-medium mt-1">
                            Requer aprovação de gestor
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>

                <Alert>
                  <AlertDescription>
                    {processId
                      ? "As alterações valem apenas para as próximas execuções. O histórico passado permanece intacto."
                      : "Ao clicar em Salvar, este processo ficará ativo e as tarefas serão geradas automaticamente nos horários programados."}
                  </AlertDescription>
                </Alert>
              </>
            )}

            <div className="process-editor-footer flex items-center justify-between pt-4 border-t border-(--border-subtle)">
              <Button
                type="button"
                variant="outline"
                disabled={step === 0 || busy}
                onClick={() => navigate(step - 1)}
              >
                <ArrowLeft data-icon="inline-start" className="size-4" />
                Voltar
              </Button>
              <span className="text-xs text-muted-foreground">{step + 1} de 6</span>
              {step < 5 ? (
                <Button type="button" onClick={() => navigate(step + 1)}>
                  Continuar
                  <ArrowRight data-icon="inline-end" className="size-4" />
                </Button>
              ) : (
                <Button type="button" disabled={busy} onClick={save} className="bg-brand-900 text-white hover:bg-brand-700">
                  {busy ? <Spinner data-icon="inline-start" className="size-4" /> : <Check data-icon="inline-start" className="size-4" />}
                  {busy ? "Salvando…" : "Salvar processo"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
