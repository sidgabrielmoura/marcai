import { z } from "zod";

export const taskEditSchema = z.object({
  title: z.string().trim().min(3, "Informe um título com pelo menos 3 caracteres.").max(200),
  description: z.string().trim().max(2000),
  instructions: z.string().trim().max(5000),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  criticality: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  required: z.boolean(),
  deadlineAt: z.iso.datetime().nullable(),
  estimatedDuration: z.number().int().min(1).max(43200).nullable(),
}).strict();
export type TaskEditInput = z.infer<typeof taskEditSchema>;

export function canEditTaskDefinition(task: { status: string; startedAt: Date | string | null }) {
  return !task.startedAt && ["AVAILABLE", "BLOCKED"].includes(task.status);
}
