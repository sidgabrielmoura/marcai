"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Building2, Users, Activity, ShieldCheck, ArrowRight, Search, MessageSquare, ChevronLeft, ChevronRight } from "lucide-react";
import { AppShell } from "../shared/app-shell";
import { EmptyState, Modal, PageHeader } from "../shared";
import { uiLabel } from "../shared/ui-labels";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, FieldGroup, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { toast } from "@/components/ui/toast";
import { Spinner } from "@/components/ui/spinner";
import { addSupportNoteAction, saveManualSubscriptionAction, toggleOrganizationStatusAction, updatePlatformUserStatusAction, type ActionResult } from "@/presentation/actions/superadmin-actions";
import { subscriptionStatusLabels, type ManualSubscription } from "@/application/superadmin/manual-subscription";

export type PlatformView = "overview" | "organizations" | "users" | "subscriptions" | "usage" | "audit" | "support";
export interface GlobalOrg { id: string; name: string; slug: string; status: string; createdAt: string; membersCount: number; locationsCount: number; processesCount: number; tasksCount: number; executionsCount: number; subscription: ManualSubscription | null }
export interface GlobalUser { id: string; name: string; email: string | null; status: string; platformRole: string | null; twoFactorEnabled: boolean; createdAt: string; memberships: { organizationId: string; organizationName: string; role: string; status: string }[] }
export interface GlobalLog { id: string; action: string; entityType: string; entityId: string; createdAt: string; organizationId: string; orgName: string; actorName: string; note: string | null; supportStatus: string | null }
type Props = { userName: string; currentUserId: string; view: PlatformView; query: string; status: string; organizationFilter: string; selectedOrganization: { id: string; name: string } | null; metrics: { totalOrgs: number; activeOrgs: number; suspendedOrgs: number; totalUsers: number; totalProcesses: number; totalTasks: number }; organizations: GlobalOrg[]; users: GlobalUser[]; logs: GlobalLog[]; pagination: { page: number; pages: number; total: number; pageSize: number } };
const viewCopy: Record<PlatformView, [string, string]> = {
  overview: ["Visão da plataforma", "Acompanhe a base de clientes e acesse a administração de cada organização."],
  organizations: ["Organizações", "Consulte clientes, gerencie acessos e acompanhe o histórico de atendimento."],
  users: ["Usuários", "Consulte os vínculos e controle o acesso de uma pessoa à plataforma."],
  subscriptions: ["Planos e assinaturas", "Registre o plano e as condições acordadas com cada cliente. O controle financeiro é manual."],
  usage: ["Uso da plataforma", "Compare o uso atual de cada organização com os limites contratados."],
  audit: ["Auditoria da plataforma", "Consulte as ações registradas, seus responsáveis e motivos."],
  support: ["Suporte", "Registre atendimentos internos e consulte o histórico por organização."],
};
const supportLabels: Record<string, string> = { OPEN: "Novo atendimento", FOLLOW_UP: "Acompanhamento", RESOLVED: "Resolvido" };
const actionLabels: Record<string, string> = { PLATFORM_USER_STATUS_CHANGED: "Acesso à plataforma alterado", MANUAL_SUBSCRIPTION_UPDATED: "Assinatura manual atualizada", SUPPORT_NOTE_ADDED: "Atendimento registrado" };
const date = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value));
const datetime = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value));
const currency = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const statusLabel = (value: string) => value === "ACTIVE" ? "Ativo" : value === "SUSPENDED" ? "Suspenso" : uiLabel(value);
const nullableNumber = (form: FormData, name: string) => String(form.get(name) ?? "").trim() ? Number(form.get(name)) : null;

