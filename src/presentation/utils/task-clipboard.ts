import { toast } from "@/components/ui/toast";
import type { FormFieldDefinition } from "@/domain/rules/process-definition";

export interface CopiedTaskData {
  title: string;
  description?: string;
  instructions?: string;
  taskType: "STANDARD" | "FORM";
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  criticality: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  toleranceMinutes: number;
  evidenceType?: string;
  evidenceRequired?: boolean;
  formFields?: FormFieldDefinition[];
  checklistItems?: string[];
  sourceType: "ADHOC" | "PROCESS_TASK";
  sourceTitle?: string;
  copiedAt: string;
}

const STORAGE_KEY = "tarefai:copied-task";
const COPY_EVENT = "tarefai:task-copied";

/**
 * Salva os dados de uma tarefa no clipboard do Tarefaí (armazenamento local)
 * Sanitiza e remove identificadores sensíveis ou vinculações únicas de banco.
 */
export function copyTaskToClipboard(input: {
  title: string;
  description?: string | null;
  instructions?: string | null;
  taskType?: string | null;
  priority?: string | null;
  criticality?: string | null;
  toleranceMinutes?: number | null;
  evidenceType?: string | null;
  evidenceRequired?: boolean | null;
  formFields?: FormFieldDefinition[] | null;
  checklistItems?: string[] | null;
  sourceType?: "ADHOC" | "PROCESS_TASK";
  sourceTitle?: string;
  notify?: boolean;
}): void {
  if (typeof window === "undefined") return;

  const title = input.title?.trim();
  if (!title) {
    toast.add({
      title: "Erro ao copiar",
      description: "A tarefa precisa ter um título válido.",
      type: "error",
    });
    return;
  }

  const priority = ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(input.priority || "")
    ? (input.priority as CopiedTaskData["priority"])
    : "MEDIUM";

  const criticality = ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(input.criticality || "")
    ? (input.criticality as CopiedTaskData["criticality"])
    : "MEDIUM";

  const taskType: "STANDARD" | "FORM" =
    input.taskType === "FORM" || (input.formFields && input.formFields.length > 0)
      ? "FORM"
      : "STANDARD";

  const payload: CopiedTaskData = {
    title,
    description: input.description?.trim() || "",
    instructions: input.instructions?.trim() || input.description?.trim() || "",
    taskType,
    priority,
    criticality,
    toleranceMinutes: typeof input.toleranceMinutes === "number" ? input.toleranceMinutes : 20,
    evidenceType: input.evidenceType || "NONE",
    evidenceRequired: Boolean(input.evidenceRequired),
    formFields: Array.isArray(input.formFields)
      ? input.formFields.map((field) => ({
          ...field,
          id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `f-${Date.now()}-${Math.random()}`,
        }))
      : [],
    checklistItems: Array.isArray(input.checklistItems) ? [...input.checklistItems] : [],
    sourceType: input.sourceType || "ADHOC",
    sourceTitle: input.sourceTitle || title,
    copiedAt: new Date().toISOString(),
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent(COPY_EVENT, { detail: payload }));
    if (input.notify !== false) {
      toast.add({
        title: "Tarefa copiada!",
        description: `"${title}" está pronta para ser colada ao criar ou adicionar tarefas.`,
        type: "success",
      });
    }
  } catch {
    toast.add({
      title: "Falha ao copiar",
      description: "Não foi possível armazenar a tarefa no navegador.",
      type: "error",
    });
  }
}

/**
 * Lê a tarefa copiada atualmente armazenada
 */
export function getCopiedTask(): CopiedTaskData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CopiedTaskData;
    if (!parsed || typeof parsed.title !== "string" || !parsed.title.trim()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Verifica se há alguma tarefa copiada pronta para ser colada
 */
export function hasCopiedTask(): boolean {
  return getCopiedTask() !== null;
}
