"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Layers, ListChecks, ShieldCheck, FileText, Camera, Search, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { templateJobs, processTemplateHref, type TemplateItem } from "@/domain/rules/reusable-template-definition";
import { duplicateTemplateAction, getTemplateLibraryAction } from "@/presentation/actions/template-actions";
import { TemplateSheet } from "./template-sheet";

export function TemplatePicker({ initialOpen = false, canManage = false, label = "Usar template", initialSelection }: { initialOpen?: boolean; canManage?: boolean; label?: string; initialSelection?: TemplateItem }) {
  const [open, setOpen] = useState(initialOpen);
  const [items, setItems] = useState<TemplateItem[] | null>(null);
  const [selected, setSelected] = useState<TemplateItem | null>(initialSelection ?? null);
  const [job, setJob] = useState("ALL");
  const [origin, setOrigin] = useState("ALL");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const router = useRouter();
  useEffect(() => {
    if (!open || items) return;
    let active = true;
    getTemplateLibraryAction().then(result => { if (!active) return; if (result.error) setError(result.error); else { setError(""); setItems(result.data ?? []); } }).catch(() => { if (active) setError("Não foi possível carregar. Tente novamente."); });
    return () => { active = false; };
  }, [open, items, retry]);
  async function customize() {
    if (!selected) return;
    setBusy(true);
    try { const result = await duplicateTemplateAction(selected.reference); if (result.error) toast.add({ title: result.error, type: "error" }); else if (result.data) router.push("/management/templates/" + result.data.id + "/edit"); }
    catch { toast.add({ title: "Não foi possível copiar o template.", type: "error" }); }
    finally { setBusy(false); }
  }
  const filtered = (items ?? []).filter(t => (job === "ALL" || t.jobKey === job) && (origin === "ALL" || t.origin === origin) && (t.name + " " + t.description + " " + templateJobs[t.jobKey]).toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")));
  return <>
    <Button variant="outline" onClick={() => { setSelected(initialSelection ?? null); setOpen(true); }}><Layers className="size-4" />{label}</Button>
    <TemplateSheet open={open} onOpenChange={v => { if (!busy) setOpen(v); }} title={selected ? selected.name : "Comece com um template"} description={selected ? "Todas as etapas podem ser personalizadas antes de iniciar." : "Escolha um fluxo pronto e adapte à sua operação."} footer={selected
      ? <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><Button variant="ghost" onClick={() => setSelected(null)}><ArrowLeft className="size-4" />Voltar</Button><div className="flex flex-col gap-2 sm:flex-row">{canManage && <Button variant="outline" disabled={busy} onClick={customize}>{busy && <Spinner />}Criar minha versão</Button>}<Button nativeButton={false} render={<Link href={processTemplateHref(selected.reference)} />} className="bg-brand-900 text-white hover:bg-brand-700">Usar este template<ArrowRight className="size-4" /></Button></div></div>
      : <div className="flex items-center justify-between gap-2"><span className="text-xs text-muted-foreground">{items ? items.length + " templates disponíveis" : "Biblioteca de processos"}</span><Button variant="ghost" nativeButton={false} render={<Link href="/management/processes/new" />} onClick={() => setOpen(false)}>Criar do zero</Button></div>}>
      {selected ? <div className="space-y-5"><div className="flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-brand-soft px-3 py-1 text-brand-900">{templateJobs[selected.jobKey]}</span><span className="rounded-full bg-muted px-3 py-1">{selected.origin === "CATALOG" ? "Catálogo Tarefaí" : "Da operação"} · v{selected.version}</span></div><p className="text-sm text-muted-foreground leading-relaxed">{selected.description}</p><div className="flex gap-4 text-xs text-muted-foreground"><span className="flex items-center gap-1"><ListChecks className="size-4" />{selected.definition.tasks.length} etapas</span><span className="flex items-center gap-1"><Clock className="size-4" />{selected.definition.schedule ? "Rotina sugerida" : "Execução manual"}</span></div>
        <ol className="space-y-3">{selected.definition.tasks.map((t, i) => <li key={t.id} className="rounded-2xl border border-(--border-subtle) bg-canvas/60 p-4"><div className="flex gap-3"><span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-xs font-bold text-brand-900">{i + 1}</span><div className="min-w-0 flex-1"><h3 className="font-semibold text-sm">{t.title}</h3><p className="text-xs text-muted-foreground mt-1">{selected.definition.teamSlots.find(s => s.id === t.teamSlotId)?.label}</p></div></div><p className="mt-3 text-xs whitespace-pre-line leading-relaxed">{t.instructions}</p><div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">{t.taskType === "FORM" && <span className="flex items-center gap-1"><FileText className="size-3.5" />{t.formFields.length} perguntas</span>}{t.evidenceType && <span className="flex items-center gap-1"><Camera className="size-3.5" />Evidência: {({ PHOTO: "foto", VIDEO: "vídeo", FILE: "arquivo", TEXT: "texto", NUMBER: "número", SIGNATURE: "assinatura", LOCATION: "localização" })[t.evidenceType]}</span>}{t.approverSlotIds.length > 0 && <span className="flex items-center gap-1"><ShieldCheck className="size-3.5" />Exige aprovação</span>}</div>{t.formFields.length > 0 && <ul className="mt-3 space-y-1 text-xs text-muted-foreground">{t.formFields.map(f => <li key={f.id}>• {f.question}{f.required ? " *" : ""}</li>)}</ul>}</li>)}</ol>
      </div> : <div className="space-y-4"><div className="relative"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input aria-label="Buscar templates" className="pl-9 rounded-xl h-11" placeholder="Buscar um fluxo…" value={query} onChange={e => setQuery(e.target.value)} /></div><div className="flex rounded-xl bg-muted/70 p-1 gap-1">{[["ALL", "Todos"], ["CATALOG", "Tarefaí"], ["ORGANIZATION", "Da operação"]].map(([value, text]) => <button key={value} onClick={() => setOrigin(value)} aria-pressed={origin === value} className={"flex-1 min-w-0 rounded-lg py-2 text-xs font-medium transition-colors " + (origin === value ? "bg-surface shadow-xs text-foreground" : "text-muted-foreground")}>{text}</button>)}</div><div className="flex flex-wrap gap-2">{[["ALL", "Todas as áreas"], ...Object.entries(templateJobs)].map(([value, text]) => <button key={value} onClick={() => setJob(value)} aria-pressed={job === value} className={"rounded-full px-3 py-2 text-xs transition-colors " + (job === value ? "bg-brand-900 text-white" : "bg-muted text-muted-foreground hover:text-foreground")}>{text}</button>)}</div>
        {error ? <div role="alert" className="p-5 text-sm text-center"><p>{error}</p><Button variant="outline" className="mt-3" onClick={() => { setError(""); setRetry(v => v + 1); }}>Tentar novamente</Button></div> : !items ? <div className="flex items-center justify-center gap-2 py-12" role="status"><Spinner />Carregando templates…</div> : !filtered.length ? <p className="py-8 text-center text-sm text-muted-foreground">Nenhum template encontrado com esses filtros.</p> : <div className="grid gap-3 sm:grid-cols-2">{filtered.map(t => <button key={t.reference} onClick={() => setSelected(t)} className="group rounded-2xl border border-(--border-subtle) bg-surface p-4 text-left transition-colors hover:border-brand-700 focus-visible:outline-2 focus-visible:outline-brand-700"><div className="flex items-start justify-between gap-3"><span className="flex size-9 items-center justify-center rounded-xl bg-brand-soft text-brand-900"><Layers className="size-4" /></span><span className="text-[10px] text-muted-foreground">{t.origin === "CATALOG" ? "Tarefaí" : "Da operação"}</span></div><h3 className="mt-3 font-semibold text-sm">{t.name}</h3><p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{t.description}</p><div className="mt-3 flex items-center justify-between text-xs text-muted-foreground"><span>{t.definition.tasks.length} etapas · {templateJobs[t.jobKey]}</span><ArrowRight className="size-4 group-hover:text-brand-900" /></div></button>)}</div>}
      </div>}
    </TemplateSheet>
  </>;
}
