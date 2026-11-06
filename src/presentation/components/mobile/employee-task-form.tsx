"use client";

import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmployeeSegments } from "./employee-segments";
import { MediaGallery, type GalleryMedia } from "./media-gallery";

type FormField = { id: string; question: string; type: string; required?: boolean; options?: string[] | null };
type Attachment = { storageKey?: string; fileUrl?: string; fileName?: string; mimeType?: string };

export function EmployeeTaskForm({ taskId, scope, fields: inputFields, answers, disabled, onChange }: {
  taskId: string; scope: string; fields: unknown; answers: Record<string, unknown>; disabled: boolean;
  onChange: (fieldId: string, value: unknown) => void;
}) {
  const fields: FormField[] = Array.isArray(inputFields) ? inputFields.filter((field): field is FormField => !!field && typeof field.id === "string" && typeof field.question === "string" && typeof field.type === "string") : [];
  return <FieldGroup className="employee-task-form">{fields.map(field => {
    const answer = answers[field.id];
    const local = typeof File !== "undefined" && answer instanceof File;
    const attachment = !local && answer && typeof answer === "object" ? answer as Attachment : null;
    const mime = local ? answer.type : attachment?.mimeType ?? "";
    const kind = field.type === "VIDEO" || mime.startsWith("video/") ? "video" : field.type === "PHOTO" || mime.startsWith("image/") ? "image" : null;
    const media: GalleryMedia[] = answer && kind ? [{ id: field.id + (local ? `:${answer.name}:${answer.lastModified}` : `:${attachment?.storageKey ?? attachment?.fileUrl}`), kind, status: local ? "DRAFT" : "SAVED", file: local ? answer : null,
      url: attachment?.fileUrl ?? (attachment?.storageKey ? `/api/tasks/${encodeURIComponent(taskId)}/form-file/${encodeURIComponent(attachment.storageKey)}` : null), caption: attachment?.fileName,
    }] : [];
    const id = `answer-${field.id}`;
    return <Field key={field.id}>
      <FieldLabel htmlFor={id}>{field.question}<span className="employee-field-optional">{field.required ? " · Obrigatória" : " · Opcional"}</span></FieldLabel>
      {field.type === "SHORT_TEXT" || field.type === "LONG_TEXT" ? field.type === "SHORT_TEXT"
        ? <Input id={id} disabled={disabled} placeholder="Digite sua resposta" maxLength={5000} className="text-xs h-7" value={typeof answer === "string" ? answer : ""} onChange={event => onChange(field.id, event.target.value)} />
        : <Textarea id={id} disabled={disabled} placeholder="Descreva sua resposta" maxLength={5000} rows={2} className="text-xs min-h-11" value={typeof answer === "string" ? answer : ""} onChange={event => onChange(field.id, event.target.value)} />
        : field.type === "BOOLEAN" ? <EmployeeSegments label={field.question} value={answer === true ? "yes" : answer === false ? "no" : ""} options={[{ value: "yes", label: "Sim" }, { value: "no", label: "Não" }]} disabled={disabled} onChange={value => onChange(field.id, value === "yes")} />
        : field.type === "RATING" ? <EmployeeSegments label={field.question} full value={String(answer ?? "")} options={[1, 2, 3, 4, 5].map(value => ({ value: String(value), label: String(value) }))} disabled={disabled} onChange={value => onChange(field.id, Number(value))} />
        : field.type === "MULTIPLE_CHOICE" ? <EmployeeSegments label={field.question} value={typeof answer === "string" ? answer : ""} options={(field.options ?? []).map(value => ({ value, label: value }))} disabled={disabled} onChange={value => onChange(field.id, value)} />
        : <>
          {!!media.length && <MediaGallery scope={`${scope}:${field.id}`} items={media} />}
          {!kind && (local || attachment) && <p className="text-xs text-muted-foreground">{local ? answer.name : attachment?.fileName}</p>}
          {!kind && attachment?.storageKey && <a className="employee-file-link" href={`/api/tasks/${encodeURIComponent(taskId)}/form-file/${encodeURIComponent(attachment.storageKey)}`} target="_blank" rel="noopener noreferrer">Ver anexo registrado</a>}
          {!disabled && <label className="employee-file-picker" htmlFor={id}>{answer ? kind === "video" ? "Trocar vídeo" : kind === "image" ? "Trocar foto" : "Trocar arquivo" : field.type === "PHOTO" ? "Adicionar foto" : field.type === "VIDEO" ? "Adicionar vídeo" : "Adicionar arquivo"}
            <input id={id} type="file" className="sr-only" accept={field.type === "PHOTO" ? "image/*" : field.type === "VIDEO" ? "video/*" : "image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"} capture={field.type === "PHOTO" || field.type === "VIDEO" ? "environment" : undefined} onChange={event => { const file = event.target.files?.[0]; if (file) onChange(field.id, file); event.target.value = ""; }} />
          </label>}
        </>}
    </Field>;
  })}</FieldGroup>;
}
