"use client";
import { useState, useRef, useEffect } from "react";
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
  X,
  FileText,
  Users,
  ArrowUp,
  ArrowDown,
  GripVertical,
  Type,
  Star,
  Menu,
  Copy,
  Image as ImageIcon
} from "lucide-react";
import { Reorder, motion } from "framer-motion";
import { createProcessAction } from "@/presentation/actions/process-actions";
import {
  defaultSchedule,
  describeSchedule,
  processDefinitionSchema,
  type ProcessDefinition,
  type ProcessTaskDefinition,
  type FormFieldDefinition,
} from "@/domain/rules/process-definition";
import { inferDependencyMode } from "@/domain/rules/reusable-template-definition";
import { TemplateSheet } from "@/presentation/components/templates/template-sheet";
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
import { FormFieldsEditor } from "@/presentation/components/shared/form-fields-editor";
import { uiLabel } from "@/presentation/components/shared/ui-labels";
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

function wouldCreateCycle(
  tasks: ProcessTaskDefinition[],
  taskId: string,
  candidatePrerequisiteId: string,
): boolean {
  if (taskId === candidatePrerequisiteId) return true;
  const visited = new Set<string>();
  const queue = [candidatePrerequisiteId];
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (currentId === taskId) return true;
    if (visited.has(currentId)) continue;
    visited.add(currentId);
    const current = tasks.find((t) => t.id === currentId);
    if (current) {
      for (const parentId of current.dependsOn) {
        queue.push(parentId);
      }
    }
  }
  return false;
}

function parseInstructionsToSteps(instructions: string): string[] {
  if (!instructions || !instructions.trim()) return [""];
  const lines = instructions
    .split("\n")
    .map((l) => l.replace(/^\d+[\.\)]\s*/, "").trim())
    .filter(Boolean);
  return lines.length > 0 ? lines : [""];
}

function serializeStepsToInstructions(steps: string[]): string {
  return steps
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s, i) => `${i + 1}. ${s}`)
    .join("\n");
}

