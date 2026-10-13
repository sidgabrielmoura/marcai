import { Reorder } from "framer-motion";
import { GripVertical, Trash2, Type, Menu, Star, ListChecks, Camera, Video, Paperclip, ArrowUp, ArrowDown, Plus, Copy, CopyX } from "lucide-react";
import { FormFieldDefinition } from "@/domain/rules/process-definition";
import { FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

const fieldTypes: Record<FormFieldDefinition["type"], string> = { SHORT_TEXT: "Texto curto", LONG_TEXT: "Texto longo", RATING: "Avaliação", MULTIPLE_CHOICE: "Múltipla escolha", BOOLEAN: "Sim / Não", PHOTO: "Foto", VIDEO: "Vídeo", FILE: "Arquivo" };

export function FormFieldsEditor({
  fields,
  onChange,
}: {
  fields: FormFieldDefinition[];
  onChange: (val: FormFieldDefinition[]) => void;
}) {
  const handleAddField = (type: FormFieldDefinition["type"]) => {
    const newField: FormFieldDefinition = {
      id: crypto.randomUUID(),
      type,
      question: "",
      required: true,
      options: [],
    };
    onChange([...fields, newField]);
  };

  const handleUpdateField = (id: string, patch: Partial<FormFieldDefinition>) => {
    onChange(fields.map(f => f.id === id ? { ...f, ...patch } : f));
  };

  const handleRemoveField = (id: string) => {
    onChange(fields.filter(f => f.id !== id));
  };

  const handleReorder = (newFields: FormFieldDefinition[]) => {
    onChange(newFields);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <FieldLabel className="text-xs font-semibold text-foreground mb-0">
          Perguntas da Tarefa
        </FieldLabel>
        <span className="text-[11px] text-muted-foreground font-medium">
          {fields.length} {fields.length === 1 ? "pergunta" : "perguntas"}
        </span>
      </div>

      <Reorder.Group axis="y" values={fields} onReorder={handleReorder} className="flex flex-col gap-2">
        {fields.map((field, idx) => (
          <Reorder.Item key={field.id} value={field} id={field.id}>
            <div className="flex gap-2 min-w-0 w-full items-start bg-surface border border-(--border-subtle) rounded-xl p-3 shadow-2xs">
              <div className="pt-2 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing">
                <GripVertical className="size-4" />
              </div>
              <div className="flex flex-col flex-1 gap-2 min-w-0">
                <div className="flex gap-2">
                  <span className="size-8 rounded-lg bg-brand-soft border border-brand-200 flex items-center justify-center text-xs font-bold text-brand-900 shrink-0 select-none">
                    {idx + 1}
                  </span>
                  <Input
                    placeholder="Digite a pergunta..."
                    aria-label={`Pergunta ${idx + 1}`}
                    value={field.question}
                    onChange={(e) => handleUpdateField(field.id, { question: e.target.value })}
                    className="flex-1 h-8 text-sm"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveField(field.id)}
                    aria-label={`Remover pergunta ${idx + 1}`}
                    className="size-8 text-muted-foreground hover:text-destructive shrink-0"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>

                {field.type === "MULTIPLE_CHOICE" && <div className="space-y-2"><p className="text-xs text-muted-foreground">Alternativas (mínimo de duas)</p>{field.options.map((option, i) => <div className="flex gap-1" key={i}><Input aria-label={`Alternativa ${i + 1} da pergunta ${idx + 1}`} value={option} maxLength={300} onChange={e => handleUpdateField(field.id, { options: field.options.map((v, n) => n === i ? e.target.value : v) })} /><Button variant="ghost" size="icon" aria-label={`Remover alternativa ${i + 1}`} onClick={() => handleUpdateField(field.id, { options: field.options.filter((_, n) => n !== i) })}><Trash2 className="size-3" /></Button></div>)}<Button variant="outline" size="sm" disabled={field.options.length >= 20} onClick={() => handleUpdateField(field.id, { options: [...field.options, ""] })}><Plus className="size-3" />Adicionar alternativa</Button></div>}
                <div className="flex flex-wrap items-center gap-2 text-xs mt-1">
                  <Button type="button" variant="ghost" size="icon-sm" disabled={fields.length >= 50} aria-label={`Duplicar pergunta ${idx + 1}`} onClick={() => { const next = [...fields]; next.splice(idx + 1, 0, { ...field, id: crypto.randomUUID(), options: [...field.options] }); onChange(next); }}><Copy className="size-3" /></Button>
                  <div className="flex items-center gap-1.5 text-muted-foreground font-medium bg-muted/50 px-2 py-1 rounded-md">
                    {field.type === "SHORT_TEXT" && <><Type className="size-3" /> Texto Curto</>}
                    {field.type === "LONG_TEXT" && <><Menu className="size-3" /> Texto Longo</>}
                    {field.type === "RATING" && <><Star className="size-3" /> Avaliação</>}
                    {field.type === "BOOLEAN" && <><ListChecks className="size-3" /> Sim / Não</>}
                    {field.type === "PHOTO" && <><Camera className="size-3" /> Foto</>}
                    {field.type === "VIDEO" && <><Video className="size-3" /> Vídeo</>}
                    {field.type === "FILE" && <><Paperclip className="size-3" /> Arquivos</>}
                    {field.type === "MULTIPLE_CHOICE" && <><CopyX className="size-3" /> Múltipla escolha</>}
                  </div>
                  <div className="flex gap-1"><Button type="button" variant="ghost" size="icon-sm" disabled={idx === 0} aria-label={`Subir pergunta ${idx + 1}`} onClick={() => { const next = [...fields];[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]; handleReorder(next); }}><ArrowUp className="size-3" /></Button><Button type="button" variant="ghost" size="icon-sm" disabled={idx === fields.length - 1} aria-label={`Descer pergunta ${idx + 1}`} onClick={() => { const next = [...fields];[next[idx + 1], next[idx]] = [next[idx], next[idx + 1]]; handleReorder(next); }}><ArrowDown className="size-3" /></Button></div>
                  <label className="flex items-center gap-1.5 cursor-pointer ml-auto">
                    <Checkbox
                      checked={field.required}
                      onCheckedChange={(c) => handleUpdateField(field.id, { required: !!c })}
                    />
                    <span className="select-none font-medium">Obrigatória</span>
                  </label>
                </div>
              </div>
            </div>
          </Reorder.Item>
        ))}
      </Reorder.Group>

      {fields.length === 0 && (
        <div className="p-6 border border-dashed border-(--border-subtle) rounded-xl text-center flex flex-col items-center gap-2">
          <div className="size-10 rounded-full bg-muted/30 flex items-center justify-center text-muted-foreground">
            <ListChecks className="size-5" />
          </div>
          <div className="text-sm font-medium text-foreground">Nenhuma pergunta adicionada</div>
          <div className="text-xs text-muted-foreground">Adicione a primeira pergunta usando os botões abaixo.</div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mt-2">
        {/* <Button type="button" variant="outline" size="sm" onClick={() => handleAddField("SHORT_TEXT")} className="h-8 text-xs border-dashed">
          <Type className="size-3 mr-1.5" /> Texto Curto
        </Button> */}
        <Button type="button" variant="outline" size="sm" onClick={() => handleAddField("LONG_TEXT")} className="h-8 text-xs border-dashed">
          <Menu className="size-3 mr-1.5" /> Texto {/* Longo */}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => handleAddField("RATING")} className="h-8 text-xs border-dashed">
          <Star className="size-3 mr-1.5" /> Avaliação (1 a 5)
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => handleAddField("BOOLEAN")} className="h-8 text-xs border-dashed">
          <ListChecks className="size-3 mr-1.5" /> Sim / Não
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => handleAddField("MULTIPLE_CHOICE")} className="h-8 text-xs border-dashed">
          <CopyX className="size-3 mr-1.5" /> Múltipla escolha
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => handleAddField("PHOTO")} className="h-8 text-xs border-dashed">
          <Camera className="size-3 mr-1.5" /> Foto
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => handleAddField("VIDEO")} className="h-8 text-xs border-dashed">
          <Video className="size-3 mr-1.5" /> Vídeo
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => handleAddField("FILE")} className="h-8 text-xs border-dashed">
          <Paperclip className="size-3 mr-1.5" /> Arquivos
        </Button>
      </div>
    </div>
  );
}
