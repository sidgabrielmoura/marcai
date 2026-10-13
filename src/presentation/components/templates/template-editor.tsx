"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ProcessEditorWizard } from "@/presentation/components/processes/process-editor-wizard";
import { templateJobs, templateToProcess, wizardToTemplate, type ReusableTemplateDefinition, type TemplateJob } from "@/domain/rules/reusable-template-definition";
import { saveTemplateAction } from "@/presentation/actions/template-actions";

export function ReusableTemplateEditor({ initial, templateId, revision }: { initial: ReusableTemplateDefinition; templateId?: string; revision?: number }) {
  const router = useRouter();
  const [identity, setIdentity] = useState({ id: templateId, revision });
  const [jobKey, setJobKey] = useState<TemplateJob>(initial.jobKey);
  const [teamSlots, setTeamSlots] = useState(initial.teamSlots);
  const [memberSlots, setMemberSlots] = useState(initial.memberSlots);
  const [savedMetadata, setSavedMetadata] = useState(() => JSON.stringify({ jobKey: initial.jobKey, teamSlots: initial.teamSlots, memberSlots: initial.memberSlots }));
  const [start] = useState(() => templateToProcess(initial, { locationId: "template-unit", timezone: "America/Sao_Paulo", teams: Object.fromEntries(initial.teamSlots.map(s => [s.id, s.id])), members: Object.fromEntries(initial.memberSlots.map(s => [s.id, s.id])) }, false));
  const teams = teamSlots.map(s => ({ id: s.id, name: s.label || "Papel sem nome" }));
  const members = useMemo(() => memberSlots.map(s => ({ id: s.id, name: s.label || "Papel sem nome", role: s.kind === "APPROVER" ? "ADMIN" : "EMPLOYEE", teamIds: teamSlots.map(t => t.id), locationIds: ["template-unit"] })), [memberSlots, teamSlots]);
  return <div className="space-y-5"><section className="rounded-2xl border border-(--border-subtle) bg-surface p-5 space-y-4"><div><h2 className="text-sm font-semibold">Papéis do template</h2><p className="text-xs text-muted-foreground mt-1">Use papéis como “Limpeza”, “Executor” e “Supervisor”. A equipe e as pessoas serão escolhidas em cada processo.</p></div><label className="text-xs font-medium block">Área<NativeSelect value={jobKey} onChange={e => setJobKey(e.target.value as TemplateJob)} className="mt-1">{Object.entries(templateJobs).map(([key, label]) => <NativeSelectOption value={key} key={key}>{label}</NativeSelectOption>)}</NativeSelect></label>
    <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><h3 className="text-xs font-semibold">Equipes</h3>{teamSlots.map((s, i) => <div className="flex gap-2" key={s.id}><Input aria-label={"Nome da equipe " + (i + 1)} value={s.label} onChange={e => setTeamSlots(v => v.map(t => t.id === s.id ? { ...t, label: e.target.value } : t))} /><Button variant="ghost" size="icon" aria-label="Remover papel de equipe" onClick={() => setTeamSlots(v => v.filter(t => t.id !== s.id))}><Trash2 className="size-4" /></Button></div>)}<Button variant="outline" size="sm" onClick={() => setTeamSlots(v => [...v, { id: crypto.randomUUID(), label: "Nova equipe" }])}><Plus className="size-4" />Adicionar equipe</Button></div>
    <div className="space-y-2"><h3 className="text-xs font-semibold">Executores e aprovadores</h3>{memberSlots.map((s, i) => <div key={s.id} className="flex gap-2 items-center"><div className="min-w-0 flex-1"><Input aria-label={"Nome do responsável " + (i + 1)} value={s.label} onChange={e => setMemberSlots(v => v.map(t => t.id === s.id ? { ...t, label: e.target.value } : t))} /><p className="text-[10px] text-muted-foreground mt-1">{s.kind === "EXECUTOR" ? "Executor" : "Aprovador"}</p></div><Button variant="ghost" size="icon" aria-label="Remover papel de responsável" onClick={() => setMemberSlots(v => v.filter(t => t.id !== s.id))}><Trash2 className="size-4" /></Button></div>)}<div className="flex flex-wrap gap-2">{(["EXECUTOR", "APPROVER"] as const).map(kind => <Button key={kind} variant="outline" size="sm" onClick={() => setMemberSlots(v => [...v, { id: crypto.randomUUID(), label: kind === "EXECUTOR" ? "Novo executor" : "Novo aprovador", kind }])}><Plus className="size-4" />{kind === "EXECUTOR" ? "Executor" : "Aprovador"}</Button>)}</div></div></div></section>
    <ProcessEditorWizard templateMode metadataDirty={savedMetadata !== JSON.stringify({ jobKey, teamSlots, memberSlots })} locations={[{ id: "template-unit", name: "Unidade escolhida ao usar" }]} teams={teams} members={members} initial={start} onSaveDefinition={async (d, publish) => {
      const result = await saveTemplateAction({ ...identity, definition: wizardToTemplate(d, { jobKey, teamSlots, memberSlots }), publish });
      if (result.data) {
        setIdentity({ id: result.data.id, revision: result.data.revision });
        setSavedMetadata(JSON.stringify({ jobKey, teamSlots, memberSlots }));
      }
      return result;
    }} />
  </div>;
}
