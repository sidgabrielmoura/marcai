"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { editTaskAction } from "@/presentation/actions/management-task-actions";
import { Modal } from "../shared/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel } from "@/components/ui/field";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { toast } from "@/components/ui/toast";

type EditableTask = { id: string; title: string; description: string | null; instructions: string | null; priority: string; criticality: string; required: boolean; deadlineAt: Date | string | null; estimatedDuration: number | null };
function localTime(value: Date | string | null) { if (!value) return ""; const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
export function EditTaskDialog({ task, onClose }: { task: EditableTask; onClose: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true);
    try {
      const result = await editTaskAction(task.id, { title: form.get("title"), description: form.get("description"), instructions: form.get("instructions"), priority: form.get("priority"), criticality: form.get("criticality"), required: form.has("required"), deadlineAt: form.get("deadlineAt") ? new Date(String(form.get("deadlineAt"))).toISOString() : null, estimatedDuration: form.get("estimatedDuration") ? Number(form.get("estimatedDuration")) : null });
      if (result.error) {
        toast.add({
          title: "Erro ao editar tarefa",
          description: result.error,
          type: "error",
        });
      } else {
        toast.add({
          title: "Tarefa atualizada",
          description: "Alterações salvas com sucesso.",
          type: "success",
        });
        router.refresh();
        onClose();
      }
    } catch {
      toast.add({
        title: "Erro inesperado",
        description: "Não foi possível salvar a tarefa. Tente novamente.",
        type: "error",
      });
    } finally {
      setBusy(false);
    }
  }
  return <Modal open title="Editar tarefa" onClose={() => { if (!busy) onClose(); }}>
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">Estas alterações valem para esta tarefa. A configuração fica bloqueada após o primeiro início.</p>
      <Field><FieldLabel htmlFor="edit-title">Título</FieldLabel><Input id="edit-title" name="title" required minLength={3} maxLength={200} defaultValue={task.title} /></Field>
      <Field><FieldLabel htmlFor="edit-description">Descrição</FieldLabel><Textarea id="edit-description" name="description" maxLength={2000} defaultValue={task.description ?? ""} /></Field>
      <Field><FieldLabel htmlFor="edit-instructions">Orientações para execução</FieldLabel><Textarea id="edit-instructions" name="instructions" maxLength={5000} defaultValue={task.instructions ?? ""} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">{(["priority", "criticality"] as const).map(key => <Field key={key}><FieldLabel htmlFor={`edit-${key}`}>{key === "priority" ? "Prioridade" : "Criticidade"}</FieldLabel><NativeSelect id={`edit-${key}`} name={key} defaultValue={task[key]} className="w-full">{Object.entries({ LOW: "Baixa", MEDIUM: "Média", HIGH: "Alta", CRITICAL: "Crítica" }).map(([value, label]) => <NativeSelectOption key={value} value={value}>{label}</NativeSelectOption>)}</NativeSelect></Field>)}</div>
      <Field><FieldLabel htmlFor="edit-deadline">Prazo no fuso deste dispositivo</FieldLabel><Input id="edit-deadline" name="deadlineAt" type="datetime-local" defaultValue={localTime(task.deadlineAt)} /></Field>
      <Field><FieldLabel htmlFor="edit-duration">Duração estimada em minutos</FieldLabel><Input id="edit-duration" name="estimatedDuration" type="number" min={1} max={43200} defaultValue={task.estimatedDuration ?? ""} /></Field>
      <label className="flex items-center gap-3 min-h-11"><input type="checkbox" name="required" defaultChecked={task.required} />Obrigatória para concluir a execução</label>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Voltar</Button><Button type="submit" disabled={busy}>{busy ? "Salvando…" : "Salvar alterações"}</Button></div>
    </form>
  </Modal>;
}
