"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Copy, Archive, RotateCcw, Pencil, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { PageHeader } from "@/presentation/components/shared";
import { toast } from "@/components/ui/toast";
import { templateJobs, type TemplateItem } from "@/domain/rules/reusable-template-definition";
import { archiveTemplateAction, duplicateTemplateAction } from "@/presentation/actions/template-actions";
import { TemplatePicker } from "./template-picker";
import { TemplateSheet } from "./template-sheet";

export function TemplateLibraryClient({ items, publishedItems, canManage }: { items: TemplateItem[]; publishedItems: TemplateItem[]; canManage: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState(""); const [job, setJob] = useState("ALL"); const [status, setStatus] = useState("AVAILABLE");
  const [busy, setBusy] = useState(false); const [archiveTarget, setArchiveTarget] = useState<TemplateItem | null>(null);
  const filtered = items.filter(t => (job === "ALL" || t.jobKey === job) && (status === "ALL" || status === "AVAILABLE" && t.status !== "ARCHIVED" || t.status === status) && (t.name + " " + t.description).toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")));
  async function duplicate(t: TemplateItem) {
    setBusy(true);
    try { const r = await duplicateTemplateAction(t.origin === "ORGANIZATION" ? "draft:" + t.id : t.reference); if (r.error) toast.add({ title: r.error, type: "error" }); else if (r.data) router.push("/management/templates/" + r.data.id + "/edit"); }
    catch { toast.add({ title: "Não foi possível duplicar.", type: "error" }); } finally { setBusy(false); }
  }
  async function archive() {
    if (!archiveTarget) return; setBusy(true);
    try { const r = await archiveTemplateAction(archiveTarget.id, archiveTarget.revision!, archiveTarget.status !== "ARCHIVED"); if (r.error) toast.add({ title: r.error, type: "error" }); else { setArchiveTarget(null); router.refresh(); } }
    catch { toast.add({ title: "Não foi possível alterar o template.", type: "error" }); } finally { setBusy(false); }
  }
  return <div className="page-stack"><PageHeader title="Templates" subtitle="Fluxos prontos para personalizar e usar na sua operação." actions={canManage ? <Button nativeButton={false} render={<Link href="/management/templates/new" />}><Plus className="size-4" />Criar template</Button> : undefined} />
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><Input aria-label="Buscar na biblioteca" placeholder="Buscar templates…" value={query} onChange={e => setQuery(e.target.value)} /><NativeSelect aria-label="Área dos templates" value={job} onChange={e => setJob(e.target.value)}><NativeSelectOption value="ALL">Todas as áreas</NativeSelectOption>{Object.entries(templateJobs).map(([id, label]) => <NativeSelectOption key={id} value={id}>{label}</NativeSelectOption>)}</NativeSelect><NativeSelect aria-label="Status dos templates" value={status} onChange={e => setStatus(e.target.value)}><NativeSelectOption value="AVAILABLE">Disponíveis</NativeSelectOption><NativeSelectOption value="PUBLISHED">Publicados</NativeSelectOption>{canManage && <><NativeSelectOption value="DRAFT">Rascunhos</NativeSelectOption><NativeSelectOption value="ARCHIVED">Arquivados</NativeSelectOption><NativeSelectOption value="ALL">Todos</NativeSelectOption></>}</NativeSelect></div>
    {!filtered.length && <p className="p-8 text-center text-sm text-muted-foreground">Nenhum template encontrado.</p>}
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map(t => { const published = publishedItems.find(p => p.id === t.id && p.origin === t.origin); return <article key={t.origin + t.id} className="rounded-2xl border border-(--border-subtle) bg-surface p-5 flex flex-col"><div className="flex justify-between gap-2"><span className="size-9 rounded-xl bg-brand-soft text-brand-900 flex items-center justify-center"><Layers className="size-4" /></span><span className="text-xs text-muted-foreground">{t.origin === "CATALOG" ? "Catálogo MarcAI" : t.status === "ARCHIVED" ? "Arquivado" : t.status === "DRAFT" ? "Rascunho" : "Da operação · v" + t.version}</span></div><h2 className="mt-3 text-sm font-semibold">{t.name || "Template sem nome"}</h2><p className="mt-2 text-xs text-muted-foreground line-clamp-3 leading-relaxed">{t.description || "Personalize as etapas deste fluxo."}</p><p className="my-3 text-xs text-muted-foreground">{templateJobs[t.jobKey]} · {t.definition.tasks.length} etapas{t.hasDraft ? " · alterações em rascunho" : ""}</p><div className="mt-auto flex flex-wrap gap-2">{published && <TemplatePicker label="Visualizar e usar" canManage={canManage} initialSelection={published} />}{canManage && <>{t.origin === "ORGANIZATION" && t.status !== "ARCHIVED" && <Button nativeButton={false} render={<Link href={"/management/templates/" + t.id + "/edit"} />} variant="outline" size="icon" aria-label={"Editar " + t.name}><Pencil className="size-4" /></Button>}<Button variant="ghost" size="icon" disabled={busy} aria-label={"Duplicar " + t.name} onClick={() => duplicate(t)}><Copy className="size-4" /></Button>{t.origin === "ORGANIZATION" && <Button variant="ghost" size="icon" disabled={busy} aria-label={(t.status === "ARCHIVED" ? "Restaurar " : "Arquivar ") + t.name} onClick={() => setArchiveTarget(t)}>{t.status === "ARCHIVED" ? <RotateCcw className="size-4" /> : <Archive className="size-4" />}</Button>}</>}</div></article>; })}</div>
    <TemplateSheet open={!!archiveTarget} onOpenChange={v => { if (!v && !busy) setArchiveTarget(null); }} title={archiveTarget?.status === "ARCHIVED" ? "Restaurar template" : "Arquivar template"} description={archiveTarget?.name ?? ""} footer={<div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setArchiveTarget(null)}>Cancelar</Button><Button disabled={busy} onClick={archive}>{busy ? "Salvando…" : "Confirmar"}</Button></div>}><p className="text-sm text-muted-foreground">{archiveTarget?.status === "ARCHIVED" ? "O template voltará à biblioteca com sua publicação anterior e seu rascunho." : "Novos processos deixarão de usar este template. Os processos já criados continuarão funcionando."}</p></TemplateSheet>
  </div>;
}