function TaskStepsEditor({
  instructions,
  onChange,
}: {
  instructions: string;
  onChange: (val: string) => void;
}) {
  const [steps, setSteps] = useState<string[]>(() => parseInstructionsToSteps(instructions));
  const isInternalChange = useRef(false);

  const syncToParent = (nextSteps: string[]) => {
    isInternalChange.current = true;
    const serialized = nextSteps
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s, i) => `${i + 1}. ${s}`)
      .join("\n");
    onChange(serialized);
  };

  useEffect(() => {
    if (isInternalChange.current) {
      isInternalChange.current = false;
      return;
    }
    setSteps(parseInstructionsToSteps(instructions));
  }, [instructions]);

  const handleStepChange = (index: number, val: string) => {
    const next = [...steps];
    next[index] = val;
    setSteps(next);
    syncToParent(next);
  };

  const handleAddStep = () => {
    setSteps((prev) => [...prev, ""]);
  };

  const handleRemoveStep = (index: number) => {
    const next = steps.length > 1 ? steps.filter((_, i) => i !== index) : [""];
    setSteps(next);
    syncToParent(next);
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <FieldLabel className="text-xs font-semibold text-foreground">
          Instruções passo a passo
        </FieldLabel>
        <span className="text-[11px] text-muted-foreground font-medium">
          {steps.filter((s) => s.trim()).length}{" "}
          {steps.filter((s) => s.trim()).length === 1 ? "passo definido" : "passos definidos"}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {steps.map((step, idx) => (
          <div key={idx} className="flex items-center gap-2 min-w-0 w-full">
            <span className="size-7 rounded-lg bg-surface border border-(--border-subtle) flex items-center justify-center text-xs font-bold text-foreground shrink-0 select-none shadow-2xs">
              {idx + 1}
            </span>
            <Input
              placeholder={`Descreva o passo ${idx + 1}...`}
              value={step}
              onChange={(e) => handleStepChange(idx, e.target.value)}
              className="flex-1 min-w-0 h-10 sm:h-11 text-sm px-3.5 bg-surface border-(--border-subtle) rounded-xl sm:rounded-[14px] text-foreground placeholder:text-muted-foreground"
            />
            {steps.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => handleRemoveStep(idx)}
                className="size-9 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0 cursor-pointer"
                title="Remover passo"
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
        className="w-full h-10 mt-1 rounded-xl sm:rounded-[14px] border-dashed border-(--border-subtle) text-foreground hover:border-brand-700 hover:bg-surface text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
      >
        <Plus className="size-4" />
        <span>Adicionar próximo passo</span>
      </Button>
    </div>
  );
}


export function ProcessEditorWizard({
  locations,
  teams,
  members,
  initial,
  processId, templateMode = false, templateReference, onSaveDefinition, routineId, routinesCount = 0, metadataDirty = false,
}: {
  locations: Option[];
  teams: Option[];
  members: ProcessMemberOption[];
  initial?: ProcessDefinition;
  processId?: string;
  routineId?: string;
  routinesCount?: number;
  templateMode?: boolean;
  metadataDirty?: boolean;
  templateReference?: string;
  onSaveDefinition?: (definition: ProcessDefinition, publish: boolean) => Promise<{ error?: string; data?: { id: string } }>;
}) {
  const router = useRouter();
  const heading = useRef<HTMLHeadingElement>(null);
  const [step, setStep] = useState(0);
  const [requestId] = useState(() => crypto.randomUUID());
  const [approvalEnabled, setApprovalEnabled] = useState<Set<string>>(() => new Set(initial?.tasks.filter(t => t.approverIds.length).map(t => t.id)));
  const [busy, setBusy] = useState(false);
  const [dependencyMode, setDependencyMode] = useState<"FREE" | "STRICT" | "CUSTOM">(() => inferDependencyMode(initial?.tasks ?? []));
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(max-width: 640px)");
    setIsMobile(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

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

  const savedValue = useRef(JSON.stringify(value));
  const allowLeave = useRef(false);
  const [leaveHref, setLeaveHref] = useState<string | null>(null);
  useEffect(() => {
    const dirty = () => !allowLeave.current && (metadataDirty || JSON.stringify(value) !== savedValue.current);
    const warn = (event: BeforeUnloadEvent) => { if (dirty()) event.preventDefault(); };
    const navigateAway = (event: MouseEvent) => {
      if (!dirty() || event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      const link = (event.target as Element).closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || link.target === "_blank" || link.hasAttribute("download") || link.getAttribute("href")?.startsWith("#") || link.href === window.location.href) return;
      event.preventDefault(); event.stopPropagation(); setLeaveHref(link.href);
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", navigateAway, true);
    return () => { window.removeEventListener("beforeunload", warn); document.removeEventListener("click", navigateAway, true); };
  }, [value, metadataDirty]);

  // Accordion: controla qual tarefa está aberta na edição de tarefas
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(
    value.tasks.length > 0 ? value.tasks[0].id : null,
  );

  // Sub-seções de cada tarefa: "Sobre a tarefa" aberta por padrão, demais colapsadas
  const [taskSectionsOpen, setTaskSectionsOpen] = useState<
    Record<
      string,
      {
        about?: boolean;
        assignment?: boolean;
        deadlines?: boolean;
        evidence?: boolean;
      }
    >
  >({});

  const isSectionOpen = (
    taskId: string,
    section: "about" | "assignment" | "deadlines" | "evidence",
  ): boolean => {
    const taskState = taskSectionsOpen[taskId];
    if (!taskState) {
      return section === "about"; // "Sobre a tarefa" começa ABERTA por padrão, as demais fechadas
    }
    return taskState[section] ?? (section === "about");
  };

  const toggleTaskSection = (
    taskId: string,
    section: "about" | "assignment" | "deadlines" | "evidence",
  ) => {
    setTaskSectionsOpen((prev) => {
      const current = prev[taskId] ?? {
        about: true,
        assignment: false,
        deadlines: false,
        evidence: false,
      };
      const currentlyOpen = current[section] ?? (section === "about");
      return {
        ...prev,
        [taskId]: {
          ...current,
          [section]: !currentlyOpen,
        },
      };
    });
  };

  const update = (patch: Partial<ProcessDefinition>) => setValue((v) => ({ ...v, ...patch }));

  const updateTask = (id: string, patch: Partial<ProcessTaskDefinition>) =>
    setValue((v) => ({
      ...v,
      tasks: v.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }));

  const addTask = (taskType: "STANDARD" | "FORM" = "STANDARD") => {
    const newId = crypto.randomUUID();
    const newTask: ProcessTaskDefinition = {
      id: newId,
      taskType,
      title: "",
      objective: "",
      instructions: "",
      formFields: [],
      teamId: teams.length === 1 ? teams[0].id : "",
      primaryMemberId: "",
      priority: "MEDIUM",
      criticality: "MEDIUM",
      deadlineAt: "",
      slaMinutes: 60,
      toleranceMinutes: 20,
      required: true,
      evidenceType: "",
      dependsOn: [],
      dependencyType: "BLOCKING",
      dependencyLogic: "AND",
      approverIds: [],
      approvalMode: "SEQUENTIAL",
    };
    const next = [...value.tasks, newTask];
    update({ tasks: dependencyMode === "STRICT" ? next.map((t, i) => ({ ...t, dependsOn: i ? [next[i - 1].id] : [] })) : next });
    // Fecha todas as outras e abre a nova tarefa
    setExpandedTaskId(newId);
  };

  function removeTask(id: string) {
    const next = value.tasks.filter(t => t.id !== id);
    update({ tasks: next.map((t, i) => ({ ...t, dependsOn: dependencyMode === "STRICT" ? i ? [next[i - 1].id] : [] : t.dependsOn.filter(d => d !== id) })) });
    if (expandedTaskId === id) {
      setExpandedTaskId(null);
    }
  }

  function findFirstError(
    def: ProcessDefinition,
    approvalActive: Set<string>,
  ): { step: number; message: string; taskId?: string } | null {
    // Passo 0: Dados
    if (def.name.trim().length < 3) {
      return {
        step: 0,
        message: "O nome deve ter pelo menos 3 caracteres.",
      };
    }
    if (!templateMode && !def.locationId) {
      return {
        step: 0,
        message: "Escolha uma unidade para o processo.",
      };
    }

    // Passo 1: Tarefas
    if (!def.tasks.length) {
      return {
        step: 1,
        message: "Adicione pelo menos uma tarefa.",
      };
    }
    for (let i = 0; i < def.tasks.length; i++) {
      const t = def.tasks[i];
      if (t.title.trim().length < 3) {
        return {
          step: 1,
          message: `Informe um título de pelo menos 3 caracteres para a tarefa ${i + 1}.`,
          taskId: t.id,
        };
      }
      if (!t.teamId) {
        return {
          step: 1,
          message: `Selecione a equipe responsável pela tarefa "${t.title || `Tarefa ${i + 1}`}".`,
          taskId: t.id,
        };
      }
    }

    // Passo 2: Dependências
    for (const t of def.tasks) {
      if (t.dependsOn.includes(t.id)) {
        return {
          step: 2,
          message: `A tarefa "${t.title}" não pode depender de si mesma.`,
          taskId: t.id,
        };
      }
      if (t.dependsOn.some((depId) => wouldCreateCycle(def.tasks, t.id, depId))) {
        return {
          step: 2,
          message: `Existe um ciclo de dependências na tarefa "${t.title}".`,
          taskId: t.id,
        };
      }
    }

    // Passo 4: Aprovações
    for (const t of def.tasks) {
      if ((approvalActive.has(t.id) || t.approverIds.length > 0) && !t.approverIds.length) {
        return {
          step: 4,
          message: `Selecione ao menos um aprovador para a tarefa "${t.title}".`,
          taskId: t.id,
        };
      }
    }

    // Validação Zod completa
    const parsed = processDefinitionSchema.safeParse(def);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const path0 = String(issue.path[0] ?? "");
      if (path0 === "name" || path0 === "locationId" || path0 === "criticality" || path0 === "description") {
        return { step: 0, message: issue.message };
      }
      if (path0 === "schedule") {
        return { step: 3, message: issue.message };
      }
      if (path0 === "tasks") {
        if (typeof issue.path[1] === "number") {
          const task = def.tasks[issue.path[1]];
          const field = String(issue.path[2] ?? "");
          if (field === "dependsOn" || field === "dependencyType" || field === "dependencyLogic") {
            return { step: 2, message: issue.message, taskId: task?.id };
          }
          if (field === "approverIds" || field === "approvalMode") {
            return { step: 4, message: issue.message, taskId: task?.id };
          }
          return { step: 1, message: issue.message, taskId: task?.id };
        }
        return { step: 1, message: issue.message };
      }
      return { step: 0, message: issue.message };
    }

    return null;
  }

  function inferStepFromServerErrorMessage(error: string): number {
    const lower = error.toLowerCase();
    if (lower.includes("aprovador") || lower.includes("aprovação") || lower.includes("aprovar")) {
      return 4; // Aprovações
    }
    if (lower.includes("rotina") || lower.includes("programação") || lower.includes("horário") || lower.includes("frequência") || lower.includes("dias")) {
      return 3; // Rotina
    }
    if (lower.includes("dependência") || lower.includes("ciclo") || lower.includes("bloqueio")) {
      return 2; // Dependências
    }
    if (lower.includes("equipe") || lower.includes("tarefa") || lower.includes("responsável") || lower.includes("executor") || lower.includes("pergunta") || lower.includes("evidência") || lower.includes("instrução") || lower.includes("título")) {
      return 1; // Tarefas
    }
    if (lower.includes("unidade") || lower.includes("nome") || lower.includes("descrição") || lower.includes("criticidade")) {
      return 0; // Dados
    }
    return 0;
  }

  function navigate(next: number) {
    if (next > step) {
      const err = findFirstError(value, approvalEnabled);
      if (err && err.step < next) {
        setStep(err.step);
        if (err.taskId) setExpandedTaskId(err.taskId);
        toast.add({
          title: "Atenção",
          description: err.message,
          type: "warning",
        });
        requestAnimationFrame(() => heading.current?.focus());
        return;
      }
    }
    setStep(next);
    requestAnimationFrame(() => heading.current?.focus());
  }

  const handleDependencyModeChange = (mode: "FREE" | "STRICT" | "CUSTOM") => {
    setDependencyMode(mode);
    if (mode === "FREE") {
      update({ tasks: value.tasks.map(t => ({ ...t, dependsOn: [] })) });
    } else if (mode === "STRICT") {
      const newTasks = value.tasks.map((t, i) => ({
        ...t,
        dependsOn: i === 0 ? [] : [value.tasks[i - 1].id]
      }));
      update({ tasks: newTasks });
    }
  };

  const handleReorder = (reorderedTasks: typeof value.tasks) => {
    if (dependencyMode === "STRICT") {
      const newTasks = reorderedTasks.map((t, i) => ({
        ...t,
        dependsOn: i === 0 ? [] : [reorderedTasks[i - 1].id]
      }));
      update({ tasks: newTasks });
    } else {
      update({ tasks: reorderedTasks });
    }
  };

  const moveTask = (index: number, direction: "UP" | "DOWN") => {
    const newTasks = [...value.tasks];
    if (direction === "UP" && index > 0) {
      [newTasks[index], newTasks[index - 1]] = [newTasks[index - 1], newTasks[index]];
    } else if (direction === "DOWN" && index < newTasks.length - 1) {
      [newTasks[index], newTasks[index + 1]] = [newTasks[index + 1], newTasks[index]];
    }
    handleReorder(newTasks);
  };

  async function save(publish = true) {
    const localErr = findFirstError(value, approvalEnabled);
    if (localErr) {
      setStep(localErr.step);
      if (localErr.taskId) setExpandedTaskId(localErr.taskId);
      toast.add({
        title: "Revise os campos obrigatórios",
        description: localErr.message,
        type: "warning",
      });
      requestAnimationFrame(() => heading.current?.focus());
      return;
    }

    if (templateMode && onSaveDefinition) {
      setBusy(true);
      try {
        const result = await onSaveDefinition(value, publish);
        if (result.error) {
          const targetStep = inferStepFromServerErrorMessage(result.error);
          setStep(targetStep);
          toast.add({ title: "Revise o template", description: result.error, type: "error" });
          requestAnimationFrame(() => heading.current?.focus());
        } else {
          savedValue.current = JSON.stringify(value);
          allowLeave.current = true;
          toast.add({
            title: publish ? "Template publicado com sucesso" : "Rascunho salvo com sucesso",
            description: "Redirecionando para a biblioteca de templates…",
            type: "success",
          });
          router.push("/management/templates");
          router.refresh();
        }
      } catch {
        toast.add({ title: "Não foi possível salvar. Tente novamente.", type: "error" });
      } finally {
        setBusy(false);
      }
      return;
    }

    setBusy(true);
    try {
      const form = new FormData();
      form.set("definition", JSON.stringify(value));
      form.set("requestId", requestId);
      if (templateReference) form.set("templateReference", templateReference);
      if (processId) form.set("processId", processId);
      if (routineId) form.set("routineId", routineId);
      const result = await createProcessAction(form);
      if (result.error) {
        const targetStep = inferStepFromServerErrorMessage(result.error);
        setStep(targetStep);
        toast.add({
          title: "Erro ao salvar processo",
          description: result.error,
          type: "error",
        });
        requestAnimationFrame(() => heading.current?.focus());
      } else {
        toast.add({
          title: processId ? "Processo atualizado com sucesso" : "Processo criado com sucesso",
          description: "Redirecionando para a listagem de processos…",
          type: "success",
        });
        savedValue.current = JSON.stringify(value);
        allowLeave.current = true;
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
    <div>
      <PageHeader
        title={templateMode ? "Editar template" : processId ? "Editar processo" : "Criar processo"}
        subtitle="Defina o checklist de tarefas da sua operação para a equipe seguir."
        backHref={templateMode ? "/management/templates" : "/management/processes"}
      />

      {templateMode && <div className="mb-4"><Button variant="outline" disabled={busy} onClick={() => save(false)}>Salvar rascunho</Button><p className="text-xs text-muted-foreground mt-2">Edite livremente e publique quando estiver pronto. Processos já criados preservam sua configuração.</p></div>}
      {(!locations.length || !teams.length) && (
        <Alert className="mb-4">
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

        <Card className="min-w-0 flex-1">
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
                    className="text-sm!"
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
                    className="text-sm!"
                  />
                </Field>

                <Field><FieldLabel htmlFor="process-criticality">Criticidade do processo</FieldLabel><NativeSelect id="process-criticality" value={value.criticality} onChange={e => update({ criticality: e.target.value as ProcessDefinition["criticality"] })}>{criticalityItems.map(c => <NativeSelectOption value={c.value} key={c.value}>{c.label}</NativeSelectOption>)}</NativeSelect></Field>
                {!templateMode && <>
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
                  <div className="grid gap-3 sm:grid-cols-2"><Field><FieldLabel htmlFor="process-valid-from">Válido a partir de (opcional)</FieldLabel><Input id="process-valid-from" type="date" value={value.validFrom} onChange={e => update({ validFrom: e.target.value })} /></Field><Field><FieldLabel htmlFor="process-valid-until">Válido até (opcional)</FieldLabel><Input id="process-valid-until" type="date" value={value.validUntil} onChange={e => update({ validUntil: e.target.value })} /></Field></div>
                </>}
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
                  const primaryMemberName = members.find((m) => m.id === t.primaryMemberId)?.name;
                  const currentPriority = priorityItems.find((p) => p.value === (t.priority || "MEDIUM"))?.label || "Média";
                  const currentCriticality = criticalityItems.find((c) => c.value === (t.criticality || "MEDIUM"))?.label || "Média";
                  const currentTolerance = toleranceItems.find((tol) => tol.value === String(t.toleranceMinutes ?? 20))?.label || `${t.toleranceMinutes ?? 20} min`;
                  const currentEvidence = evidenceOptions[t.evidenceType] || "Nenhum";

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
                            {t.title.trim() || (t.taskType === "FORM" ? `Nova Tarefa com Perguntas ${i + 1}` : `Nova Tarefa ${i + 1}`)}
                          </span>
                          {teamName && (
                            <Badge variant="secondary" className="text-xs shrink-0 hidden sm:inline-flex">
                              {teamName}
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-xs shrink-0 text-muted-foreground hidden md:inline-flex">
                            {t.toleranceMinutes ?? 20} min
                          </Badge>
                        </div>

                        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <Button type="button" variant="ghost" size="icon" aria-label={`Duplicar tarefa ${i + 1}`} onClick={() => {
                            const copy = { ...t, id: crypto.randomUUID(), title: (t.title + " — cópia").slice(0, 200), formFields: t.formFields.map(f => ({ ...f, id: crypto.randomUUID() })) };
                            const next = [...value.tasks]; next.splice(i + 1, 0, copy); handleReorder(next); setExpandedTaskId(copy.id);
                          }}><Copy className="size-4" /></Button>
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
                        <div className="p-3 sm:p-5 pt-3 border-t border-(--border-subtle) flex flex-col gap-3.5 bg-canvas/40">
                          {/* 1. SEÇÃO: Sobre a tarefa (Aberta por padrão, mas pode ser fechada) */}
                          <div className="rounded-xl border border-(--border-subtle) bg-surface overflow-hidden shadow-2xs">
                            <button
                              type="button"
                              onClick={() => toggleTaskSection(t.id, "about")}
                              className="w-full p-3.5 sm:p-4 flex items-center justify-between gap-3 text-left hover:bg-canvas/60 transition-colors select-none cursor-pointer"
                              aria-expanded={isSectionOpen(t.id, "about")}
                            >
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                <div className="size-8 rounded-lg bg-brand-soft text-brand-900 border border-brand-200/60 flex items-center justify-center shrink-0">
                                  {t.taskType === "FORM" ? <ListChecks className="size-4" /> : <FileText className="size-4" />}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-foreground tracking-wide uppercase">
                                      {t.taskType === "FORM" ? "Sobre a tarefa com perguntas" : "Sobre a tarefa"}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground font-medium uppercase px-1.5 py-0.5 rounded bg-muted/60">
                                      Principal
                                    </span>
                                  </div>
                                  {!isSectionOpen(t.id, "about") && (
                                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                                      {t.title ? t.title : "Defina o título, objetivo e instruções..."}
                                    </p>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-xs font-medium text-muted-foreground hidden sm:inline">
                                  {isSectionOpen(t.id, "about") ? "Recolher" : "Editar"}
                                </span>
                                <div className="size-7 rounded-lg border border-(--border-subtle) flex items-center justify-center text-muted-foreground">
                                  {isSectionOpen(t.id, "about") ? (
                                    <ChevronUp className="size-4" />
                                  ) : (
                                    <ChevronDown className="size-4" />
                                  )}
                                </div>
                              </div>
                            </button>

                            {isSectionOpen(t.id, "about") && (
                              <div className="p-4 sm:p-5 pt-2 border-t border-(--border-subtle) flex flex-col gap-4 bg-canvas/30">
                                <Field><FieldLabel htmlFor={`task-type-${t.id}`}>Tipo de tarefa</FieldLabel><NativeSelect id={`task-type-${t.id}`} value={t.taskType} onChange={e => { const nextType = e.target.value as "STANDARD" | "FORM"; updateTask(t.id, { taskType: nextType, ...(nextType === "FORM" ? { evidenceType: "", instructions: "" } : {}) }); }}><NativeSelectOption value="STANDARD">Checklist</NativeSelectOption><NativeSelectOption value="FORM">Tarefa com perguntas</NativeSelectOption></NativeSelect></Field>
                                <Field>
                                  <FieldLabel htmlFor={`title-${t.id}`} className="text-xs font-semibold text-foreground">
                                    {t.taskType === "FORM" ? "Título da tarefa com perguntas *" : "Título da tarefa *"}
                                  </FieldLabel>
                                  <Input
                                    id={`title-${t.id}`}
                                    value={t.title}
                                    onChange={(e) => updateTask(t.id, { title: e.target.value })}
                                    placeholder={t.taskType === "FORM" ? "Ex.: Avaliação de Qualidade" : "Ex.: Ligar iluminação e sistema de som"}
                                    autoFocus={!t.title}
                                    className="w-full h-10 sm:h-11 text-sm px-3.5 bg-surface border-(--border-subtle) rounded-xl sm:rounded-[14px] text-foreground placeholder:text-muted-foreground"
                                  />
                                </Field>

                                <Field>
                                  <FieldLabel htmlFor={`objective-${t.id}`} className="text-xs font-semibold text-foreground">
                                    Objetivo
                                  </FieldLabel>
                                  <Textarea
                                    id={`objective-${t.id}`}
                                    value={t.objective || ""}
                                    onChange={(e) => updateTask(t.id, { objective: e.target.value })}
                                    placeholder={t.taskType === "FORM" ? "Descreva o objetivo desta tarefa com perguntas..." : "Explique o que precisa ser verificado ou executado..."}
                                    rows={2}
                                    className="w-full text-sm p-3 bg-surface border-(--border-subtle) rounded-xl sm:rounded-[14px] text-foreground placeholder:text-muted-foreground resize-none"
                                  />
                                </Field>

                                {t.taskType !== "FORM" && (
                                  <TaskStepsEditor key={"steps-" + t.id} instructions={t.instructions} onChange={val => updateTask(t.id, { instructions: val })} />
                                )}
                                {t.taskType === "FORM" && <FormFieldsEditor key={"fields-" + t.id} fields={t.formFields} onChange={val => updateTask(t.id, { formFields: val })} />}

                              </div>
                            )}
                          </div>

                          {/* 2. SEÇÃO: Unidade e responsável (Colapsada por padrão) */}
                          <div className="rounded-xl border border-(--border-subtle) bg-surface overflow-hidden shadow-2xs">
                            <button
                              type="button"
                              onClick={() => toggleTaskSection(t.id, "assignment")}
                              className="w-full p-3.5 sm:p-4 flex items-center justify-between gap-3 text-left hover:bg-canvas/60 transition-colors select-none cursor-pointer"
                              aria-expanded={isSectionOpen(t.id, "assignment")}
                            >
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                <div className="size-8 rounded-lg bg-brand-soft text-brand-900 border border-brand-200/60 flex items-center justify-center shrink-0">
                                  <Users className="size-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-foreground tracking-wide uppercase">
                                      Unidade e responsável
                                    </span>
                                  </div>
                                  {!isSectionOpen(t.id, "assignment") && (
                                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-brand-soft text-brand-900 border border-brand-200/50">
                                        {teamName ? `Equipe: ${teamName}` : "⚠️ Equipe não selecionada"}
                                      </span>
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-canvas text-muted-foreground border border-(--border-subtle)">
                                        {primaryMemberName ? `Resp: ${primaryMemberName}` : "Qualquer membro da equipe"}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-xs font-medium text-muted-foreground hidden sm:inline">
                                  {isSectionOpen(t.id, "assignment") ? "Recolher" : "Editar"}
                                </span>
                                <div className="size-7 rounded-lg border border-(--border-subtle) flex items-center justify-center text-muted-foreground">
                                  {isSectionOpen(t.id, "assignment") ? (
                                    <ChevronUp className="size-4" />
                                  ) : (
                                    <ChevronDown className="size-4" />
                                  )}
                                </div>
                              </div>
                            </button>

                            {isSectionOpen(t.id, "assignment") && (
                              <div className="p-4 sm:p-5 pt-3 border-t border-(--border-subtle) bg-canvas/30">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4">
                                  <Field>
                                    <FieldLabel htmlFor={`team-${t.id}`} className="text-xs font-semibold text-foreground">
                                      Equipe responsável *
                                    </FieldLabel>
                                    <NativeSelect
                                      id={`team-${t.id}`}
                                      className="w-full h-10 sm:h-11 text-sm px-3 bg-surface border-(--border-subtle) rounded-xl sm:rounded-[14px] text-foreground"
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
                                    <FieldLabel htmlFor={`member-${t.id}`} className="text-xs font-semibold text-foreground">
                                      Responsável principal
                                    </FieldLabel>
                                    <NativeSelect
                                      id={`member-${t.id}`}
                                      className="w-full h-10 sm:h-11 text-sm px-3 bg-surface border-(--border-subtle) rounded-xl sm:rounded-[14px] text-foreground"
                                      value={t.primaryMemberId}
                                      onChange={(e) => updateTask(t.id, { primaryMemberId: e.target.value })}
                                    >
                                      <NativeSelectOption value="">
                                        Qualquer membro da equipe poderá assumir
                                      </NativeSelectOption>
                                      {members
                                        .filter(
                                          (m) =>
                                            (!templateMode || m.role === "EMPLOYEE") && m.teamIds.includes(t.teamId) &&
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
                              </div>
                            )}
                          </div>

                          {/* 3. SEÇÃO: Prazos e prioridade (Colapsada por padrão) */}
                          <div className="rounded-xl border border-(--border-subtle) bg-surface overflow-hidden shadow-2xs">
                            <button
                              type="button"
                              onClick={() => toggleTaskSection(t.id, "deadlines")}
                              className="w-full p-3.5 sm:p-4 flex items-center justify-between gap-3 text-left hover:bg-canvas/60 transition-colors select-none cursor-pointer"
                              aria-expanded={isSectionOpen(t.id, "deadlines")}
                            >
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                <div className="size-8 rounded-lg bg-brand-soft text-brand-900 border border-brand-200/60 flex items-center justify-center shrink-0">
                                  <Clock className="size-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-foreground tracking-wide uppercase">
                                      Prazos e prioridade
                                    </span>
                                  </div>
                                  {!isSectionOpen(t.id, "deadlines") && (
                                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-canvas text-muted-foreground border border-(--border-subtle)">
                                        Prioridade: {currentPriority}
                                      </span>
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-canvas text-muted-foreground border border-(--border-subtle)">
                                        Criticidade: {currentCriticality}
                                      </span>
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-canvas text-muted-foreground border border-(--border-subtle)">
                                        Tolerância: {currentTolerance}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-xs font-medium text-muted-foreground hidden sm:inline">
                                  {isSectionOpen(t.id, "deadlines") ? "Recolher" : "Editar"}
                                </span>
                                <div className="size-7 rounded-lg border border-(--border-subtle) flex items-center justify-center text-muted-foreground">
                                  {isSectionOpen(t.id, "deadlines") ? (
                                    <ChevronUp className="size-4" />
                                  ) : (
                                    <ChevronDown className="size-4" />
                                  )}
                                </div>
                              </div>
                            </button>

                            {isSectionOpen(t.id, "deadlines") && (
                              <div className="p-4 sm:p-5 pt-3 border-t border-(--border-subtle) bg-canvas/30">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4">
                                  <Field>
                                    <FieldLabel htmlFor={`priority-${t.id}`} className="text-xs font-semibold text-foreground">
                                      Prioridade
                                    </FieldLabel>
                                    <NativeSelect
                                      id={`priority-${t.id}`}
                                      className="w-full h-10 sm:h-11 text-sm px-3 bg-surface border-(--border-subtle) rounded-xl sm:rounded-[14px] text-foreground"
                                      value={t.priority || "MEDIUM"}
                                      onChange={(e) =>
                                        updateTask(t.id, {
                                          priority: e.target.value as ProcessTaskDefinition["priority"],
                                        })
                                      }
                                    >
                                      {priorityItems.map((p) => (
                                        <NativeSelectOption key={p.value} value={p.value}>
                                          {p.label}
                                        </NativeSelectOption>
                                      ))}
                                    </NativeSelect>
                                  </Field>

                                  <Field>
                                    <FieldLabel htmlFor={`criticality-${t.id}`} className="text-xs font-semibold text-foreground">
                                      Criticidade
                                    </FieldLabel>
                                    <NativeSelect
                                      id={`criticality-${t.id}`}
                                      className="w-full h-10 sm:h-11 text-sm px-3 bg-surface border-(--border-subtle) rounded-xl sm:rounded-[14px] text-foreground"
                                      value={t.criticality || "MEDIUM"}
                                      onChange={(e) =>
                                        updateTask(t.id, {
                                          criticality: e.target.value as ProcessTaskDefinition["criticality"],
                                        })
                                      }
                                    >
                                      {criticalityItems.map((c) => (
                                        <NativeSelectOption key={c.value} value={c.value}>
                                          {c.label}
                                        </NativeSelectOption>
                                      ))}
                                    </NativeSelect>
                                  </Field>

                                  {!templateMode && (
                                    <Field>
                                      <FieldLabel htmlFor={`deadline-${t.id}`} className="text-xs font-semibold text-foreground">
                                        Prazo final em data
                                      </FieldLabel>
                                      <Input
                                        id={`deadline-${t.id}`}
                                        type="datetime-local"
                                        value={t.deadlineAt || ""}
                                        onChange={(e) => updateTask(t.id, { deadlineAt: e.target.value })}
                                        className="w-full h-10 sm:h-11 text-sm px-3 bg-surface border-(--border-subtle) rounded-xl sm:rounded-[14px] text-foreground"
                                      />
                                    </Field>
                                  )}
                                  <Field>
                                    <FieldLabel htmlFor={`tolerance-${t.id}`} className="text-xs font-semibold text-foreground">
                                      Tempo de tolerância
                                    </FieldLabel>
                                    <NativeSelect
                                      id={`tolerance-${t.id}`}
                                      className="w-full h-10 sm:h-11 text-sm px-3 bg-surface border-(--border-subtle) rounded-xl sm:rounded-[14px] text-foreground"
                                      value={String(t.toleranceMinutes ?? 20)}
                                      onChange={(e) =>
                                        updateTask(t.id, { toleranceMinutes: Number(e.target.value) })
                                      }
                                    >
                                      {toleranceItems.map((tol) => (
                                        <NativeSelectOption key={tol.value} value={tol.value}>
                                          {tol.label}
                                        </NativeSelectOption>
                                      ))}
                                    </NativeSelect>
                                  </Field>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* 4. SEÇÃO: Evidências e conformidade (Oculta para tarefas com perguntas) */}
                          {t.taskType !== "FORM" && (
                            <div className="rounded-xl border border-(--border-subtle) bg-surface overflow-hidden shadow-2xs">
                              <button
                                type="button"
                                onClick={() => toggleTaskSection(t.id, "evidence")}
                                className="w-full p-3.5 sm:p-4 flex items-center justify-between gap-3 text-left hover:bg-canvas/60 transition-colors select-none cursor-pointer"
                                aria-expanded={isSectionOpen(t.id, "evidence")}
                              >
                                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                  <div className="size-8 rounded-lg bg-brand-soft text-brand-900 border border-brand-200/60 flex items-center justify-center shrink-0">
                                    <ShieldCheck className="size-4" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-bold text-foreground tracking-wide uppercase">
                                        Evidências e conformidade
                                      </span>
                                    </div>
                                    {!isSectionOpen(t.id, "evidence") && (
                                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-canvas text-muted-foreground border border-(--border-subtle)">
                                          Comprovante: {currentEvidence}
                                        </span>
                                        <span
                                          className={cn(
                                            "inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border",
                                            t.required
                                              ? "bg-amber-500/10 text-amber-800 border-amber-500/20"
                                              : "bg-canvas text-muted-foreground border-(--border-subtle)",
                                          )}
                                        >
                                          {t.required ? "Tarefa obrigatória" : "Opcional"}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-xs font-medium text-muted-foreground hidden sm:inline">
                                    {isSectionOpen(t.id, "evidence") ? "Recolher" : "Editar"}
                                  </span>
                                  <div className="size-7 rounded-lg border border-(--border-subtle) flex items-center justify-center text-muted-foreground">
                                    {isSectionOpen(t.id, "evidence") ? (
                                      <ChevronUp className="size-4" />
                                    ) : (
                                      <ChevronDown className="size-4" />
                                    )}
                                  </div>
                                </div>
                              </button>

                              {isSectionOpen(t.id, "evidence") && (
                                <div className="p-4 sm:p-5 pt-3 border-t border-(--border-subtle) bg-canvas/30 flex flex-col gap-4">
                                  <Field>
                                    <FieldLabel htmlFor={`evidence-${t.id}`} className="text-xs font-semibold text-foreground">
                                      Exigir comprovante da entrega
                                    </FieldLabel>
                                    <NativeSelect
                                      id={`evidence-${t.id}`}
                                      className="w-full h-10 sm:h-11 text-sm px-3 bg-surface border-(--border-subtle) rounded-xl sm:rounded-[14px] text-foreground"
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

                                  <div className="flex items-start gap-3 p-3.5 rounded-xl bg-surface border border-(--border-subtle)">
                                    <Checkbox
                                      id={`required-${t.id}`}
                                      checked={t.required}
                                      onCheckedChange={(v) => updateTask(t.id, { required: !!v })}
                                      className="mt-0.5"
                                    />
                                    <label
                                      htmlFor={`required-${t.id}`}
                                      className="text-xs text-foreground cursor-pointer select-none leading-snug"
                                    >
                                      <span className="font-semibold block text-sm">Tarefa obrigatória</span>
                                      <span className="text-muted-foreground">
                                        O checklist do processo só fecha após a conclusão desta tarefa.
                                      </span>
                                    </label>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                <div className="flex flex-col mx-auto sm:flex-row items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => addTask("STANDARD")}
                    className="h-11 w-full sm:w-auto rounded-xl border-dashed border-(--border-subtle) hover:border-brand-700 hover:bg-surface font-semibold text-sm gap-2"
                  >
                    <Plus className="size-4" />
                    Adicionar tarefa
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => addTask("FORM")}
                    className="h-11 w-full sm:w-auto rounded-xl border-dashed border-(--border-subtle) hover:border-brand-700 hover:bg-surface font-semibold text-sm gap-2 text-brand-700 hover:text-brand-800"
                  >
                    <ListChecks className="size-4" />
                    Adicionar tarefa com perguntas
                  </Button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="flex flex-col gap-6">
                <Alert className="bg-canvas border-(--border-subtle) rounded-[16px] p-4">
                  <HelpCircle className="size-4 text-brand-700 shrink-0 mt-0.5" />
                  <AlertDescription className="text-xs leading-relaxed text-[var(--brand-900)]">
                    Defina o que precisa terminar antes de outra tarefa começar. O sistema bloqueia dependências circulares.
                  </AlertDescription>
                </Alert>

                <div className="flex flex-col md:flex-row gap-6 items-start">
                  {/* Sidebar */}
                  <div className="w-full md:w-64 shrink-0 flex flex-col gap-2">
                    <div className="text-sm font-semibold text-brand-900 mb-2">Modo de Sequência</div>
                    <button
                      type="button"
                      onClick={() => handleDependencyModeChange("FREE")}
                      className={`text-left px-4 py-3 rounded-xl border text-sm transition-all cursor-pointer ${dependencyMode === "FREE"
                        ? "bg-brand-50 border-brand-200 text-brand-900 shadow-sm font-medium"
                        : "bg-surface border-(--border-subtle) text-muted-foreground hover:bg-muted/50"
                        }`}
                    >
                      <span className="block font-semibold mb-0.5">Ordem livre</span>
                      <span className="text-[11px] opacity-80 font-normal">Sem pré-requisitos, qualquer ordem.</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDependencyModeChange("STRICT")}
                      className={`text-left px-4 py-3 rounded-xl border text-sm transition-all cursor-pointer ${dependencyMode === "STRICT"
                        ? "bg-brand-50 border-brand-200 text-brand-900 shadow-sm font-medium"
                        : "bg-surface border-(--border-subtle) text-muted-foreground hover:bg-muted/50"
                        }`}
                    >
                      <span className="block font-semibold mb-0.5">Sequência restrita</span>
                      <span className="text-[11px] opacity-80 font-normal">Uma após a outra, em ordem.</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDependencyModeChange("CUSTOM")}
                      className={`text-left px-4 py-3 rounded-xl border text-sm transition-all cursor-pointer ${dependencyMode === "CUSTOM"
                        ? "bg-brand-50 border-brand-200 text-brand-900 shadow-sm font-medium"
                        : "bg-surface border-(--border-subtle) text-muted-foreground hover:bg-muted/50"
                        }`}
                    >
                      <span className="block font-semibold mb-0.5">Sequência personalizada</span>
                      <span className="text-[11px] opacity-80 font-normal">Você escolhe quem depende de quem.</span>
                    </button>
                  </div>

                  {/* Main Content */}
                  <div className="flex-1 w-full flex flex-col gap-4">
                    {value.tasks.length <= 1 ? (
                      <Card className="p-6 text-center rounded-[18px] border border-(--border-subtle) bg-[var(--surface)]">
                        <p className="text-sm text-muted-foreground">
                          Com apenas 1 tarefa cadastrada, ela inicia de forma independente e não possui pré-requisitos.
                        </p>
                      </Card>
                    ) : dependencyMode === "FREE" ? (
                      <Card className="p-6 text-center rounded-[18px] border border-(--border-subtle) bg-[var(--surface)]">
                        <p className="text-sm text-muted-foreground">
                          Nesta opção a ordem será feita livremente. A tarefa que o funcionário quiser fazer primeiro, ele faz. Nenhuma tarefa depende da outra.
                        </p>
                      </Card>
                    ) : dependencyMode === "STRICT" ? (
                      <Reorder.Group axis="y" values={value.tasks} onReorder={handleReorder} className="flex flex-col gap-3">
                        {value.tasks.map((t, i) => (
                          <Reorder.Item key={t.id} value={t} id={t.id}>
                            <Card className="p-4 flex-row rounded-[16px] border border-(--border-subtle) bg-surface flex items-center justify-between shadow-xs">
                              <div className="flex items-center gap-3">
                                <div className="hidden sm:flex size-8 shrink-0 items-center justify-center cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground">
                                  <GripVertical className="size-4" />
                                </div>
                                <span className="size-7 rounded-lg bg-(--brand-50) border border-(--brand-200) flex items-center justify-center text-xs font-bold text-[var(--brand-900)] shrink-0">
                                  {i + 1}
                                </span>
                                <span className="font-bold text-sm text-brand-900">
                                  {t.title || `Tarefa ${i + 1} (sem título)`}
                                </span>
                              </div>
                              <div className="flex sm:hidden items-center gap-1">
                                <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); moveTask(i, "UP"); }} disabled={i === 0} className="p-2 text-muted-foreground disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer hover:text-foreground transition-colors">
                                  <ArrowUp className="size-4" />
                                </button>
                                <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); moveTask(i, "DOWN"); }} disabled={i === value.tasks.length - 1} className="p-2 text-muted-foreground disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer hover:text-foreground transition-colors">
                                  <ArrowDown className="size-4" />
                                </button>
                              </div>
                            </Card>
                          </Reorder.Item>
                        ))}
                      </Reorder.Group>
                    ) : (
                      // CUSTOM MODE
                      <div className="flex flex-col gap-4">
                        {value.tasks.map((t, i) => {
                          const candidateTasks = value.tasks.filter((v) => v.id !== t.id);
                          const hasDependencies = t.dependsOn.length > 0;
                          return (
                            <Card
                              key={t.id}
                              className="p-5 rounded-[18px] border border-(--border-subtle) bg-[var(--surface)] flex flex-col gap-4 shadow-none"
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-(--border-subtle) pb-3">
                                <div className="flex items-center gap-2.5">
                                  <span className="size-7 rounded-lg bg-[var(--brand-50)] border border-[var(--brand-200)] flex items-center justify-center text-xs font-bold text-[var(--brand-900)] shrink-0">
                                    {i + 1}
                                  </span>
                                  <span className="font-bold text-sm text-[var(--brand-900)]">
                                    {t.title || `Tarefa ${i + 1} (sem título)`}
                                  </span>
                                </div>
                              </div>
                              <div className="flex flex-col gap-2.5">
                                <FieldLabel className="text-xs font-semibold text-[var(--brand-900)]">
                                  Esta tarefa só pode começar depois que for concluída:
                                </FieldLabel>
                                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                                  <NativeSelect
                                    className="w-full h-10 sm:h-11 text-xs sm:text-sm px-3 bg-surface border-(--border-subtle) rounded-xl sm:rounded-[14px] text-foreground"
                                    value=""
                                    onChange={(e) => {
                                      const selectedId = e.target.value;
                                      if (!selectedId) return;
                                      if (t.dependsOn.includes(selectedId)) return;
                                      if (wouldCreateCycle(value.tasks, t.id, selectedId)) return;
                                      updateTask(t.id, {
                                        dependsOn: [...t.dependsOn, selectedId],
                                      });
                                    }}
                                  >
                                    <NativeSelectOption value="">
                                      Selecionar tarefa pré-requisito...
                                    </NativeSelectOption>
                                    {candidateTasks.map((candidate) => {
                                      const isAlreadyDep = t.dependsOn.includes(candidate.id);
                                      const isCycle = wouldCreateCycle(value.tasks, t.id, candidate.id);
                                      const disabled = isAlreadyDep || isCycle;
                                      const candIdx = value.tasks.findIndex((x) => x.id === candidate.id);
                                      if (isAlreadyDep || isCycle) return null;
                                      return (
                                        <NativeSelectOption
                                          key={candidate.id}
                                          value={candidate.id}
                                          disabled={disabled}
                                        >
                                          Etapa {candIdx + 1}: {candidate.title || "Sem título"}
                                        </NativeSelectOption>
                                      );
                                    })}
                                  </NativeSelect>
                                </div>
                                {hasDependencies ? (
                                  <div className="flex flex-wrap gap-2 pt-2">
                                    {t.dependsOn.map((depId) => {
                                      const depTask = value.tasks.find((x) => x.id === depId);
                                      const depIndex = value.tasks.findIndex((x) => x.id === depId);
                                      return (
                                        <span
                                          key={depId}
                                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[12px] text-xs font-medium bg-[var(--canvas)] border border-[var(--border-subtle)] text-[var(--brand-900)] shadow-xs"
                                        >
                                          <span className="font-bold text-brand-700">
                                            #{depIndex + 1}
                                          </span>
                                          <span>{depTask?.title || "Tarefa desconhecida"}</span>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              updateTask(t.id, {
                                                dependsOn: t.dependsOn.filter((id) => id !== depId),
                                              })
                                            }
                                            className="ml-1 text-muted-foreground hover:text-red-600 transition-colors cursor-pointer"
                                            title="Remover dependência"
                                            aria-label={`Remover dependência de ${depTask?.title || depId}`}
                                          >
                                            <X className="size-3.5" />
                                          </button>
                                        </span>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <p className="text-[11px] text-[var(--text-secondary)] italic">
                                    Nenhum pré-requisito selecionado. A tarefa poderá ser iniciada assim que o processo for disparado.
                                  </p>
                                )}
                              </div>
                            </Card>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ETAPA 3: ROTINA */}
            {step === 3 && (
              <FieldGroup className="gap-4">
                {routinesCount > 1 && <Alert><AlertDescription>Este processo possui {routinesCount} rotinas. A programação abaixo edita a primeira rotina ativa; as demais mantêm seus horários. Remover a programação pausa todas as rotinas.</AlertDescription></Alert>}
                <Field orientation="horizontal">
                  <Checkbox
                    id="has-schedule"
                    checked={!!value.schedule}
                    onCheckedChange={(v) => update({ schedule: v ? defaultSchedule() : null })}
                  />
                  <FieldLabel htmlFor="has-schedule" className="font-semibold text-brand-900">
                    {templateMode ? "Sugerir uma rotina para este template" : "Programar repetição automática agora (Rotina)"}
                  </FieldLabel>
                </Field>

                {value.schedule ? (
                  <ScheduleFields templateMode={templateMode} value={value.schedule} onChange={(schedule) => update({ schedule })} />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {templateMode ? "Este template será sugerido como execução manual." : "Você pode salvar agora sem agendamento e programar a rotina quando quiser."}
                  </p>
                )}
              </FieldGroup>
            )}

            {/* ETAPA 4: APROVAÇÕES (SIMPLIFICADO E EXPLICADO) */}
            {step === 4 && (
              <div className="flex flex-col gap-4">
                <Alert className="bg-brand-soft/30 border-brand-200">
                  <ShieldCheck className="size-4 text-brand-900 shrink-0 mt-0.5" />
                  <AlertDescription className="text-xs leading-relaxed text-brand-900">
                    <strong className="font-semibold block mb-0.5">Como funciona a etapa de Aprovação?</strong>
                    Quando ativada, a tarefa não é finalizada automaticamente assim que o executor conclui.
                    Ela entra no status <em>Aguardando aprovação</em> e os gestores selecionados precisam
                    conferir o que foi feito antes de ela ser dada como concluída. Se a tarefa é rotineira
                    e não precisa de conferência prévia, basta mantê-la desmarcada.
                  </AlertDescription>
                </Alert>

                {value.tasks.map((t, i) => {
                  const hasApprover = approvalEnabled.has(t.id) || t.approverIds.length > 0;
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

                      <div className="flex flex-col gap-3">
                        <Field orientation="horizontal">
                          <Checkbox
                            id={`require-approval-${t.id}`}
                            checked={hasApprover}
                            onCheckedChange={(checked) => {
                              setApprovalEnabled((prev) => {
                                const next = new Set(prev);
                                if (checked) next.add(t.id);
                                else next.delete(t.id);
                                return next;
                              });
                              if (!checked) updateTask(t.id, { approverIds: [] });
                            }}
                          />
                          <FieldLabel htmlFor={`require-approval-${t.id}`} className="font-medium text-xs cursor-pointer">
                            Exigir revisão e aprovação antes de concluir esta tarefa
                          </FieldLabel>
                        </Field>

                        {hasApprover && (
                          <div className="pl-6 pt-1 flex flex-col gap-4">
                            {/* 1. SELEÇÃO DE APROVADORES */}
                            <div className="flex flex-col gap-1.5">
                              <span className="text-xs font-semibold text-foreground">
                                Quem deve revisar e aprovar esta tarefa:
                              </span>
                              <p className="text-[11px] text-muted-foreground">
                                {templateMode
                                  ? "Selecione quais papéis de gestores devem validar a conclusão."
                                  : "Selecione uma ou mais pessoas que terão permissão para avaliar a tarefa."}
                              </p>

                              {eligibleManagers.length === 0 ? (
                                <p className="text-xs text-amber-800 bg-amber-50 p-2.5 rounded-lg border border-amber-200 mt-1">
                                  Nenhum gestor ou administrador elegível encontrado para esta equipe/unidade.
                                </p>
                              ) : (
                                <div className="flex flex-wrap gap-2.5 mt-1">
                                  {eligibleManagers.map((m) => {
                                    const isSelected = t.approverIds.includes(m.id);
                                    return (
                                      <label
                                        key={m.id}
                                        htmlFor={`appr-${t.id}-${m.id}`}
                                        className={cn(
                                          "flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer transition-colors",
                                          isSelected
                                            ? "border-brand-500 bg-brand-50/50 text-foreground font-medium"
                                            : "border-(--border-subtle) hover:bg-muted/40 text-muted-foreground"
                                        )}
                                      >
                                        <Checkbox
                                          id={`appr-${t.id}-${m.id}`}
                                          checked={isSelected}
                                          onCheckedChange={(v) => {
                                            const nextIds = v
                                              ? [...t.approverIds, m.id]
                                              : t.approverIds.filter((id) => id !== m.id);
                                            updateTask(t.id, { approverIds: nextIds });
                                          }}
                                        />
                                        <span>
                                          {m.name}
                                          {!templateMode && (
                                            <span className="text-[11px] text-muted-foreground ml-1">
                                              ({uiLabel(m.role)})
                                            </span>
                                          )}
                                        </span>
                                      </label>
                                    );
                                  })}
                                </div>
                              )}
                            </div>

                            {/* 2. REGRA DE MÚLTIPLOS APROVADORES (QUANDO HÁ 2 OU MAIS) */}
                            {t.approverIds.length === 0 && (
                              <p className="text-xs text-muted-foreground italic">
                                Selecione ao menos uma pessoa acima para que o fluxo de aprovação funcione.
                              </p>
                            )}

                            {t.approverIds.length === 1 && (
                              <div className="p-2.5 rounded-lg bg-muted/40 border border-border/50 text-xs text-muted-foreground">
                                ✓ <strong>1 aprovador selecionado:</strong> Assim que ele conferir e aprovar, a tarefa é concluída automaticamente.
                              </div>
                            )}

                            {t.approverIds.length > 1 && (
                              <div className="p-3 rounded-xl bg-surface border border-(--border-subtle) shadow-xs flex flex-col gap-3">
                                <div>
                                  <FieldLabel htmlFor={`approval-mode-${t.id}`} className="text-xs font-semibold">
                                    Modo de aprovação (Regra para múltiplos aprovadores)
                                  </FieldLabel>
                                  <p className="text-[11px] text-muted-foreground mt-0.5">
                                    Defina se os aprovadores atuam em etapas ordenadas ou de forma simultânea.
                                  </p>
                                </div>

                                <NativeSelect
                                  id={`approval-mode-${t.id}`}
                                  value={t.approvalMode}
                                  onChange={(e) =>
                                    updateTask(t.id, {
                                      approvalMode: e.target.value as "SEQUENTIAL" | "PARALLEL",
                                    })
                                  }
                                >
                                  <NativeSelectOption value="SEQUENTIAL">
                                    Em ordem / Sequencial (um aprovador após o outro)
                                  </NativeSelectOption>
                                  <NativeSelectOption value="PARALLEL">
                                    Simultâneo / Qualquer ordem (todos podem aprovar ao mesmo tempo)
                                  </NativeSelectOption>
                                </NativeSelect>

                                {t.approvalMode === "SEQUENTIAL" ? (
                                  <div className="flex flex-col gap-2 pt-1 border-t border-(--border-subtle)">
                                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                                      <strong>Como funciona:</strong> O 2º aprovador só é liberado para revisar após o 1º aprovar. Organize a ordem da esteira usando os botões abaixo:
                                    </p>
                                    <ol className="flex flex-col gap-1.5" aria-label="Ordem de aprovação">
                                      {t.approverIds.map((id, index) => {
                                        const member = members.find((m) => m.id === id);
                                        return (
                                          <li
                                            key={id}
                                            className="flex items-center justify-between gap-2 p-2 rounded-lg bg-muted/30 border border-border/40 text-xs"
                                          >
                                            <div className="flex items-center gap-2">
                                              <Badge variant="outline" className="text-[10px] font-bold px-1.5 py-0 bg-background">
                                                {index + 1}º
                                              </Badge>
                                              <span className="font-medium text-foreground">
                                                {member?.name ?? "Aprovador"}
                                              </span>
                                              <span className="text-[11px] text-muted-foreground">
                                                {index === 0 ? "(aprova primeiro)" : index === t.approverIds.length - 1 ? "(aprovação final)" : "(etapa intermediária)"}
                                              </span>
                                            </div>
                                            <div className="flex items-center gap-0.5">
                                              <Button
                                                variant="ghost"
                                                size="icon-xs"
                                                disabled={index === 0}
                                                aria-label="Subir na ordem de aprovação"
                                                title="Aprovar antes"
                                                onClick={() => {
                                                  const ids = [...t.approverIds];
                                                  [ids[index], ids[index - 1]] = [ids[index - 1], ids[index]];
                                                  updateTask(t.id, { approverIds: ids });
                                                }}
                                              >
                                                <ArrowUp className="size-3.5" />
                                              </Button>
                                              <Button
                                                variant="ghost"
                                                size="icon-xs"
                                                disabled={index === t.approverIds.length - 1}
                                                aria-label="Descer na ordem de aprovação"
                                                title="Aprovar depois"
                                                onClick={() => {
                                                  const ids = [...t.approverIds];
                                                  [ids[index], ids[index + 1]] = [ids[index + 1], ids[index]];
                                                  updateTask(t.id, { approverIds: ids });
                                                }}
                                              >
                                                <ArrowDown className="size-3.5" />
                                              </Button>
                                            </div>
                                          </li>
                                        );
                                      })}
                                    </ol>
                                  </div>
                                ) : (
                                  <div className="pt-1 border-t border-(--border-subtle)">
                                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                                      <strong>Como funciona:</strong> Todos os aprovadores selecionados podem conferir a tarefa ao mesmo tempo, sem ordem fixa. A tarefa só é finalizada quando <strong>todos</strong> tiverem aprovado.
                                    </p>
                                  </div>
                                )}
                              </div>
                            )}
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
                          {teams.find((v) => v.id === t.teamId)?.name} · {t.toleranceMinutes ?? 20} min ·{" "}
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
                    {templateMode ? "A publicação disponibiliza este template para os gestores da operação." : processId
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
                <Button type="button" disabled={busy} onClick={() => save()} className="bg-brand-900 text-white hover:bg-brand-700">
                  {busy ? <Spinner data-icon="inline-start" className="size-4" /> : <Check data-icon="inline-start" className="size-4" />}
                  {busy ? "Salvando…" : templateMode ? "Publicar template" : "Salvar processo"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
      <TemplateSheet
        open={!!leaveHref}
        onOpenChange={open => { if (!open) setLeaveHref(null); }}
        title="Descartar alterações?"
        description="Você tem alterações que ainda não foram salvas."
        footer={
          <div className="flex flex-col sm:flex-row justify-end gap-2">
            <Button variant="outline" onClick={() => setLeaveHref(null)}>Continuar editando</Button>
            <Button variant="destructive" onClick={() => { const href = leaveHref; if (!href) return; allowLeave.current = true; setLeaveHref(null); const target = new URL(href); if (target.origin === window.location.origin) router.push(target.pathname + target.search + target.hash); else window.location.assign(href); }}>
              Descartar e sair
            </Button>
          </div>
        }>
        <p className="text-sm text-muted-foreground">Salve seu conteúdo antes de sair para manter as alterações.</p>
      </TemplateSheet>
    </div>
  );
}