export function SuperadminDashboardClient(props: Props) {
  const { view, metrics, organizations, users, logs, pagination } = props;
  const router = useRouter();
  const [statusTarget, setStatusTarget] = useState<{ kind: "organization" | "user"; id: string; name: string; status: string } | null>(null);
  const [subscriptionTarget, setSubscriptionTarget] = useState<GlobalOrg | null>(null);
  const [supportOpen, setSupportOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const close = () => { if (!pending) { setStatusTarget(null); setSubscriptionTarget(null); setSupportOpen(false); } };
  const start = () => {};
  async function run(action: () => Promise<ActionResult>, message: string) {
    setPending(true);
    try {
      const result = await action();
      if (result.error) {
        toast.add({
          title: "Erro na operação",
          description: result.error,
          type: "error",
        });
        return;
      }
      setStatusTarget(null); setSubscriptionTarget(null); setSupportOpen(false);
      toast.add({
        title: "Sucesso",
        description: message,
        type: "success",
      });
      router.refresh();
    } catch {
      toast.add({
        title: "Erro inesperado",
        description: "Não foi possível salvar. Tente novamente.",
        type: "error",
      });
    }
    finally { setPending(false); }
  }
  function href(nextView: PlatformView, organization?: string, page?: number) {
    const params = new URLSearchParams({ view: nextView });
    if (organization) params.set("organization", organization);
    if (page) { params.set("page", String(page)); if (props.query) params.set("q", props.query); if (props.status !== "ALL") params.set("status", props.status); }
    return `/superadmin?${params}`;
  }
  const saveButton = (label: string) => <Button type="submit" disabled={pending}>{pending && <Spinner data-icon="inline-start" />}{pending ? "Salvando…" : label}</Button>;
  const isLog = view === "audit" || view === "support";
  return <AppShell userName={props.userName} orgName="Plataforma Marcai" role="SUPERADMIN" mode="platform" activeView={view}>
    <PageHeader title={viewCopy[view][0]} subtitle={viewCopy[view][1]} actions={<Badge variant="secondary"><ShieldCheck data-icon="inline-start" /> Administração global</Badge>} />
    {view === "overview" && <div className="metric-grid">{[
      { label: "Organizações", value: metrics.totalOrgs, note: `${metrics.activeOrgs} ativas · ${metrics.suspendedOrgs} suspensas` },
      { label: "Usuários", value: metrics.totalUsers, note: "Pessoas cadastradas na plataforma" },
      { label: "Processos", value: metrics.totalProcesses, note: "Total em todas as organizações" },
      { label: "Tarefas", value: metrics.totalTasks, note: "Registros fora da lixeira" },
    ].map((metric) => <Card key={metric.label} className="metric-card"><CardHeader><CardTitle>{metric.label}</CardTitle></CardHeader><CardContent><strong className="metric-value">{metric.value}</strong></CardContent><CardFooter><p className="muted-copy">{metric.note}</p></CardFooter></Card>)}</div>}

    <Card>
      <CardHeader><CardTitle>{props.selectedOrganization?.name ?? (view === "overview" ? "Organizações cadastradas" : viewCopy[view][0])}</CardTitle><CardDescription>{pagination.total} {isLog ? "registros" : view === "users" ? "usuários" : "organizações"} encontrados{props.organizationFilter && !props.selectedOrganization ? " · Organização não encontrada" : ""}</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-5">
        <form method="get" action="/superadmin" className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <input type="hidden" name="view" value={view} />
          {props.organizationFilter && <input type="hidden" name="organization" value={props.organizationFilter} />}
          <Field className="min-w-0 flex-1"><FieldLabel htmlFor="platform-search">{isLog ? "Buscar ação ou organização" : view === "users" ? "Buscar nome ou e-mail" : "Buscar organização"}</FieldLabel><Input id="platform-search" name="q" defaultValue={props.query} placeholder={isLog ? "Ex.: TASK_COMPLETED ou nome do cliente" : "Digite para buscar"} maxLength={100} /></Field>
          {!isLog && <Field className="sm:w-44"><FieldLabel htmlFor="platform-status">Status do acesso</FieldLabel><NativeSelect id="platform-status" name="status" defaultValue={props.status} className="w-full"><NativeSelectOption value="ALL">Todos</NativeSelectOption><NativeSelectOption value="ACTIVE">Ativos</NativeSelectOption><NativeSelectOption value="SUSPENDED">Suspensos</NativeSelectOption></NativeSelect></Field>}
          <Button type="submit" variant="outline"><Search data-icon="inline-start" /> Buscar</Button>
          {(props.query || props.status !== "ALL" || props.organizationFilter) && <Button variant="ghost" render={<Link href={href(view)} />}>Limpar filtros</Button>}
        </form>
        {view === "support" && <div className="flex flex-wrap items-center justify-between gap-3"><p className="muted-copy">{props.selectedOrganization ? "O registro ficará no histórico deste cliente." : "Abra uma organização para registrar um atendimento."}</p>{props.selectedOrganization ? <Button onClick={() => { start(); setSupportOpen(true); }}><MessageSquare data-icon="inline-start" /> Registrar atendimento</Button> : <Button variant="outline" render={<Link href={href("organizations")} />}>Escolher organização<ArrowRight data-icon="inline-end" /></Button>}</div>}
        {(view === "subscriptions" || view === "usage") && <p className="muted-copy">Os limites servem ao acompanhamento do contrato. Cobranças e bloqueios por consumo não são automáticos.</p>}
        {!pagination.total && <EmptyState icon={isLog ? Activity : view === "users" ? Users : Building2} title="Nenhum resultado encontrado" description={props.query || props.organizationFilter || props.status !== "ALL" ? "Ajuste os filtros para ampliar a busca." : view === "support" ? "Os atendimentos registrados aparecerão aqui." : "Os registros aparecerão aqui quando estiverem disponíveis."} />}

        {!!organizations.length && <div className="grid min-w-0 gap-4 lg:grid-cols-2">{organizations.map((org) => <Card key={org.id}>
          <CardHeader><div className="flex flex-wrap items-start justify-between gap-2"><CardTitle className="break-words">{org.name}</CardTitle><Badge variant={org.status === "ACTIVE" ? "secondary" : "destructive"}>{org.status === "ACTIVE" ? "Ativa" : org.status === "SUSPENDED" ? "Suspensa" : uiLabel(org.status)}</Badge></div><CardDescription className="break-all">/{org.slug} · Cliente desde {date(org.createdAt)}</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-4">
            <dl className="grid grid-cols-2 gap-3"><div><dt className="muted-copy">Pessoas ativas</dt><dd className="font-semibold">{org.membersCount}{org.subscription?.memberLimit ? ` / ${org.subscription.memberLimit}` : ""}</dd></div><div><dt className="muted-copy">Unidades ativas</dt><dd className="font-semibold">{org.locationsCount}{org.subscription?.locationLimit ? ` / ${org.subscription.locationLimit}` : ""}</dd></div><div><dt className="muted-copy">Processos</dt><dd className="font-semibold">{org.processesCount}</dd></div><div><dt className="muted-copy">Tarefas</dt><dd className="font-semibold">{org.tasksCount}</dd></div>{view === "usage" && <div><dt className="muted-copy">Execuções registradas</dt><dd className="font-semibold">{org.executionsCount}</dd></div>}</dl>
            {view === "usage" && ((org.subscription?.memberLimit && org.membersCount > org.subscription.memberLimit) || (org.subscription?.locationLimit && org.locationsCount > org.subscription.locationLimit)) && <Badge variant="destructive" className="self-start">Uso acima do contratado</Badge>}
            {(view === "subscriptions" || view === "usage") && (org.subscription ? <div className="flex flex-col gap-2"><div className="flex flex-wrap items-center gap-2"><strong>{org.subscription.planName}</strong><Badge variant="outline">{subscriptionStatusLabels[org.subscription.status]}</Badge></div><p className="muted-copy">{org.subscription.amountCents === null ? "Valor não informado" : currency(org.subscription.amountCents)} · {org.subscription.cycle === "MONTHLY" ? "Mensal" : org.subscription.cycle === "YEARLY" ? "Anual" : "Período personalizado"}</p><p className="muted-copy">Vigência: {date(`${org.subscription.startsOn}T12:00:00Z`)} até {org.subscription.endsOn ? date(`${org.subscription.endsOn}T12:00:00Z`) : "prazo indeterminado"}</p>{org.subscription.notes && <p className="whitespace-pre-wrap break-words text-sm">{org.subscription.notes}</p>}</div> : <p className="muted-copy">Nenhum plano registrado para este cliente.</p>)}
          </CardContent>
          <CardFooter className="flex flex-wrap gap-2">
            {view === "subscriptions" || view === "usage" ? <Button variant="outline" onClick={() => { start(); setSubscriptionTarget(org); }}>{org.subscription ? "Editar assinatura" : "Registrar plano"}</Button> : <><Button variant="outline" render={<Link href={href("users", org.id)} />}>Ver pessoas</Button><Button variant="outline" onClick={() => { start(); setStatusTarget({ kind: "organization", ...org }); }}>{org.status === "ACTIVE" ? "Suspender acesso" : "Reativar acesso"}</Button></>}
            <Button variant="ghost" render={<Link href={href("support", org.id)} />}>Suporte</Button><Button variant="ghost" render={<Link href={href("audit", org.id)} />}>Histórico</Button>
          </CardFooter>
        </Card>)}</div>}

        {!!users.length && <div className="flex flex-col gap-3">{users.map((user) => <Card key={user.id}><CardHeader><div className="flex flex-wrap justify-between gap-2"><CardTitle>{user.name}</CardTitle><Badge variant={user.status === "ACTIVE" ? "secondary" : "destructive"}>{statusLabel(user.status)}</Badge></div><CardDescription className="break-all">{user.email ?? "Acesso por matrícula e PIN"}{user.platformRole === "SUPERADMIN" ? " · Superadmin" : ""}</CardDescription></CardHeader><CardContent className="flex flex-col gap-2"><p className="muted-copy">Cadastro em {date(user.createdAt)} · Autenticação em duas etapas {user.twoFactorEnabled ? "ativada" : "não ativada"}</p><ul className="flex flex-col gap-2">{user.memberships.map((member) => <li key={member.organizationId} className="flex flex-wrap items-center gap-2"><Link className="underline underline-offset-4" href={href("organizations", member.organizationId)}>{member.organizationName}</Link><span className="muted-copy">{uiLabel(member.role)} · {statusLabel(member.status)}</span></li>)}</ul>{!user.memberships.length && <p className="muted-copy">Sem vínculo com organizações.</p>}</CardContent><CardFooter>{user.platformRole === "SUPERADMIN" || user.id === props.currentUserId ? <p className="muted-copy">Conta administrativa protegida.</p> : <Button variant="outline" onClick={() => { start(); setStatusTarget({ kind: "user", ...user }); }}>{user.status === "ACTIVE" ? "Suspender acesso global" : "Reativar acesso global"}</Button>}</CardFooter></Card>)}</div>}

        {!!logs.length && <ol className="flex flex-col gap-3">{logs.map((log) => <li key={log.id}><Card><CardHeader><div className="flex flex-wrap justify-between gap-2"><CardTitle>{actionLabels[log.action] ?? uiLabel(log.action)}</CardTitle>{view === "support" && log.supportStatus && <Badge variant="outline">{supportLabels[log.supportStatus] ?? log.supportStatus}</Badge>}</div><CardDescription>{datetime(log.createdAt)} · {log.actorName}</CardDescription></CardHeader><CardContent className="flex flex-col gap-2"><Link className="underline underline-offset-4" href={href("organizations", log.organizationId)}>{log.orgName}</Link>{log.note && <p className="whitespace-pre-wrap break-words text-sm">{log.note}</p>}{view === "audit" && <details><summary className="cursor-pointer py-2 text-sm">Identificação do registro</summary><dl className="flex flex-col gap-1 break-all text-sm"><dt>Ação</dt><dd>{log.action}</dd><dt>Recurso</dt><dd>{log.entityType} · {log.entityId}</dd></dl></details>}</CardContent></Card></li>)}</ol>}
      </CardContent>
      {pagination.total > 0 && <CardFooter className="flex flex-wrap items-center justify-between gap-3"><p className="muted-copy">Página {pagination.page} de {pagination.pages} · {(pagination.page - 1) * pagination.pageSize + 1}–{Math.min(pagination.page * pagination.pageSize, pagination.total)} de {pagination.total}</p><nav aria-label="Paginação" className="flex gap-2">{pagination.page > 1 && <Button variant="outline" render={<Link href={href(view, props.organizationFilter, pagination.page - 1)} />}><ChevronLeft data-icon="inline-start" /> Anterior</Button>}{pagination.page < pagination.pages && <Button variant="outline" render={<Link href={href(view, props.organizationFilter, pagination.page + 1)} />}>Próxima <ChevronRight data-icon="inline-end" /></Button>}</nav></CardFooter>}
    </Card>

    <Modal open={!!statusTarget} onClose={close} title={`${statusTarget?.status === "ACTIVE" ? "Suspender" : "Reativar"} acesso`}>
      {statusTarget && <form action={async (form) => { const status = statusTarget.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE"; const reason = String(form.get("reason") ?? ""); await run(() => statusTarget.kind === "organization" ? toggleOrganizationStatusAction(statusTarget.id, status, reason) : updatePlatformUserStatusAction(statusTarget.id, status, reason), "Status de acesso atualizado."); }}><FieldGroup><p className="text-sm">{statusTarget.status === "ACTIVE" ? "A suspensão impedirá o acesso" : "A reativação permitirá o acesso"} {statusTarget.kind === "organization" ? "de todas as pessoas à organização" : "desta pessoa em todas as organizações"} <strong>{statusTarget.name}</strong>. O motivo ficará na auditoria.</p><Field><FieldLabel htmlFor="status-reason">Motivo da alteração</FieldLabel><Textarea id="status-reason" name="reason" required minLength={5} maxLength={2000} disabled={pending} /></Field><div className="flex justify-end gap-2"><Button variant="outline" type="button" disabled={pending} onClick={close}>Voltar</Button>{saveButton(statusTarget.status === "ACTIVE" ? "Confirmar suspensão" : "Confirmar reativação")}</div></FieldGroup></form>}
    </Modal>

    <Modal open={!!subscriptionTarget} onClose={close} title={`${subscriptionTarget?.subscription ? "Editar" : "Registrar"} assinatura`} className="max-h-[90dvh] overflow-y-auto">
      {subscriptionTarget && <form key={subscriptionTarget.id} action={async (form) => { const amount = nullableNumber(form, "amount"); await run(() => saveManualSubscriptionAction(subscriptionTarget.id, { planName: String(form.get("planName") ?? ""), status: form.get("status"), cycle: form.get("cycle"), amountCents: amount === null ? null : Math.round(amount * 100), startsOn: String(form.get("startsOn") ?? ""), endsOn: String(form.get("endsOn") ?? "") || null, memberLimit: nullableNumber(form, "memberLimit"), locationLimit: nullableNumber(form, "locationLimit"), notes: String(form.get("notes") ?? "") }, String(form.get("reason") ?? "")), "Assinatura registrada no histórico do cliente."); }}><FieldGroup><p className="text-sm">Condições comerciais de <strong>{subscriptionTarget.name}</strong>. O registro não realiza cobrança nem altera o acesso.</p><Field><FieldLabel htmlFor="plan-name">Nome do plano</FieldLabel><Input id="plan-name" name="planName" defaultValue={subscriptionTarget.subscription?.planName} required minLength={2} maxLength={80} disabled={pending} /></Field><Field><FieldLabel htmlFor="subscription-status">Situação da assinatura</FieldLabel><NativeSelect className="w-full" id="subscription-status" name="status" defaultValue={subscriptionTarget.subscription?.status ?? "ACTIVE"} disabled={pending}>{Object.entries(subscriptionStatusLabels).map(([value, label]) => <NativeSelectOption key={value} value={value}>{label}</NativeSelectOption>)}</NativeSelect></Field><Field><FieldLabel htmlFor="cycle">Periodicidade contratada</FieldLabel><NativeSelect className="w-full" id="cycle" name="cycle" defaultValue={subscriptionTarget.subscription?.cycle ?? "MONTHLY"} disabled={pending}><NativeSelectOption value="MONTHLY">Mensal</NativeSelectOption><NativeSelectOption value="YEARLY">Anual</NativeSelectOption><NativeSelectOption value="CUSTOM">Personalizada</NativeSelectOption></NativeSelect></Field><Field><FieldLabel htmlFor="amount">Valor por período (R$)</FieldLabel><Input id="amount" name="amount" type="number" step="0.01" min="0" max="10000000" defaultValue={subscriptionTarget.subscription?.amountCents == null ? "" : subscriptionTarget.subscription.amountCents / 100} disabled={pending} /></Field><Field><FieldLabel htmlFor="starts-on">Início da vigência</FieldLabel><Input id="starts-on" name="startsOn" type="date" required defaultValue={subscriptionTarget.subscription?.startsOn ?? new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })} disabled={pending} /></Field><Field><FieldLabel htmlFor="ends-on">Fim da vigência (opcional)</FieldLabel><Input id="ends-on" name="endsOn" type="date" defaultValue={subscriptionTarget.subscription?.endsOn ?? ""} disabled={pending} /></Field><Field><FieldLabel htmlFor="member-limit">Limite de pessoas ativas</FieldLabel><Input id="member-limit" name="memberLimit" type="number" min="1" max="10000000" step="1" defaultValue={subscriptionTarget.subscription?.memberLimit ?? ""} disabled={pending} /><FieldDescription>Deixe em branco quando não houver limite contratado.</FieldDescription></Field><Field><FieldLabel htmlFor="location-limit">Limite de unidades ativas</FieldLabel><Input id="location-limit" name="locationLimit" type="number" min="1" max="10000000" step="1" defaultValue={subscriptionTarget.subscription?.locationLimit ?? ""} disabled={pending} /></Field><Field><FieldLabel htmlFor="subscription-notes">Observações comerciais</FieldLabel><Textarea id="subscription-notes" name="notes" maxLength={2000} defaultValue={subscriptionTarget.subscription?.notes ?? ""} disabled={pending} /></Field><Field><FieldLabel htmlFor="subscription-reason">Motivo do registro ou alteração</FieldLabel><Textarea id="subscription-reason" name="reason" required minLength={5} maxLength={2000} disabled={pending} /></Field><div className="flex justify-end gap-2"><Button variant="outline" type="button" onClick={close} disabled={pending}>Voltar</Button>{saveButton("Salvar assinatura")}</div></FieldGroup></form>}
    </Modal>

    <Modal open={supportOpen} onClose={close} title="Registrar atendimento">
      {props.selectedOrganization && <form action={async (form) => run(() => addSupportNoteAction(props.selectedOrganization!.id, String(form.get("status")), String(form.get("note"))), "Atendimento registrado.")}><FieldGroup><p className="text-sm">Histórico interno de <strong>{props.selectedOrganization.name}</strong>.</p><Field><FieldLabel htmlFor="support-status">Etapa do atendimento</FieldLabel><NativeSelect id="support-status" name="status" className="w-full" disabled={pending}>{Object.entries(supportLabels).map(([value, label]) => <NativeSelectOption key={value} value={value}>{label}</NativeSelectOption>)}</NativeSelect></Field><Field><FieldLabel htmlFor="support-note">O que foi solicitado ou resolvido?</FieldLabel><Textarea id="support-note" name="note" required minLength={5} maxLength={2000} rows={5} disabled={pending} /><FieldDescription>Registre o contexto e a próxima ação. Este registro fica disponível à equipe da plataforma.</FieldDescription></Field><div className="flex justify-end gap-2"><Button variant="outline" type="button" onClick={close} disabled={pending}>Voltar</Button>{saveButton("Registrar atendimento")}</div></FieldGroup></form>}
    </Modal>
  </AppShell>;
}
