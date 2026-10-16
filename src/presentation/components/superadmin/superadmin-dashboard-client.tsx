"use client";

import { useState } from "react";
import { unstable_rethrow } from "next/navigation";
import { PlatformButton as Button, PlatformForm, PlatformActivityBoundary, usePlatformActivity } from "./platform-async";
import { PlatformPagination } from "./platform-pagination";
import { TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TableRow, TableCell } from "@/components/ui/table";
import { PlatformOverview, type PlatformOverviewData } from "./platform-overview";
import {
  SuperadminModal as Modal,
  PlatformPage,
  PlatformPanel,
  PlatformIdentity,
  PlatformStatus,
  PlatformActions,
  PlatformTable,
  PlatformQuota,
} from "./superadmin-ui";

import Link from "next/link";
import {
  Building2, Users, Activity, ShieldCheck, Search, MessageSquare,
  CalendarClock, FileBarChart, X,
  AlertTriangle, Plus, Layers, Sparkles, ShieldAlert, Trash2, Edit3, UserPlus,
} from "lucide-react";
import { AppShell } from "../shared/app-shell";
import { EmptyState, PageHeader } from "../shared";
import { uiLabel } from "../shared/ui-labels";

import {
  Card,
  CardHeader,
  CardAction,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, FieldGroup, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";

import { toast } from "@/components/ui/toast";

import {
  addSupportNoteAction,
  saveManualSubscriptionAction,
  toggleOrganizationStatusAction,
  updatePlatformUserStatusAction,
  createOrganizationAction,
  updateOrganizationAction,
  deleteOrganizationAction,
  createPlatformUserAction,
  updatePlatformUserAction,
  deletePlatformUserAction,
  addOrganizationMemberAction,
  removeOrganizationMemberAction,
  updateOrganizationMemberRoleAction,
  createPlatformPlanAction,
  updatePlatformPlanAction,
  deletePlatformPlanAction,
  seedDefaultPlatformPlansAction,
  type ActionResult,
} from "@/presentation/actions/superadmin-actions";
import {
  subscriptionStatusLabels,
  cycleLabels,
  getSubscriptionNotice,
  type ManualSubscription,
  type PlatformPlanModel,
} from "@/application/superadmin/manual-subscription";
import { cn } from "@/lib/utils";

export type PlatformView =
  | "overview"
  | "organizations"
  | "users"
  | "subscriptions"
  | "usage"
  | "audit"
  | "support";

export interface GlobalOrg {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
  membersCount: number;
  locationsCount: number;
  processesCount: number;
  tasksCount: number;
  executionsCount: number;
  subscription: ManualSubscription | null;
}

export interface GlobalUser {
  id: string;
  name: string;
  email: string | null;
  status: string;
  platformRole: string | null;
  twoFactorEnabled: boolean;
  createdAt: string;
  memberships: {
    organizationId: string;
    organizationName: string;
    role: string;
    status: string;
  }[];
}

export interface GlobalLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  createdAt: string;
  organizationId: string;
  orgName: string;
  actorName: string;
  note: string | null;
  supportStatus: string | null;
}

export interface CompactOrg {
  id: string;
  name: string;
  slug: string;
  status: string;
}

type Props = {
  userName: string;
  currentUserId: string;
  view: PlatformView;
  query: string;
  status: string;
  organizationFilter: string;
  selectedOrganization: { id: string; name: string } | null;
  metrics: {
    totalOrgs: number;
    activeOrgs: number;
    suspendedOrgs: number;
    totalUsers: number;
    totalProcesses: number;
    totalTasks: number;
  };
  organizations: GlobalOrg[];
  users: GlobalUser[];
  logs: GlobalLog[];
  allOrganizations?: CompactOrg[];
  platformPlans?: PlatformPlanModel[];
  overviewData?: PlatformOverviewData;
  pagination: { page: number; pages: number; total: number; pageSize: number };
};

const viewMeta: Record<
  PlatformView,
  { label: string; title: string; subtitle: string; icon: any }
> = {
  overview: {
    label: "Visão geral",
    title: "Visão da plataforma",
    subtitle: "Acompanhe os clientes e as prioridades da plataforma.",
    icon: FileBarChart,
  },
  organizations: {
    label: "Organizações",
    title: "Organizações",
    subtitle: "Gerencie seus clientes, acessos e assinaturas.",
    icon: Building2,
  },
  users: {
    label: "Usuários",
    title: "Usuários",
    subtitle: "Organize as contas e os vínculos com cada cliente.",
    icon: Users,
  },
  subscriptions: {
    label: "Planos & Assinaturas",
    title: "Planos e assinaturas",
    subtitle: "Gerencie os contratos e os modelos de planos.",
    icon: CalendarClock,
  },
  usage: {
    label: "Uso & Limites",
    title: "Uso da plataforma",
    subtitle: "Compare o consumo atual de cada organização com os limites contratados.",
    icon: Layers,
  },
  support: {
    label: "Suporte",
    title: "Atendimento e suporte",
    subtitle: "Registre atendimentos internos e consulte o histórico por cliente.",
    icon: MessageSquare,
  },
  audit: {
    label: "Auditoria",
    title: "Auditoria da plataforma",
    subtitle: "Consulte ações, responsáveis e justificativas.",
    icon: Activity,
  },
};

const supportLabels: Record<string, { label: string; color: string }> = {
  OPEN: { label: "Novo atendimento", color: "bg-blue-50 text-blue-700 border-blue-200" },
  FOLLOW_UP: { label: "Acompanhamento", color: "bg-amber-50 text-amber-700 border-amber-200" },
  RESOLVED: { label: "Resolvido", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

const actionLabels: Record<string, string> = {
  PLATFORM_USER_STATUS_CHANGED: "Acesso à plataforma alterado",
  MANUAL_SUBSCRIPTION_UPDATED: "Assinatura manual atualizada",
  SUPPORT_NOTE_ADDED: "Atendimento registrado",
  ORGANIZATION_ACTIVATED: "Organização ativada",
  ORGANIZATION_SUSPENDED: "Organização suspensa",
  ORGANIZATION_CREATED: "Organização criada",
  ORGANIZATION_UPDATED: "Organização atualizada",
  ORGANIZATION_DELETED: "Organização excluída",
  PLATFORM_USER_CREATED: "Usuário criado na plataforma",
  PLATFORM_USER_CREATED_AND_LINKED: "Usuário criado e vinculado",
  PLATFORM_USER_UPDATED: "Usuário atualizado",
  PLATFORM_USER_DELETED: "Usuário excluído",
  ORGANIZATION_MEMBER_LINKED: "Vínculo organizacional criado",
  ORGANIZATION_MEMBER_UNLINKED: "Vínculo organizacional removido",
  ORGANIZATION_MEMBER_ROLE_CHANGED: "Cargo de membro alterado",
  PLATFORM_PLAN_CREATED: "Plano criado",
  PLATFORM_PLAN_UPDATED: "Plano atualizado",
  PLATFORM_PLAN_DELETED: "Plano excluído",
  EXECUTION_STATUS_CHANGED: "Situação da execução alterada",
  EXECUTION_COMPLETED: "Execução concluída",
  EXECUTION_STARTED: "Execução iniciada",
  TEMPLATE_ARCHIVED: "Modelo arquivado",
  TEMPLATE_PUBLISHED: "Modelo publicado",
  TEMPLATE_DRAFT_UPDATED: "Rascunho do modelo atualizado",
  TEMPLATE_CREATED: "Modelo criado",
  TEMPLATE_DUPLICATED: "Modelo duplicado",
  TEMPLATE_SAVED_FROM_PROCESS: "Modelo salvo a partir de processo",
  PROCESS_CREATED_FROM_TEMPLATE: "Processo criado a partir de modelo",
  RETENTION_PURGE_EXECUTED: "Limpeza de retenção executada",
  TRASH_PURGE_EXECUTED: "Limpeza da lixeira executada",
  HISTORY_PURGE_EXECUTED: "Limpeza do histórico executada",
  MEMBER_DETAILS_UPDATED: "Dados da pessoa atualizados",
  MEMBER_PERMANENTLY_DELETED: "Pessoa excluída definitivamente",
  MEMBER_ACCESS_UPDATED: "Permissões da pessoa atualizadas",
  TEAM_MEMBERS_UPDATED: "Pessoas da equipe atualizadas",
  TEAM_LOCATIONS_UPDATED: "Unidades da equipe atualizadas",
  SCHEDULED_REPORT_CREATED: "Relatório programado",
  SCHEDULED_REPORT_EXECUTED: "Relatório gerado",
  PASSWORD_RESET_REQUESTED: "Redefinição de senha solicitada",
  TASK_OVERDUE: "Prazo da tarefa excedido",
  TASK_EXPIRING_SOON: "Tarefa próxima do vencimento",
  APPROVAL_DEADLINE_EXCEEDED: "Prazo de aprovação excedido",
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeZone: "America/Sao_Paulo",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function addDaysToDateString(dateStr: string, days: number): string {
  try {
    const d = new Date(`${dateStr}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

function formatDateTime(value: string) {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "America/Sao_Paulo",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function getInitials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function nullableNumber(form: FormData, name: string) {
  const val = String(form.get(name) ?? "").trim();
  return val ? Number(val) : null;
}

export function SuperadminDashboardClient(props: Props) {
  const { view, metrics, organizations, users, logs, pagination } = props;
  const activity = usePlatformActivity();

  const [statusTarget, setStatusTarget] = useState<{
    kind: "organization" | "user";
    id: string;
    name: string;
    status: string;
  } | null>(null);

  const [subscriptionTarget, setSubscriptionTarget] = useState<GlobalOrg | null>(null);
  const [supportOrgTarget, setSupportOrgTarget] = useState<{ id: string; name: string } | null>(null);

  // Sub-aba de Planos e Assinaturas: "assignments" (Assinaturas por Empresa) ou "plans" (Catálogo de Planos Prontos)
  const [subscriptionSubView, setSubscriptionSubView] = useState<"assignments" | "plans">("assignments");

  // Modais de Planos Prontos
  const [createPlanOpen, setCreatePlanOpen] = useState(false);
  const [editPlanTarget, setEditPlanTarget] = useState<PlatformPlanModel | null>(null);
  const [deletePlanTarget, setDeletePlanTarget] = useState<PlatformPlanModel | null>(null);
  const [applyPlanTarget, setApplyPlanTarget] = useState<PlatformPlanModel | null>(null);

  // Estado controlado do formulário do Modal de Assinatura para permitir autopreenchimento a partir de um plano pronto
  const [selectedPresetPlanId, setSelectedPresetPlanId] = useState<string>("");
  const [subPlanName, setSubPlanName] = useState<string>("");
  const [subStatus, setSubStatus] = useState<string>("ACTIVE");
  const [subCycle, setSubCycle] = useState<string>("MONTHLY");
  const [subAmount, setSubAmount] = useState<string>("");
  const [subStartsOn, setSubStartsOn] = useState<string>("");
  const [subEndsOn, setSubEndsOn] = useState<string>("");
  const [subMemberLimit, setSubMemberLimit] = useState<string>("");
  const [subLocationLimit, setSubLocationLimit] = useState<string>("");
  const [subNotes, setSubNotes] = useState<string>("");

  function openSubscriptionModal(org: GlobalOrg, presetPlan?: PlatformPlanModel) {
    setSubscriptionTarget(org);
    if (presetPlan) {
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
      const isPilot =
        presetPlan.name.toLowerCase().includes("piloto") ||
        presetPlan.name.toLowerCase().includes("trial") ||
        presetPlan.name.toLowerCase().includes("30 dias");

      setSelectedPresetPlanId(presetPlan.id);
      setSubPlanName(presetPlan.name);
      setSubStatus(isPilot ? "TRIAL" : "ACTIVE");
      setSubCycle(presetPlan.cycle);
      setSubAmount(presetPlan.amountCents != null ? (presetPlan.amountCents / 100).toFixed(2) : "");
      setSubStartsOn(today);
      setSubEndsOn(isPilot ? addDaysToDateString(today, 30) : "");
      setSubMemberLimit(presetPlan.memberLimit != null ? String(presetPlan.memberLimit) : "");
      setSubLocationLimit(presetPlan.locationLimit != null ? String(presetPlan.locationLimit) : "");
      setSubNotes(
        presetPlan.description
          ? `${presetPlan.description}${presetPlan.features ? `\n\nRecursos inclusos:\n${presetPlan.features}` : ""}`
          : ""
      );
    } else if (org.subscription) {
      const matched = props.platformPlans?.find(
        (p) => p.name.toLowerCase() === org.subscription?.planName?.toLowerCase()
      );
      setSelectedPresetPlanId(matched ? matched.id : "");
      setSubPlanName(org.subscription.planName);
      setSubStatus(org.subscription.status);
      setSubCycle(org.subscription.cycle);
      setSubAmount(org.subscription.amountCents != null ? (org.subscription.amountCents / 100).toFixed(2) : "");
      setSubStartsOn(org.subscription.startsOn);
      setSubEndsOn(org.subscription.endsOn ?? "");
      setSubMemberLimit(org.subscription.memberLimit != null ? String(org.subscription.memberLimit) : "");
      setSubLocationLimit(org.subscription.locationLimit != null ? String(org.subscription.locationLimit) : "");
      setSubNotes(org.subscription.notes ?? "");
    } else {
      setSelectedPresetPlanId("");
      setSubPlanName("");
      setSubStatus("ACTIVE");
      setSubCycle("MONTHLY");
      setSubAmount("");
      setSubStartsOn(new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }));
      setSubEndsOn("");
      setSubMemberLimit("");
      setSubLocationLimit("");
      setSubNotes("");
    }
  }

  function handlePresetPlanChange(planId: string) {
    setSelectedPresetPlanId(planId);
    if (!planId) return;
    const plan = props.platformPlans?.find((p) => p.id === planId);
    if (plan) {
      const isPilot =
        plan.name.toLowerCase().includes("piloto") ||
        plan.name.toLowerCase().includes("trial") ||
        plan.name.toLowerCase().includes("30 dias");
      const currentStart = subStartsOn || new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

      setSubPlanName(plan.name);
      setSubStatus(isPilot ? "TRIAL" : "ACTIVE");
      setSubCycle(plan.cycle);
      setSubAmount(plan.amountCents != null ? (plan.amountCents / 100).toFixed(2) : "");
      if (isPilot) {
        setSubEndsOn(addDaysToDateString(currentStart, 30));
      }
      setSubMemberLimit(plan.memberLimit != null ? String(plan.memberLimit) : "");
      setSubLocationLimit(plan.locationLimit != null ? String(plan.locationLimit) : "");
      if (!subNotes || subNotes.trim() === "") {
        setSubNotes(
          plan.description ? `${plan.description}${plan.features ? `\n\nRecursos:\n${plan.features}` : ""}` : ""
        );
      }
      toast.add({
        title: "Modelo aplicado",
        description: `Os dados do plano "${plan.name}" foram preenchidos no formulário.${
          isPilot ? " Vigência definida para 30 dias e status 'Em avaliação'." : ""
        }`,
        type: "success",
      });
    }
  }

  // Modais de Organizações
  const [createOrgOpen, setCreateOrgOpen] = useState(false);
  const [editOrgTarget, setEditOrgTarget] = useState<GlobalOrg | null>(null);
  const [deleteOrgTarget, setDeleteOrgTarget] = useState<GlobalOrg | null>(null);
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgSlug, setNewOrgSlug] = useState("");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

  // Modais de Usuários e Vínculos
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [editUserTarget, setEditUserTarget] = useState<GlobalUser | null>(null);
  const [deleteUserTarget, setDeleteUserTarget] = useState<GlobalUser | null>(null);
  const [manageMembershipsTarget, setManageMembershipsTarget] = useState<GlobalUser | null>(null);

  const pending = activity.busy;

  function closeModals(force: unknown = false) {
    if (force === true || !pending) {
      setStatusTarget(null);
      setSubscriptionTarget(null);
      setSelectedPresetPlanId("");
      setSupportOrgTarget(null);
      setCreateOrgOpen(false);
      setEditOrgTarget(null);
      setDeleteOrgTarget(null);
      setCreateUserOpen(false);
      setEditUserTarget(null);
      setDeleteUserTarget(null);
      setManageMembershipsTarget(null);
      setCreatePlanOpen(false);
      setEditPlanTarget(null);
      setDeletePlanTarget(null);
      setApplyPlanTarget(null);
      setNewOrgName("");
      setNewOrgSlug("");
      setSlugManuallyEdited(false);
    }
  }

  async function handleRunAction(action: () => Promise<ActionResult>, successMessage: string) {
    const release = activity.beginMutation();
    if (!release) return;
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
      closeModals(true);
      toast.add({
        title: "Operação concluída",
        description: successMessage,
        type: "success",
      });
      activity.refresh();
    } catch (error) {
      unstable_rethrow(error);
      toast.add({
        title: "Erro inesperado",
        description: "Não foi possível completar a operação. Tente novamente.",
        type: "error",
      });
    } finally {
      release();
    }
  }

  function href(nextView: PlatformView, organization?: string, page?: number, preserveFilters = true) {
    const params = new URLSearchParams({ view: nextView });
    if (organization) params.set("organization", organization);
    if (page && page > 1) params.set("page", String(page));
    const keepFilters = preserveFilters && nextView === view && (organization ?? "") === props.organizationFilter;
    if (keepFilters && props.query) params.set("q", props.query);
    if (keepFilters && props.status !== "ALL") params.set("status", props.status);
    return `/superadmin?${params.toString()}`;
  }

  const isLogView = view === "audit" || view === "support";
  const hasActiveFilters = Boolean(props.query || props.status !== "ALL" || props.organizationFilter);

  return (
    <PlatformActivityBoundary activity={activity}>
    <AppShell
      userName={props.userName}
      orgName="Plataforma Tarefaí"
      role="SUPERADMIN"
      mode="platform"
      activeView={view}
    >
      <PlatformPage
        subscriptions={view === "subscriptions"}
        tab={subscriptionSubView}
        onTabChange={(value) =>
          setSubscriptionSubView(value as "assignments" | "plans")
        }
      >
        <PageHeader
          title={viewMeta[view].title}
          subtitle={viewMeta[view].subtitle}
          actions={
            <>
              {(view === "overview" || view === "organizations") && (
                <Button onClick={() => setCreateOrgOpen(true)}>
                  <Plus data-icon="inline-start" />
                  Nova organização
                </Button>
              )}
              {view === "users" && (
                <Button onClick={() => setCreateUserOpen(true)}>
                  <UserPlus data-icon="inline-start" />
                  Novo usuário
                </Button>
              )}
              {view === "subscriptions" && subscriptionSubView === "plans" && (
                <Button onClick={() => setCreatePlanOpen(true)}>
                  <Plus data-icon="inline-start" />
                  Novo plano
                </Button>
              )}
              {view === "support" && (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button disabled={!props.allOrganizations?.length}>
                        <Plus data-icon="inline-start" />
                        Registrar atendimento
                      </Button>
                    }
                  />
                  <DropdownMenuContent
                    align="end"
                    className="min-w-64 max-h-80"
                  >
                    <DropdownMenuGroup>
                      {props.allOrganizations?.map((org) => (
                        <DropdownMenuItem
                          key={org.id}
                          onClick={() => setSupportOrgTarget(org)}
                        >
                          {org.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </>
          }
        />

        {view === "overview" && props.overviewData && (
          <PlatformOverview
            metrics={metrics}
            data={props.overviewData}
            organizations={organizations}
          />
        )}

        {view !== "overview" && (
          <>
            {props.selectedOrganization && (
              <div className="sa-context">
                <Building2 size={17} />
                <span>
                  Organização:{" "}
                  <strong>{props.selectedOrganization.name}</strong>
                </span>
                <Link
                  href={href(view, undefined, undefined, false)}
                  className="sa-text-link"
                >
                  <X size={14} />
                  Remover filtro
                </Link>
              </div>
            )}

            {view === "subscriptions" && (
              <div className="sa-tabs">
                <TabsList variant="line" aria-label="Planos e assinaturas">
                    <TabsTrigger value="assignments" disabled={pending}>Assinaturas</TabsTrigger>
                    <TabsTrigger value="plans" disabled={pending}>
                    Catálogo de planos{" "}
                    <Badge variant="secondary">
                      {props.platformPlans?.length ?? 0}
                    </Badge>
                  </TabsTrigger>
                </TabsList>
              </div>
            )}

            {!(view === "subscriptions" && subscriptionSubView === "plans") && (
              <div className="sa-toolbar">
                <PlatformForm
                  method="get"
                  action="/superadmin"
                  aria-label="Filtrar registros"
                >
                  <input type="hidden" name="view" value={view} />
                  <FieldGroup className="sa-filter-fields">
                    <Field>
                      <FieldLabel htmlFor="platform-search" className="sr-only">
                        Buscar registros
                      </FieldLabel>
                      <InputGroup>
                        <InputGroupAddon>
                          <Search />
                        </InputGroupAddon>
                        <InputGroupInput
                          key={`${view}-${props.query}`}
                          id="platform-search"
                          name="q"
                          defaultValue={props.query}
                          placeholder={
                            isLogView
                            ? "Buscar registros"
                              : view === "users"
                                ? "Buscar nome ou e-mail"
                              : "Buscar organização"
                          }
                        />
                      </InputGroup>
                    </Field>
                    {isLogView ? (
                      <Field>
                        <FieldLabel
                          htmlFor="platform-organization"
                          className="sr-only"
                        >
                          Organização
                        </FieldLabel>
                        <NativeSelect
                          id="platform-organization"
                          name="organization"
                          key={props.organizationFilter}
                          defaultValue={props.organizationFilter}
                        >
                          <NativeSelectOption value="">
                            Todas as organizações
                          </NativeSelectOption>
                          {props.allOrganizations?.map((org) => (
                            <NativeSelectOption key={org.id} value={org.id}>
                              {org.name}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </Field>
                    ) : (
                      <Field>
                        {props.organizationFilter && (
                          <input
                            type="hidden"
                            name="organization"
                            value={props.organizationFilter}
                          />
                        )}
                        <FieldLabel
                          htmlFor="platform-status"
                          className="sr-only"
                        >
                          Status
                        </FieldLabel>
                        <NativeSelect
                          id="platform-status"
                          name="status"
                          key={props.status}
                          defaultValue={props.status}
                        >
                          <NativeSelectOption value="ALL">
                            Todos os status
                          </NativeSelectOption>
                          <NativeSelectOption value="ACTIVE">
                            Ativos
                          </NativeSelectOption>
                          <NativeSelectOption value="SUSPENDED">
                            Suspensos
                          </NativeSelectOption>
                        </NativeSelect>
                      </Field>
                    )}
                  </FieldGroup>
                  <Button type="submit" variant="outline">
                    Filtrar
                  </Button>
                </PlatformForm>
                <div className="sa-toolbar-result">
                  <span>
                    {pagination.total}{" "}
                    {isLogView
                      ? "registros"
                      : view === "users"
                        ? "usuários"
                        : "organizações"}
                  </span>
                  {hasActiveFilters && (
                    <Link
                      className="sa-text-link"
                      href={href(view, undefined, undefined, false)}
                    >
                      Limpar filtros
                    </Link>
                  )}
                </div>
              </div>
            )}

            {!pagination.total &&
              !(
                view === "subscriptions" && subscriptionSubView === "plans"
              ) && (
                <EmptyState
                  icon={
                    isLogView ? Activity : view === "users" ? Users : Building2
                  }
                  title="Nenhum resultado encontrado"
                  description={
                    hasActiveFilters
                      ? "Ajuste os filtros para encontrar o que procura."
                      : view === "support"
                        ? "Registre o primeiro atendimento pelo botão no topo da página."
                        : "Os registros desta área aparecerão aqui."
                  }
                  action={
                    hasActiveFilters ? (
                      <Button
                        variant="outline"
                        nativeButton={false}
                        render={
                          <Link
                            href={href(view, undefined, undefined, false)}
                          />
                        }
                      >
                        Limpar filtros
                      </Button>
                    ) : undefined
                  }
                />
              )}

            {view === "organizations" && !!organizations.length && (
              <PlatformPanel
                title="Base de clientes"
                description="Acessos, pessoas e condições de cada organização."
                className="sa-list-panel"
              >
                <PlatformTable
                  label="Organizações"
                  columns={[
                    "Organização",
                    "Status",
                    "Pessoas / unidades",
                    "Assinatura",
                    "Ações",
                  ]}
                >
                  {organizations.map((org) => (
                    <TableRow key={org.id}>
                      <TableCell>
                        <PlatformIdentity
                          name={org.name}
                          description={`/${org.slug}`}
                        />
                        <details className="sa-details">
                          <summary>Dados operacionais</summary>
                          <dl className="sa-facts">
                            <div>
                              <dt>Cadastro</dt>
                              <dd>{formatDate(org.createdAt)}</dd>
                            </div>
                            <div>
                              <dt>Processos</dt>
                              <dd>{org.processesCount}</dd>
                            </div>
                            <div>
                              <dt>Tarefas</dt>
                              <dd>{org.tasksCount}</dd>
                            </div>
                            <div>
                              <dt>Execuções</dt>
                              <dd>{org.executionsCount}</dd>
                            </div>
                          </dl>
                        </details>
                      </TableCell>
                      <TableCell data-label="Status">
                        <PlatformStatus
                          tone={org.status === "ACTIVE" ? "success" : "danger"}
                        >
                          {org.status === "ACTIVE" ? "Ativa" : "Suspensa"}
                        </PlatformStatus>
                      </TableCell>
                      <TableCell data-label="Pessoas / unidades">
                        <span className="sa-numeric">
                          {org.membersCount}{" "}
                          {org.membersCount === 1 ? "pessoa" : "pessoas"}
                        </span>
                        <span className="sa-secondary">
                          {org.locationsCount}{" "}
                          {org.locationsCount === 1 ? "unidade" : "unidades"}
                        </span>
                      </TableCell>
                      <TableCell data-label="Assinatura">
                        <strong>
                          {org.subscription?.planName ?? "Sem plano"}
                        </strong>
                        {org.subscription && (
                          <span className="sa-secondary">
                            {subscriptionStatusLabels[
                              org.subscription.status
                            ] ?? org.subscription.status}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="sa-row-actions">
                        <Button
                          variant="outline"
                          size="sm"
                          nativeButton={false}
                          render={<Link href={href("users", org.id)} />}
                        >
                          Pessoas
                        </Button>
                        <PlatformActions label={org.name}>
                          <DropdownMenuItem
                            onClick={() => setEditOrgTarget(org)}
                          >
                            <Edit3 />
                            Editar organização
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => openSubscriptionModal(org)}
                          >
                            <CalendarClock />
                            {org.subscription
                              ? "Editar assinatura"
                              : "Registrar assinatura"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            render={<Link href={href("usage", org.id)} />}
                          >
                            <Layers />
                            Ver uso e limites
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            render={<Link href={href("support", org.id)} />}
                          >
                            <MessageSquare />
                            Histórico de suporte
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setSupportOrgTarget(org)}
                          >
                            <Plus />
                            Registrar atendimento
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            render={<Link href={href("audit", org.id)} />}
                          >
                            <Activity />
                            Ver auditoria
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() =>
                              setStatusTarget({ kind: "organization", ...org })
                            }
                          >
                            <ShieldAlert />
                            {org.status === "ACTIVE"
                              ? "Suspender organização"
                              : "Reativar organização"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => setDeleteOrgTarget(org)}
                          >
                            <Trash2 />
                            Excluir organização
                          </DropdownMenuItem>
                        </PlatformActions>
                      </TableCell>
                    </TableRow>
                  ))}
                </PlatformTable>
              </PlatformPanel>
            )}

            {view === "users" && !!users.length && (
              <PlatformPanel
                title="Pessoas e acessos"
                description="Contas, segurança e vínculos com organizações."
                className="sa-list-panel"
              >
                <PlatformTable
                  label="Usuários da plataforma"
                  columns={[
                    "Usuário",
                    "Status",
                    "Segurança",
                    "Organizações",
                    "Ações",
                  ]}
                >
                  {users.map((user) => {
                    const isProtected =
                      user.platformRole === "SUPERADMIN" ||
                      user.id === props.currentUserId;
                    return (
                      <TableRow key={user.id}>
                        <TableCell>
                          <PlatformIdentity
                            name={user.name}
                            initials={getInitials(user.name)}
                            description={
                              user.email ?? "Acesso por matrícula / PIN"
                            }
                          />
                          <span className="sa-registration">
                            Desde {formatDate(user.createdAt)}
                            {user.platformRole === "SUPERADMIN" &&
                              " · Superadministrador"}
                          </span>
                        </TableCell>
                        <TableCell data-label="Status">
                          <PlatformStatus
                            tone={
                              user.status === "ACTIVE" ? "success" : "danger"
                            }
                          >
                            {user.status === "ACTIVE" ? "Ativo" : "Suspenso"}
                          </PlatformStatus>
                        </TableCell>
                        <TableCell data-label="Segurança">
                          <span className="sa-inline">
                            <ShieldCheck size={15} />
                            {user.twoFactorEnabled ? "2FA ativo" : "Sem 2FA"}
                          </span>
                        </TableCell>
                        <TableCell data-label="Organizações">
                          {user.memberships.length ? (
                            <details className="sa-details sa-memberships">
                              <summary>
                                {user.memberships.length}{" "}
                                {user.memberships.length === 1
                                  ? "vínculo"
                                  : "vínculos"}
                              </summary>
                              <ul>
                                {user.memberships.map((member) => (
                                  <li key={member.organizationId}>
                                    <Link
                                      href={href(
                                        "organizations",
                                        member.organizationId,
                                      )}
                                    >
                                      {member.organizationName}
                                    </Link>
                                    <small>
                                      {uiLabel(member.role)} ·{" "}
                                      {member.status === "ACTIVE"
                                        ? "Ativo"
                                        : "Inativo"}
                                    </small>
                                  </li>
                                ))}
                              </ul>
                            </details>
                          ) : (
                            <span className="sa-secondary">Sem vínculos</span>
                          )}
                        </TableCell>
                        <TableCell className="sa-row-actions">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setManageMembershipsTarget(user)}
                          >
                            Vínculos
                          </Button>
                          <PlatformActions label={user.name}>
                            <DropdownMenuItem
                              onClick={() => setEditUserTarget(user)}
                            >
                              <Edit3 />
                              Editar usuário
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setManageMembershipsTarget(user)}
                            >
                              <Building2 />
                              Gerenciar vínculos
                            </DropdownMenuItem>
                            {!isProtected && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() =>
                                    setStatusTarget({ kind: "user", ...user })
                                  }
                                >
                                  <ShieldAlert />
                                  {user.status === "ACTIVE"
                                    ? "Suspender acesso"
                                    : "Reativar acesso"}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  variant="destructive"
                                  onClick={() => setDeleteUserTarget(user)}
                                >
                                  <Trash2 />
                                  Excluir usuário
                                </DropdownMenuItem>
                              </>
                            )}
                          </PlatformActions>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </PlatformTable>
              </PlatformPanel>
            )}

            {view === "subscriptions" &&
              subscriptionSubView === "assignments" &&
              !!organizations.length && (
                <TabsContent value="assignments">
                  <PlatformPanel
                    title="Assinaturas por organização"
                    description="Condições registradas manualmente. Sem cobrança automática."
                    className="sa-list-panel"
                  >
                    <PlatformTable
                      label="Assinaturas"
                      columns={[
                        "Organização",
                        "Plano / valor",
                        "Situação",
                        "Vigência",
                        "Ações",
                      ]}
                    >
                      {organizations.map((org) => {
                        const sub = org.subscription;
                        const notice = getSubscriptionNotice(sub);
                        return (
                          <TableRow key={org.id}>
                            <TableCell>
                              <PlatformIdentity
                                name={org.name}
                                description={`/${org.slug}`}
                              />
                              {sub && (
                                <details className="sa-details">
                                  <summary>Condições do contrato</summary>
                                  <dl className="sa-facts">
                                    <div>
                                      <dt>Pessoas</dt>
                                      <dd>{sub.memberLimit ?? "Sem limite"}</dd>
                                    </div>
                                    <div>
                                      <dt>Unidades</dt>
                                      <dd>
                                        {sub.locationLimit ?? "Sem limite"}
                                      </dd>
                                    </div>
                                    <div>
                                      <dt>Início</dt>
                                      <dd>
                                        {formatDate(
                                          `${sub.startsOn}T12:00:00Z`,
                                        )}
                                      </dd>
                                    </div>
                                  </dl>
                                  {sub.notes && (
                                    <p className="sa-note">{sub.notes}</p>
                                  )}
                                </details>
                              )}
                            </TableCell>
                            <TableCell data-label="Plano / valor">
                              <strong>
                                {sub?.planName ?? "Sem assinatura"}
                              </strong>
                              {sub && (
                                <span className="sa-secondary">
                                  {sub.amountCents === null
                                    ? "Valor não informado"
                                    : formatCurrency(sub.amountCents)}{" "}
                                  · {cycleLabels[sub.cycle]}
                                </span>
                              )}
                            </TableCell>
                            <TableCell data-label="Situação">
                              <PlatformStatus
                                tone={
                                  sub?.status === "ACTIVE"
                                    ? "success"
                                    : sub?.status === "PAST_DUE"
                                      ? "danger"
                                      : sub?.status === "TRIAL"
                                        ? "warning"
                                        : "neutral"
                                }
                              >
                                {sub
                                  ? subscriptionStatusLabels[sub.status]
                                  : "Sem plano"}
                              </PlatformStatus>
                            </TableCell>
                            <TableCell data-label="Vigência">
                              {sub?.endsOn ? (
                                <>
                                  <span>
                                    {formatDate(`${sub.endsOn}T12:00:00Z`)}
                                  </span>
                                  {notice && (
                                    <span
                                      className="sa-secondary"
                                      data-tone={
                                        notice.isExpired
                                          ? "danger"
                                          : notice.daysRemaining <= 7
                                            ? "warning"
                                            : undefined
                                      }
                                    >
                                      {notice.isExpired
                                        ? "Expirada"
                                        : notice.daysRemaining === 0
                                          ? "Vence hoje"
                                          : `${notice.daysRemaining} dias restantes`}
                                    </span>
                                  )}
                                </>
                              ) : (
                                <span className="sa-secondary">
                                  {sub ? "Indeterminada" : "Não definida"}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="sa-row-actions">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openSubscriptionModal(org)}
                              >
                                {sub ? "Editar condições" : "Registrar plano"}
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </PlatformTable>
                  </PlatformPanel>
                </TabsContent>
              )}

            {view === "subscriptions" && subscriptionSubView === "plans" && (
              <TabsContent value="plans">
                {props.platformPlans?.length ? (
                  <div className="sa-plan-grid">
                    {props.platformPlans.map((plan) => (
                      <Card key={plan.id} className="sa-plan">
                        <CardHeader>
                          <CardTitle>
                            <h2>{plan.name}</h2>
                          </CardTitle>
                          <CardDescription>
                            {plan.description || "Modelo de assinatura"}
                          </CardDescription>
                          <CardAction>
                            <PlatformActions label={plan.name}>
                              <DropdownMenuItem
                                onClick={() => setEditPlanTarget(plan)}
                              >
                                <Edit3 />
                                Editar plano
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() => setDeletePlanTarget(plan)}
                              >
                                <Trash2 />
                                Excluir plano
                              </DropdownMenuItem>
                            </PlatformActions>
                          </CardAction>
                        </CardHeader>
                        <CardContent>
                          <PlatformStatus
                            tone={
                              plan.status === "ARCHIVED" ? "neutral" : "success"
                            }
                          >
                            {plan.status === "ARCHIVED" ? "Arquivado" : "Ativo"}
                          </PlatformStatus>
                          <div className="sa-price">
                            <strong>
                              {plan.amountCents === null
                                ? "Sob consulta"
                                : formatCurrency(plan.amountCents)}
                            </strong>
                            <span>
                              {
                                cycleLabels[
                                  plan.cycle as keyof typeof cycleLabels
                                ]
                              }
                            </span>
                          </div>
                          <dl className="sa-facts">
                            <div>
                              <dt>Pessoas</dt>
                              <dd>{plan.memberLimit ?? "Sem limite"}</dd>
                            </div>
                            <div>
                              <dt>Unidades</dt>
                              <dd>{plan.locationLimit ?? "Sem limite"}</dd>
                            </div>
                          </dl>
                          {plan.features && (
                            <details className="sa-details">
                              <summary>Recursos incluídos</summary>
                              <p className="sa-note">{plan.features}</p>
                            </details>
                          )}
                        </CardContent>
                        <CardFooter>
                          <Button
                            variant="outline"
                            disabled={plan.status === "ARCHIVED"}
                            onClick={() => setApplyPlanTarget(plan)}
                          >
                            <Plus data-icon="inline-start" />
                            Aplicar a uma organização
                          </Button>
                        </CardFooter>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={CalendarClock}
                    title="Nenhum plano cadastrado"
                    description="Crie modelos para agilizar o registro das assinaturas."
                    action={
                      <Button
                        variant="outline"
                        disabled={pending}
                        onClick={() =>
                          handleRunAction(
                            () => seedDefaultPlatformPlansAction(),
                            "Modelos padrão carregados.",
                          )
                        }
                      >
                        Carregar modelos padrão
                      </Button>
                    }
                  />
                )}
              </TabsContent>
            )}

            {view === "usage" && !!organizations.length && (
              <PlatformPanel
                title="Consumo por organização"
                description="Pessoas e unidades ativas em relação aos limites contratados."
                className="sa-list-panel"
              >
                <PlatformTable
                  label="Uso e limites"
                  columns={[
                    "Organização",
                    "Pessoas",
                    "Unidades",
                    "Operação",
                    "Ações",
                  ]}
                >
                  {organizations.map((org) => {
                    const over =
                      (org.subscription?.memberLimit != null &&
                        org.membersCount > org.subscription.memberLimit) ||
                      (org.subscription?.locationLimit != null &&
                        org.locationsCount > org.subscription.locationLimit);
                    return (
                      <TableRow key={org.id}>
                        <TableCell>
                          <PlatformIdentity
                            name={org.name}
                            description={
                              org.subscription?.planName ??
                              "Sem plano registrado"
                            }
                          />
                          {over && (
                            <PlatformStatus tone="danger">
                              Acima do limite
                            </PlatformStatus>
                          )}
                        </TableCell>
                        <TableCell data-label="Pessoas">
                          <PlatformQuota
                            label="Pessoas"
                            count={org.membersCount}
                            limit={org.subscription?.memberLimit ?? null}
                          />
                        </TableCell>
                        <TableCell data-label="Unidades">
                          <PlatformQuota
                            label="Unidades"
                            count={org.locationsCount}
                            limit={org.subscription?.locationLimit ?? null}
                          />
                        </TableCell>
                        <TableCell data-label="Operação">
                          <span>
                            {org.processesCount} processos · {org.tasksCount}{" "}
                            tarefas
                          </span>
                          <span className="sa-secondary">
                            {org.executionsCount} execuções
                          </span>
                        </TableCell>
                        <TableCell className="sa-row-actions">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openSubscriptionModal(org)}
                          >
                            Ajustar limites
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </PlatformTable>
              </PlatformPanel>
            )}

            {isLogView && !!logs.length && (
              <PlatformPanel
                title={
                  view === "support"
                    ? "Histórico de atendimentos"
                    : "Atividade administrativa"
                }
                description={
                  view === "support"
                    ? "Registros internos de atendimento por organização."
                    : "Ações, responsáveis e justificativas da plataforma."
                }
                className="sa-list-panel"
              >
                <PlatformTable
                  label={view === "support" ? "Atendimentos" : "Auditoria"}
                  columns={[
                    view === "support"
                      ? "Organização / atendimento"
                      : "Ação / organização",
                    "Responsável",
                    "Data e hora",
                  ]}
                >
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>
                        <div className="sa-log-title">
                          {view === "support"
                            ? log.orgName
                            : (actionLabels[log.action] ?? uiLabel(log.action))}
                        </div>
                        {view === "support" ? (
                          <PlatformStatus
                            tone={
                              log.supportStatus === "RESOLVED"
                                ? "success"
                                : log.supportStatus === "FOLLOW_UP"
                                  ? "warning"
                                  : "neutral"
                            }
                          >
                            {supportLabels[log.supportStatus ?? ""]?.label ??
                              "Atendimento"}
                          </PlatformStatus>
                        ) : (
                          <Link
                            className="sa-secondary sa-text-link"
                            href={href("audit", log.organizationId)}
                          >
                            {log.orgName}
                          </Link>
                        )}
                        <details className="sa-details">
                          <summary>
                            {view === "support"
                              ? "Ler atendimento"
                              : "Ver detalhes"}
                          </summary>
                          {log.note ? (
                            <p className="sa-note">{log.note}</p>
                          ) : (
                            <p className="sa-secondary">
                              Sem observações registradas.
                            </p>
                          )}
                          {view === "audit" && (
                            <dl className="sa-facts sa-technical">
                              <div>
                                <dt>Ação</dt>
                                <dd>{log.action}</dd>
                              </div>
                              <div>
                                <dt>Recurso</dt>
                                <dd>
                                  {log.entityType} ({log.entityId})
                                </dd>
                              </div>
                              <div>
                                <dt>Organização</dt>
                                <dd>{log.organizationId}</dd>
                              </div>
                            </dl>
                          )}
                        </details>
                      </TableCell>
                      <TableCell data-label="Responsável">
                        {log.actorName}
                      </TableCell>
                      <TableCell data-label="Data e hora">
                        <time dateTime={log.createdAt}>
                          {formatDateTime(log.createdAt)}
                        </time>
                      </TableCell>
                    </TableRow>
                  ))}
                </PlatformTable>
              </PlatformPanel>
            )}

            {
              !(
                view === "subscriptions" && subscriptionSubView === "plans"
              ) && (
                <PlatformPagination {...pagination} href={(page) => href(view, props.organizationFilter, page)} />
              )}
          </>
        )}
      </PlatformPage>

      {/* MODAL 1: Suspender ou Reativar Acesso */}
      <Modal
        open={Boolean(statusTarget)}
        onClose={closeModals}
        title={`${statusTarget?.status === "ACTIVE" ? "Suspender" : "Reativar"} acesso`}
      >
        {statusTarget && (
          <PlatformForm
            action={async (form) => {
              const nextStatus =
                statusTarget.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
              const reason = String(form.get("reason") ?? "");
              await handleRunAction(
                () =>
                  statusTarget.kind === "organization"
                    ? toggleOrganizationStatusAction(
                        statusTarget.id,
                        nextStatus,
                        reason,
                      )
                    : updatePlatformUserStatusAction(
                        statusTarget.id,
                        nextStatus,
                        reason,
                      ),
                "Status de acesso atualizado com sucesso.",
              );
            }}
            className="flex flex-col gap-4"
          >
            <div
              className={cn(
                "p-3 rounded-xl border text-xs",
                statusTarget.status === "ACTIVE"
                  ? "bg-rose-50 border-rose-200 text-rose-800"
                  : "bg-emerald-50 border-emerald-200 text-emerald-800",
              )}
            >
              <p>
                {statusTarget.status === "ACTIVE"
                  ? `Atenção: A suspensão impedirá imediatamente o acesso ${
                      statusTarget.kind === "organization"
                        ? "de todas as pessoas e operações vinculadas à organização"
                        : "deste usuário na plataforma em todas as organizações"
                    }.`
                  : `A reativação restabelecerá o acesso ${
                      statusTarget.kind === "organization"
                        ? "dos colaboradores à organização"
                        : "deste usuário na plataforma"
                    }.`}
              </p>
            </div>

            <div className="text-xs">
              Alvo da operação: <strong>{statusTarget.name}</strong>
            </div>

            <Field>
              <FieldLabel
                htmlFor="status-reason"
                className="text-xs font-semibold"
              >
                Motivo da alteração (obrigatório para auditoria)
              </FieldLabel>
              <Textarea
                id="status-reason"
                name="reason"
                required
                minLength={5}
                maxLength={2000}
                placeholder="Descreva o motivo desta alteração..."
                disabled={pending}
                className="text-xs min-h-[90px]"
              />
            </Field>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
              <Button
                variant="outline"
                type="button"
                disabled={pending}
                onClick={closeModals}
                className="h-9 text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={pending}
                className={cn(
                  "h-9 text-xs font-semibold text-white",
                  statusTarget.status === "ACTIVE"
                    ? "bg-destructive hover:bg-destructive/90"
                    : "bg-[var(--brand-900)] hover:bg-[var(--brand-700)]",
                )}
              >

                {statusTarget.status === "ACTIVE"
                  ? "Confirmar suspensão"
                  : "Confirmar reativação"}
              </Button>
            </div>
          </PlatformForm>
        )}
      </Modal>

      {/* MODAL 2: Registrar / Editar Assinatura Manual */}
      <Modal
        open={Boolean(subscriptionTarget)}
        onClose={closeModals}
        title={`${subscriptionTarget?.subscription ? "Editar" : "Registrar"} assinatura comercial`}
        className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"
      >
        {subscriptionTarget && (
          <PlatformForm
            key={subscriptionTarget.id}
            action={async (form) => {
              const amountNum =
                subAmount.trim() === ""
                  ? null
                  : Number(subAmount.replace(",", "."));
              await handleRunAction(
                () =>
                  saveManualSubscriptionAction(
                    subscriptionTarget.id,
                    {
                      planName: subPlanName.trim(),
                      status: subStatus,
                      cycle: subCycle,
                      amountCents:
                        amountNum === null || Number.isNaN(amountNum)
                          ? null
                          : Math.round(amountNum * 100),
                      startsOn: subStartsOn,
                      endsOn: subEndsOn.trim() || null,
                      memberLimit:
                        subMemberLimit.trim() === ""
                          ? null
                          : Number(subMemberLimit),
                      locationLimit:
                        subLocationLimit.trim() === ""
                          ? null
                          : Number(subLocationLimit),
                      notes: subNotes.trim(),
                    },
                    String(form.get("reason") ?? ""),
                  ),
                "Assinatura salva no histórico do cliente.",
              );
            }}
            className="flex flex-col gap-4 text-xs"
          >
            <p className="text-muted-foreground">
              Condições contratuais de{" "}
              <strong>{subscriptionTarget.name}</strong>. O controle financeiro
              e cobrança são manuais.
            </p>

            {/* SELETOR DE PLANO PRONTO (MODELO) */}
            <div className="p-3.5 rounded-xl border border-[var(--brand-700)]/25 bg-[var(--brand-soft)]/40 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-xs text-[var(--brand-900)] flex items-center gap-1.5">
                  <Sparkles className="size-3.5 text-[var(--brand-700)]" />
                  Carregar modelo de plano pronto
                </span>
                {selectedPresetPlanId && (
                  <Badge
                    variant="outline"
                    className="text-[10px] bg-white border-[var(--brand-700)]/30 text-[var(--brand-900)] shadow-none"
                  >
                    Modelo aplicado
                  </Badge>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Selecione um plano pronto para preencher os valores, ciclo e
                limites abaixo automaticamente. Você pode customizá-los
                livremente antes de salvar.
              </p>
              <NativeSelect
                id="preset-plan-selector"
                value={selectedPresetPlanId}
                onChange={(e) => handlePresetPlanChange(e.target.value)}
                disabled={pending}
                className="w-full text-xs h-10 bg-white"
              >
                <NativeSelectOption value="">
                  -- Selecione um plano pronto para autopreencher --
                </NativeSelectOption>
                {props.platformPlans?.map((plan) => (
                  <NativeSelectOption key={plan.id} value={plan.id}>
                    {plan.name} —{" "}
                    {plan.amountCents != null
                      ? formatCurrency(plan.amountCents)
                      : "R$ 0,00"}{" "}
                    (
                    {cycleLabels[plan.cycle as keyof typeof cycleLabels] ??
                      plan.cycle}
                    )
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field>
                <FieldLabel
                  htmlFor="plan-name"
                  className="text-xs font-semibold"
                >
                  Nome do plano *
                </FieldLabel>
                <Input
                  id="plan-name"
                  name="planName"
                  value={subPlanName}
                  onChange={(e) => setSubPlanName(e.target.value)}
                  required
                  minLength={2}
                  maxLength={80}
                  placeholder="Ex.: Professional, Enterprise"
                  disabled={pending}
                  className="text-xs h-11"
                />
              </Field>

              <Field>
                <FieldLabel
                  htmlFor="subscription-status"
                  className="text-xs font-semibold"
                >
                  Situação contratual *
                </FieldLabel>
                <NativeSelect
                  id="subscription-status"
                  name="status"
                  value={subStatus}
                  onChange={(e) => setSubStatus(e.target.value)}
                  disabled={pending}
                  className="w-full text-xs h-11"
                >
                  {Object.entries(subscriptionStatusLabels).map(
                    ([value, label]) => (
                      <NativeSelectOption key={value} value={value}>
                        {label}
                      </NativeSelectOption>
                    ),
                  )}
                </NativeSelect>
              </Field>

              <Field>
                <FieldLabel htmlFor="cycle" className="text-xs font-semibold">
                  Periodicidade contratada *
                </FieldLabel>
                <NativeSelect
                  id="cycle"
                  name="cycle"
                  value={subCycle}
                  onChange={(e) => setSubCycle(e.target.value)}
                  disabled={pending}
                  className="w-full text-xs h-11"
                >
                  <NativeSelectOption value="MONTHLY">
                    Mensal
                  </NativeSelectOption>
                  <NativeSelectOption value="YEARLY">Anual</NativeSelectOption>
                  <NativeSelectOption value="CUSTOM">
                    Personalizada
                  </NativeSelectOption>
                </NativeSelect>
              </Field>

              <Field>
                <FieldLabel htmlFor="amount" className="text-xs font-semibold">
                  Valor por período (R$)
                </FieldLabel>
                <Input
                  id="amount"
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  max="10000000"
                  value={subAmount}
                  onChange={(e) => setSubAmount(e.target.value)}
                  placeholder="0,00"
                  disabled={pending}
                  className="text-xs h-11"
                />
              </Field>

              <Field>
                <FieldLabel
                  htmlFor="starts-on"
                  className="text-xs font-semibold"
                >
                  Início da vigência *
                </FieldLabel>
                <Input
                  id="starts-on"
                  name="startsOn"
                  type="date"
                  required
                  value={subStartsOn}
                  onChange={(e) => setSubStartsOn(e.target.value)}
                  disabled={pending}
                  className="text-xs h-11"
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="ends-on" className="text-xs font-semibold">
                  Fim da vigência (opcional)
                </FieldLabel>
                <Input
                  id="ends-on"
                  name="endsOn"
                  type="date"
                  value={subEndsOn}
                  onChange={(e) => setSubEndsOn(e.target.value)}
                  disabled={pending}
                  className="text-xs h-11"
                />
              </Field>

              <Field>
                <FieldLabel
                  htmlFor="member-limit"
                  className="text-xs font-semibold"
                >
                  Limite de pessoas ativas
                </FieldLabel>
                <Input
                  id="member-limit"
                  name="memberLimit"
                  type="number"
                  min="1"
                  max="10000000"
                  step="1"
                  placeholder="Em branco para ilimitado"
                  value={subMemberLimit}
                  onChange={(e) => setSubMemberLimit(e.target.value)}
                  disabled={pending}
                  className="text-xs h-11"
                />
              </Field>

              <Field>
                <FieldLabel
                  htmlFor="location-limit"
                  className="text-xs font-semibold"
                >
                  Limite de unidades ativas
                </FieldLabel>
                <Input
                  id="location-limit"
                  name="locationLimit"
                  type="number"
                  min="1"
                  max="10000000"
                  step="1"
                  placeholder="Em branco para ilimitado"
                  value={subLocationLimit}
                  onChange={(e) => setSubLocationLimit(e.target.value)}
                  disabled={pending}
                  className="text-xs h-11"
                />
              </Field>
            </div>

            <Field>
              <FieldLabel
                htmlFor="subscription-notes"
                className="text-xs font-semibold"
              >
                Observações comerciais
              </FieldLabel>
              <Textarea
                id="subscription-notes"
                name="notes"
                maxLength={2000}
                placeholder="Ex.: Condição acordada na renovação, desconto temporário..."
                value={subNotes}
                onChange={(e) => setSubNotes(e.target.value)}
                disabled={pending}
                className="text-xs min-h-[60px]"
              />
            </Field>

            <Field>
              <FieldLabel
                htmlFor="subscription-reason"
                className="text-xs font-semibold"
              >
                Motivo ou justificativa da alteração (opcional para histórico)
              </FieldLabel>
              <Textarea
                id="subscription-reason"
                name="reason"
                maxLength={2000}
                placeholder="Descreva o motivo desta alteração comercial (opcional)..."
                disabled={pending}
                className="text-xs min-h-[60px]"
              />
            </Field>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
              <Button
                variant="outline"
                type="button"
                onClick={closeModals}
                disabled={pending}
                className="h-9 text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={pending}
                className="h-9 text-xs font-semibold bg-[var(--brand-900)] text-white hover:bg-[var(--brand-700)]"
              >

                Salvar assinatura
              </Button>
            </div>
          </PlatformForm>
        )}
      </Modal>

      <Modal
        open={createPlanOpen}
        onClose={closeModals}
        title="Criar novo modelo de plano pronto"
        className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"
      >
        <PlatformForm
          action={async (form) => {
            const amountVal = String(form.get("amount") ?? "").trim();
            const amountNum =
              amountVal === "" ? null : Number(amountVal.replace(",", "."));
            const memberLim = nullableNumber(form, "memberLimit");
            const locationLim = nullableNumber(form, "locationLimit");

            await handleRunAction(
              () =>
                createPlatformPlanAction({
                  name: String(form.get("name") ?? "").trim(),
                  description:
                    String(form.get("description") ?? "").trim() || null,
                  cycle: (form.get("cycle") ?? "MONTHLY") as
                    "MONTHLY" | "YEARLY" | "CUSTOM",
                  amountCents:
                    amountNum === null || Number.isNaN(amountNum)
                      ? null
                      : Math.round(amountNum * 100),
                  memberLimit: memberLim,
                  locationLimit: locationLim,
                  features: String(form.get("features") ?? "").trim() || null,
                  status: (form.get("status") ?? "ACTIVE") as
                    "ACTIVE" | "ARCHIVED",
                }),
              "Plano pronto criado com sucesso!",
            );
          }}
          className="flex flex-col gap-4 text-xs"
        >
          <p className="text-muted-foreground">
            Defina os parâmetros do plano modelo. Ao registrar ou alterar a
            assinatura de qualquer empresa, você poderá carregar este plano
            pré-configurado.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field className="sm:col-span-2">
              <FieldLabel
                htmlFor="plan-create-name"
                className="text-xs font-semibold"
              >
                Nome do plano *
              </FieldLabel>
              <Input
                id="plan-create-name"
                name="name"
                required
                minLength={2}
                maxLength={80}
                placeholder="Ex.: Start, Profissional, Corporativo, Enterprise"
                disabled={pending}
                className="text-xs h-11"
              />
            </Field>

            <Field>
              <FieldLabel
                htmlFor="plan-create-cycle"
                className="text-xs font-semibold"
              >
                Periodicidade padrão *
              </FieldLabel>
              <NativeSelect
                id="plan-create-cycle"
                name="cycle"
                defaultValue="MONTHLY"
                disabled={pending}
                className="w-full text-xs h-11"
              >
                <NativeSelectOption value="MONTHLY">Mensal</NativeSelectOption>
                <NativeSelectOption value="YEARLY">Anual</NativeSelectOption>
                <NativeSelectOption value="CUSTOM">
                  Personalizada
                </NativeSelectOption>
              </NativeSelect>
            </Field>

            <Field>
              <FieldLabel
                htmlFor="plan-create-amount"
                className="text-xs font-semibold"
              >
                Valor contratual (R$)
              </FieldLabel>
              <Input
                id="plan-create-amount"
                name="amount"
                type="number"
                step="0.01"
                min="0"
                max="10000000"
                placeholder="0,00"
                disabled={pending}
                className="text-xs h-11"
              />
            </Field>

            <Field>
              <FieldLabel
                htmlFor="plan-create-member-limit"
                className="text-xs font-semibold"
              >
                Limite de pessoas ativas
              </FieldLabel>
              <Input
                id="plan-create-member-limit"
                name="memberLimit"
                type="number"
                min="1"
                max="10000000"
                step="1"
                placeholder="Em branco para ilimitado"
                disabled={pending}
                className="text-xs h-11"
              />
            </Field>

            <Field>
              <FieldLabel
                htmlFor="plan-create-location-limit"
                className="text-xs font-semibold"
              >
                Limite de unidades ativas
              </FieldLabel>
              <Input
                id="plan-create-location-limit"
                name="locationLimit"
                type="number"
                min="1"
                max="10000000"
                step="1"
                placeholder="Em branco para ilimitado"
                disabled={pending}
                className="text-xs h-11"
              />
            </Field>

            <Field className="sm:col-span-2">
              <FieldLabel
                htmlFor="plan-create-status"
                className="text-xs font-semibold"
              >
                Situação no catálogo
              </FieldLabel>
              <NativeSelect
                id="plan-create-status"
                name="status"
                defaultValue="ACTIVE"
                disabled={pending}
                className="w-full text-xs h-11"
              >
                <NativeSelectOption value="ACTIVE">
                  Ativo (sugerido para novas assinaturas)
                </NativeSelectOption>
                <NativeSelectOption value="ARCHIVED">
                  Arquivado (não sugerido para novos clientes)
                </NativeSelectOption>
              </NativeSelect>
            </Field>
          </div>

          <Field>
            <FieldLabel
              htmlFor="plan-create-desc"
              className="text-xs font-semibold"
            >
              Descrição comercial do plano
            </FieldLabel>
            <Textarea
              id="plan-create-desc"
              name="description"
              maxLength={500}
              placeholder="Ex.: Ideal para pequenas operações que precisam padronizar rotinas com rapidez..."
              disabled={pending}
              className="text-sm! min-h-15 resize-none"
            />
          </Field>

          <Field>
            <FieldLabel
              htmlFor="plan-create-features"
              className="text-xs font-semibold"
            >
              Recursos inclusos e destaques (uma linha por item)
            </FieldLabel>
            <Textarea
              id="plan-create-features"
              name="features"
              maxLength={2000}
              placeholder="Ex.:&#10;Até 10 colaboradores ativos&#10;1 unidade operacional&#10;Checklists e rotinas ilimitadas&#10;Suporte via ticket"
              disabled={pending}
              className="text-sm! min-h-22.5 resize-none"
            />
          </Field>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
            <Button
              variant="outline"
              type="button"
              onClick={closeModals}
              disabled={pending}
              className="h-9 text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={pending}
              className="h-9 text-xs font-semibold bg-[var(--brand-900)] text-white hover:bg-[var(--brand-700)]"
            >

              Criar modelo de plano
            </Button>
          </div>
        </PlatformForm>
      </Modal>

      {/* MODAL: Editar Plano Pronto */}
      <Modal
        open={Boolean(editPlanTarget)}
        onClose={closeModals}
        title={`Editar plano pronto: ${editPlanTarget?.name}`}
        className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"
      >
        {editPlanTarget && (
          <PlatformForm
            key={editPlanTarget.id}
            action={async (form) => {
              const amountVal = String(form.get("amount") ?? "").trim();
              const amountNum =
                amountVal === "" ? null : Number(amountVal.replace(",", "."));
              const memberLim = nullableNumber(form, "memberLimit");
              const locationLim = nullableNumber(form, "locationLimit");

              await handleRunAction(
                () =>
                  updatePlatformPlanAction(editPlanTarget.id, {
                    name: String(form.get("name") ?? "").trim(),
                    description:
                      String(form.get("description") ?? "").trim() || null,
                    cycle: (form.get("cycle") ?? "MONTHLY") as
                      "MONTHLY" | "YEARLY" | "CUSTOM",
                    amountCents:
                      amountNum === null || Number.isNaN(amountNum)
                        ? null
                        : Math.round(amountNum * 100),
                    memberLimit: memberLim,
                    locationLimit: locationLim,
                    features: String(form.get("features") ?? "").trim() || null,
                    status: (form.get("status") ?? "ACTIVE") as
                      "ACTIVE" | "ARCHIVED",
                  }),
                "Plano pronto atualizado com sucesso!",
              );
            }}
            className="flex flex-col gap-4 text-xs"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field className="sm:col-span-2">
                <FieldLabel
                  htmlFor="plan-edit-name"
                  className="text-xs font-semibold"
                >
                  Nome do plano *
                </FieldLabel>
                <Input
                  id="plan-edit-name"
                  name="name"
                  defaultValue={editPlanTarget.name}
                  required
                  minLength={2}
                  maxLength={80}
                  disabled={pending}
                  className="text-xs h-11"
                />
              </Field>

              <Field>
                <FieldLabel
                  htmlFor="plan-edit-cycle"
                  className="text-xs font-semibold"
                >
                  Periodicidade padrão *
                </FieldLabel>
                <NativeSelect
                  id="plan-edit-cycle"
                  name="cycle"
                  defaultValue={editPlanTarget.cycle}
                  disabled={pending}
                  className="w-full text-xs h-11"
                >
                  <NativeSelectOption value="MONTHLY">
                    Mensal
                  </NativeSelectOption>
                  <NativeSelectOption value="YEARLY">Anual</NativeSelectOption>
                  <NativeSelectOption value="CUSTOM">
                    Personalizada
                  </NativeSelectOption>
                </NativeSelect>
              </Field>

              <Field>
                <FieldLabel
                  htmlFor="plan-edit-amount"
                  className="text-xs font-semibold"
                >
                  Valor contratual (R$)
                </FieldLabel>
                <Input
                  id="plan-edit-amount"
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  max="10000000"
                  defaultValue={
                    editPlanTarget.amountCents != null
                      ? (editPlanTarget.amountCents / 100).toFixed(2)
                      : ""
                  }
                  placeholder="0,00"
                  disabled={pending}
                  className="text-xs h-11"
                />
              </Field>

              <Field>
                <FieldLabel
                  htmlFor="plan-edit-member-limit"
                  className="text-xs font-semibold"
                >
                  Limite de pessoas ativas
                </FieldLabel>
                <Input
                  id="plan-edit-member-limit"
                  name="memberLimit"
                  type="number"
                  min="1"
                  max="10000000"
                  step="1"
                  defaultValue={editPlanTarget.memberLimit ?? ""}
                  placeholder="Em branco para ilimitado"
                  disabled={pending}
                  className="text-xs h-11"
                />
              </Field>

              <Field>
                <FieldLabel
                  htmlFor="plan-edit-location-limit"
                  className="text-xs font-semibold"
                >
                  Limite de unidades ativas
                </FieldLabel>
                <Input
                  id="plan-edit-location-limit"
                  name="locationLimit"
                  type="number"
                  min="1"
                  max="10000000"
                  step="1"
                  defaultValue={editPlanTarget.locationLimit ?? ""}
                  placeholder="Em branco para ilimitado"
                  disabled={pending}
                  className="text-xs h-11"
                />
              </Field>

              <Field className="sm:col-span-2">
                <FieldLabel
                  htmlFor="plan-edit-status"
                  className="text-xs font-semibold"
                >
                  Situação no catálogo
                </FieldLabel>
                <NativeSelect
                  id="plan-edit-status"
                  name="status"
                  defaultValue={editPlanTarget.status}
                  disabled={pending}
                  className="w-full text-xs h-11"
                >
                  <NativeSelectOption value="ACTIVE">
                    Ativo (sugerido para novas assinaturas)
                  </NativeSelectOption>
                  <NativeSelectOption value="ARCHIVED">
                    Arquivado (não sugerido)
                  </NativeSelectOption>
                </NativeSelect>
              </Field>
            </div>

            <Field>
              <FieldLabel
                htmlFor="plan-edit-desc"
                className="text-xs font-semibold"
              >
                Descrição comercial do plano
              </FieldLabel>
              <Textarea
                id="plan-edit-desc"
                name="description"
                maxLength={500}
                defaultValue={editPlanTarget.description ?? ""}
                placeholder="Ex.: Ideal para pequenas operações que precisam padronizar rotinas..."
                disabled={pending}
                className="text-xs min-h-[60px]"
              />
            </Field>

            <Field>
              <FieldLabel
                htmlFor="plan-edit-features"
                className="text-xs font-semibold"
              >
                Recursos inclusos e destaques (uma linha por item)
              </FieldLabel>
              <Textarea
                id="plan-edit-features"
                name="features"
                maxLength={2000}
                defaultValue={editPlanTarget.features ?? ""}
                placeholder="Ex.:&#10;Até 10 colaboradores ativos&#10;1 unidade operacional&#10;Checklists e rotinas ilimitadas"
                disabled={pending}
                className="text-xs min-h-[90px]"
              />
            </Field>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
              <Button
                variant="outline"
                type="button"
                onClick={closeModals}
                disabled={pending}
                className="h-9 text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={pending}
                className="h-9 text-xs font-semibold bg-[var(--brand-900)] text-white hover:bg-[var(--brand-700)]"
              >

                Salvar alterações
              </Button>
            </div>
          </PlatformForm>
        )}
      </Modal>

      {/* MODAL: Excluir Plano Pronto */}
      <Modal
        open={Boolean(deletePlanTarget)}
        onClose={closeModals}
        title="Excluir modelo de plano pronto"
        className="sm:max-w-md"
      >
        {deletePlanTarget && (
          <PlatformForm
            action={async () => {
              await handleRunAction(
                () => deletePlatformPlanAction(deletePlanTarget.id),
                `Plano "${deletePlanTarget.name}" excluído do catálogo.`,
              );
            }}
            className="flex flex-col gap-4 text-xs"
          >
            <div className="p-3.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:border-rose-900/40 dark:text-rose-300">
              <div className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="size-4 shrink-0 text-rose-600" />
                Atenção ao remover modelo
              </div>
              <p className="mt-1 text-[11px] leading-relaxed">
                Você está prestes a excluir o modelo{" "}
                <strong>{deletePlanTarget.name}</strong>. Empresas que já
                contratualizaram este plano continuarão com suas condições
                preservadas, mas o modelo não estará mais disponível para novas
                assinaturas.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
              <Button
                variant="outline"
                type="button"
                onClick={closeModals}
                disabled={pending}
                className="h-9 text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={pending}
                className="h-9 text-xs font-semibold bg-destructive text-white hover:bg-destructive/90"
              >

                Confirmar exclusão
              </Button>
            </div>
          </PlatformForm>
        )}
      </Modal>

      {/* MODAL: Aplicar Plano em Empresa */}
      <Modal
        open={Boolean(applyPlanTarget)}
        onClose={closeModals}
        title={`Aplicar "${applyPlanTarget?.name}" a uma empresa`}
        className="sm:max-w-md"
      >
        {applyPlanTarget && (
          <PlatformForm
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              const orgId = String(form.get("organizationId") ?? "");
              if (!orgId) {
                toast.add({
                  title: "Selecione uma empresa",
                  description: "Escolha qual empresa receberá este plano.",
                  type: "error",
                });
                return;
              }
              const org =
                organizations.find((o) => o.id === orgId) ||
                props.allOrganizations?.find((o) => o.id === orgId);
              if (org) {
                const fullOrg: GlobalOrg = {
                  id: org.id,
                  name: org.name,
                  slug: org.slug,
                  status: org.status,
                  createdAt:
                    "createdAt" in org
                      ? (org as GlobalOrg).createdAt
                      : new Date().toISOString(),
                  membersCount:
                    "membersCount" in org ? (org as GlobalOrg).membersCount : 0,
                  locationsCount:
                    "locationsCount" in org
                      ? (org as GlobalOrg).locationsCount
                      : 0,
                  processesCount:
                    "processesCount" in org
                      ? (org as GlobalOrg).processesCount
                      : 0,
                  tasksCount:
                    "tasksCount" in org ? (org as GlobalOrg).tasksCount : 0,
                  executionsCount:
                    "executionsCount" in org
                      ? (org as GlobalOrg).executionsCount
                      : 0,
                  subscription:
                    "subscription" in org
                      ? (org as GlobalOrg).subscription
                      : null,
                };
                setApplyPlanTarget(null);
                openSubscriptionModal(fullOrg, applyPlanTarget);
              }
            }}
            className="flex flex-col gap-4 text-xs"
          >
            <p className="text-muted-foreground">
              Selecione a empresa que receberá o plano{" "}
              <strong>{applyPlanTarget.name}</strong> (
              {applyPlanTarget.amountCents != null
                ? formatCurrency(applyPlanTarget.amountCents)
                : "R$ 0,00"}
              /
              {cycleLabels[
                applyPlanTarget.cycle as keyof typeof cycleLabels
              ]?.toLowerCase() ?? applyPlanTarget.cycle.toLowerCase()}
              ).
            </p>

            <Field>
              <FieldLabel
                htmlFor="apply-plan-org"
                className="text-xs font-semibold"
              >
                Empresa destino *
              </FieldLabel>
              <NativeSelect
                id="apply-plan-org"
                name="organizationId"
                required
                disabled={pending}
                className="w-full text-xs h-11"
              >
                <NativeSelectOption value="">
                  -- Selecione a empresa --
                </NativeSelectOption>
                {(props.allOrganizations || organizations).map((o) => (
                  <NativeSelectOption key={o.id} value={o.id}>
                    {o.name} ({o.slug})
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
              <Button
                variant="outline"
                type="button"
                onClick={closeModals}
                disabled={pending}
                className="h-9 text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={pending}
                className="h-9 text-xs font-semibold bg-[var(--brand-900)] text-white hover:bg-[var(--brand-700)]"
              >
                Prosseguir para assinatura
              </Button>
            </div>
          </PlatformForm>
        )}
      </Modal>

      {/* MODAL 3: Registrar Atendimento de Suporte */}
      <Modal
        open={Boolean(supportOrgTarget)}
        onClose={closeModals}
        title="Registrar atendimento de suporte"
      >
        {supportOrgTarget && (
          <PlatformForm
            action={async (form) => {
              const status = String(form.get("status") ?? "OPEN");
              const note = String(form.get("note") ?? "");
              await handleRunAction(
                () => addSupportNoteAction(supportOrgTarget.id, status, note),
                "Atendimento registrado com sucesso no histórico do cliente.",
              );
            }}
            className="flex flex-col gap-4 text-xs"
          >
            <p className="text-muted-foreground">
              Cliente: <strong>{supportOrgTarget.name}</strong>. O registro
              ficará disponível para a equipe da plataforma.
            </p>

            <Field>
              <FieldLabel
                htmlFor="support-status"
                className="text-xs font-semibold"
              >
                Etapa do atendimento
              </FieldLabel>
              <NativeSelect
                id="support-status"
                name="status"
                className="w-full text-xs h-9"
                disabled={pending}
              >
                {Object.entries(supportLabels).map(([value, item]) => (
                  <NativeSelectOption key={value} value={value}>
                    {item.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>

            <Field>
              <FieldLabel
                htmlFor="support-note"
                className="text-xs font-semibold"
              >
                Descrição do atendimento ou solução
              </FieldLabel>
              <Textarea
                id="support-note"
                name="note"
                required
                minLength={5}
                maxLength={2000}
                rows={5}
                placeholder="Descreva o que foi solicitado, o diagnóstico e a ação tomada..."
                disabled={pending}
                className="text-xs min-h-[100px]"
              />
              <FieldDescription className="text-[11px] text-muted-foreground mt-1">
                Mínimo de 5 caracteres. Este registro é auditável.
              </FieldDescription>
            </Field>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
              <Button
                variant="outline"
                type="button"
                onClick={closeModals}
                disabled={pending}
                className="h-9 text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={pending}
                className="h-9 text-xs font-semibold bg-[var(--brand-900)] text-white hover:bg-[var(--brand-700)]"
              >

                Registrar atendimento
              </Button>
            </div>
          </PlatformForm>
        )}
      </Modal>

      {/* MODAL 4: Criar Nova Organização */}
      <Modal
        open={createOrgOpen}
        onClose={closeModals}
        title="Nova organização"
        className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"
      >
        <PlatformForm
          action={async (form) => {
            const name = String(form.get("name") ?? "").trim();
            const slug = String(form.get("slug") ?? "").trim();
            const createDefaultLocation =
              form.get("createDefaultLocation") === "on";

            await handleRunAction(
              () =>
                createOrganizationAction({
                  name,
                  slug,
                  createDefaultLocation,
                }),
              "Organização criada com sucesso.",
            );
          }}
          className="flex flex-col gap-4 text-xs"
        >
          <p className="text-muted-foreground">
            Cadastre uma nova organização parceira ou cliente na plataforma.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="org-name" className="text-xs font-semibold">
                Nome da organização *
              </FieldLabel>
              <Input
                id="org-name"
                name="name"
                value={newOrgName}
                onChange={(e) => {
                  const val = e.target.value;
                  setNewOrgName(val);
                  if (!slugManuallyEdited) {
                    setNewOrgSlug(slugify(val));
                  }
                }}
                required
                minLength={2}
                maxLength={100}
                placeholder="Ex.: Barbearia Vintage"
                disabled={pending}
                className="text-xs h-9"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="org-slug" className="text-xs font-semibold">
                Identificador URL (slug) *
              </FieldLabel>
              <Input
                id="org-slug"
                name="slug"
                value={newOrgSlug}
                onChange={(e) => {
                  setSlugManuallyEdited(true);
                  setNewOrgSlug(slugify(e.target.value));
                }}
                required
                minLength={2}
                maxLength={60}
                placeholder="ex: barbearia-vintage"
                disabled={pending}
                className="text-xs h-9 font-mono"
              />
              <FieldDescription className="text-[10px] text-muted-foreground">
                Apenas letras minúsculas, números e hifens.
              </FieldDescription>
            </Field>
          </div>

          <label className="flex items-center gap-2 cursor-pointer p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/50 hover:bg-[var(--surface-muted)] transition-colors">
            <input
              type="checkbox"
              name="createDefaultLocation"
              defaultChecked
              disabled={pending}
              className="size-4 rounded accent-[var(--brand-900)] cursor-pointer"
            />
            <div>
              <span className="font-semibold block text-[var(--text-primary)]">
                Criar unidade padrão ("Matriz / Principal")
              </span>
              <span className="text-[11px] text-muted-foreground block">
                Gera imediatamente uma unidade operacional ativa no fuso de São
                Paulo.
              </span>
            </div>
          </label>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
            <Button
              variant="outline"
              type="button"
              onClick={closeModals}
              disabled={pending}
              className="h-9 text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={pending}
              className="h-9 text-xs font-semibold bg-[var(--brand-900)] text-white hover:bg-[var(--brand-700)]"
            >

              Criar organização
            </Button>
          </div>
        </PlatformForm>
      </Modal>

      {/* MODAL 5: Editar Organização */}
      <Modal
        open={Boolean(editOrgTarget)}
        onClose={closeModals}
        title={`Editar organização: ${editOrgTarget?.name}`}
        className="sm:max-w-lg"
      >
        {editOrgTarget && (
          <PlatformForm
            key={editOrgTarget.id}
            action={async (form) => {
              const name = String(form.get("name") ?? "").trim();
              const slug = String(form.get("slug") ?? "").trim();
              const status = form.get("status") as "ACTIVE" | "SUSPENDED";
              const reason = String(form.get("reason") ?? "").trim();

              await handleRunAction(
                () =>
                  updateOrganizationAction({
                    organizationId: editOrgTarget.id,
                    name,
                    slug,
                    status,
                    reason,
                  }),
                "Organização atualizada com sucesso.",
              );
            }}
            className="flex flex-col gap-4 text-xs"
          >
            <Field>
              <FieldLabel
                htmlFor="edit-org-name"
                className="text-xs font-semibold"
              >
                Nome da organização *
              </FieldLabel>
              <Input
                id="edit-org-name"
                name="name"
                defaultValue={editOrgTarget.name}
                required
                minLength={2}
                maxLength={100}
                disabled={pending}
                className="text-xs h-9"
              />
            </Field>

            <Field>
              <FieldLabel
                htmlFor="edit-org-slug"
                className="text-xs font-semibold"
              >
                Slug (identificador URL) *
              </FieldLabel>
              <Input
                id="edit-org-slug"
                name="slug"
                defaultValue={editOrgTarget.slug}
                required
                minLength={2}
                maxLength={60}
                disabled={pending}
                className="text-xs h-9 font-mono"
              />
              <FieldDescription className="text-[10px] text-muted-foreground">
                Cuidado: alterar o identificador afetará links diretos de acesso
                desta organização.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel
                htmlFor="edit-org-status"
                className="text-xs font-semibold"
              >
                Status de operação *
              </FieldLabel>
              <NativeSelect
                id="edit-org-status"
                name="status"
                defaultValue={editOrgTarget.status}
                disabled={pending}
                className="w-full text-xs h-9"
              >
                <NativeSelectOption value="ACTIVE">
                  Ativa (Operação normal)
                </NativeSelectOption>
                <NativeSelectOption value="SUSPENDED">
                  Suspensa (Bloqueio total de acesso)
                </NativeSelectOption>
              </NativeSelect>
            </Field>

            <Field>
              <FieldLabel
                htmlFor="edit-org-reason"
                className="text-xs font-semibold"
              >
                Motivo da alteração (obrigatório para auditoria) *
              </FieldLabel>
              <Textarea
                id="edit-org-reason"
                name="reason"
                required
                minLength={5}
                maxLength={2000}
                placeholder="Descreva a razão das modificações cadastrais..."
                disabled={pending}
                className="text-xs min-h-[60px]"
              />
            </Field>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
              <Button
                variant="outline"
                type="button"
                onClick={closeModals}
                disabled={pending}
                className="h-9 text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={pending}
                className="h-9 text-xs font-semibold bg-[var(--brand-900)] text-white hover:bg-[var(--brand-700)]"
              >

                Salvar alterações
              </Button>
            </div>
          </PlatformForm>
        )}
      </Modal>

      {/* MODAL 6: Excluir Organização */}
      <Modal
        open={Boolean(deleteOrgTarget)}
        onClose={closeModals}
        title={`Excluir organização: ${deleteOrgTarget?.name}`}
        className="sm:max-w-lg"
      >
        {deleteOrgTarget && (
          <PlatformForm
            key={deleteOrgTarget.id}
            action={async (form) => {
              const confirmationSlug = String(
                form.get("confirmationSlug") ?? "",
              ).trim();
              const reason = String(form.get("reason") ?? "").trim();

              await handleRunAction(
                () =>
                  deleteOrganizationAction({
                    organizationId: deleteOrgTarget.id,
                    confirmationSlug,
                    reason,
                  }),
                "Organização e registros vinculados excluídos com sucesso.",
              );
            }}
            className="flex flex-col gap-4 text-xs"
          >
            <div className="p-3 rounded-xl border bg-rose-50 border-rose-200 text-rose-800 text-xs">
              <div className="flex items-center gap-1.5 font-bold mb-1">
                <AlertTriangle className="size-4 shrink-0 text-rose-600" />
                Ação destrutiva e irreversível!
              </div>
              <p>
                A exclusão da organização{" "}
                <strong>{deleteOrgTarget.name}</strong> removerá permanentemente
                todas as unidades, tarefas, processos operacionais, execuções e
                desvinculará todos os membros.
              </p>
            </div>

            <Field>
              <FieldLabel
                htmlFor="delete-org-confirmation"
                className="text-xs font-semibold"
              >
                Para confirmar, digite exatamente o slug{" "}
                <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-foreground font-bold">
                  {deleteOrgTarget.slug}
                </span>
                :
              </FieldLabel>
              <Input
                id="delete-org-confirmation"
                name="confirmationSlug"
                required
                placeholder={deleteOrgTarget.slug}
                disabled={pending}
                className="text-xs h-9 font-mono"
              />
            </Field>

            <Field>
              <FieldLabel
                htmlFor="delete-org-reason"
                className="text-xs font-semibold"
              >
                Motivo da exclusão (obrigatório para auditoria) *
              </FieldLabel>
              <Textarea
                id="delete-org-reason"
                name="reason"
                required
                minLength={5}
                maxLength={2000}
                placeholder="Descreva o motivo pelo qual esta organização está sendo excluída..."
                disabled={pending}
                className="text-xs min-h-[70px]"
              />
            </Field>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
              <Button
                variant="outline"
                type="button"
                onClick={closeModals}
                disabled={pending}
                className="h-9 text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={pending}
                className="h-9 text-xs font-semibold bg-destructive text-white hover:bg-destructive/90"
              >

                Confirmar exclusão definitiva
              </Button>
            </div>
          </PlatformForm>
        )}
      </Modal>

      {/* MODAL 7: Criar Novo Usuário */}
      <Modal
        open={createUserOpen}
        onClose={closeModals}
        title="Novo usuário da plataforma"
        className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"
      >
        <PlatformForm
          action={async (form) => {
            const name = String(form.get("name") ?? "").trim();
            const email = String(form.get("email") ?? "").trim();
            const password = String(form.get("password") ?? "");
            const platformRole = (form.get("platformRole") ?? "USER") as
              "USER" | "SUPERADMIN";
            const organizationId = String(
              form.get("organizationId") ?? "",
            ).trim();
            const role = (form.get("role") || undefined) as
              "OWNER" | "ADMIN" | "MANAGER" | "EMPLOYEE" | undefined;
            const employeeCode = String(form.get("employeeCode") ?? "").trim();
            const pin = String(form.get("pin") ?? "").trim();
            await handleRunAction(
              () =>
                createPlatformUserAction({
                  name,
                  email,
                  password,
                  platformRole,
                  organizationId: organizationId || undefined,
                  role: organizationId ? role : undefined,
                  employeeCode: employeeCode || undefined,
                  pin: pin || undefined,
                }),
              "Usuário cadastrado com sucesso.",
            );
          }}
          className="flex flex-col gap-4 text-xs"
        >
          <p className="text-muted-foreground">
            Cadastre um novo usuário para acesso à plataforma Tarefaí ou ao
            painel administrativo.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="user-name" className="text-xs font-semibold">
                Nome completo *
              </FieldLabel>
              <Input
                id="user-name"
                name="name"
                required
                minLength={2}
                maxLength={100}
                placeholder="Ex.: Mariana Souza"
                disabled={pending}
                className="text-xs h-11"
              />
            </Field>

            <Field>
              <FieldLabel
                htmlFor="user-email"
                className="text-xs font-semibold"
              >
                E-mail de acesso *
              </FieldLabel>
              <Input
                id="user-email"
                name="email"
                type="email"
                required
                placeholder="mariana@empresa.com"
                disabled={pending}
                className="text-xs h-11"
              />
            </Field>

            <Field>
              <FieldLabel
                htmlFor="user-password"
                className="text-xs font-semibold"
              >
                Senha inicial *
              </FieldLabel>
              <Input
                id="user-password"
                name="password"
                type="password"
                required
                minLength={8}
                placeholder="Mínimo de 8 caracteres"
                disabled={pending}
                className="text-xs h-11"
              />
            </Field>

            <Field>
              <FieldLabel
                htmlFor="user-platform-role"
                className="text-xs font-semibold"
              >
                Perfil de acesso global *
              </FieldLabel>
              <NativeSelect
                id="user-platform-role"
                name="platformRole"
                defaultValue="USER"
                disabled={pending}
                className="w-full text-xs h-9"
              >
                <NativeSelectOption value="USER">
                  Usuário Comum (Empresarial)
                </NativeSelectOption>
                <NativeSelectOption value="SUPERADMIN">
                  Superadmin (Gestor da Plataforma)
                </NativeSelectOption>
              </NativeSelect>
            </Field>
          </div>

          <div className="flex flex-col gap-3 p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/40">
            <span className="font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
              <Building2 className="size-3.5 text-[var(--brand-700)]" />
              Vínculo empresarial inicial (opcional)
            </span>
            <p className="text-[11px] text-muted-foreground">
              Vincule imediatamente este usuário a uma organização existente.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field>
                <FieldLabel
                  htmlFor="user-org-select"
                  className="text-xs font-semibold"
                >
                  Organização
                </FieldLabel>
                <NativeSelect
                  id="user-org-select"
                  name="organizationId"
                  defaultValue=""
                  disabled={pending}
                  className="w-full text-xs h-9"
                >
                  <NativeSelectOption value="">
                    Nenhuma (Vincular depois)
                  </NativeSelectOption>
                  {props.allOrganizations?.map((o) => (
                    <NativeSelectOption key={o.id} value={o.id}>
                      {o.name} ({o.slug})
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>

              <Field>
                <FieldLabel
                  htmlFor="user-org-role"
                  className="text-xs font-semibold"
                >
                  Papel na organização
                </FieldLabel>
                <NativeSelect
                  id="user-org-role"
                  name="role"
                  defaultValue="EMPLOYEE"
                  disabled={pending}
                  className="w-full text-xs h-9"
                >
                  <NativeSelectOption value="EMPLOYEE">
                    Colaborador / Operador
                  </NativeSelectOption>
                  <NativeSelectOption value="MANAGER">
                    Gestor de Equipe
                  </NativeSelectOption>
                  <NativeSelectOption value="ADMIN">
                    Administrador
                  </NativeSelectOption>
                  <NativeSelectOption value="OWNER">
                    Proprietário (Owner)
                  </NativeSelectOption>
                </NativeSelect>
              </Field>

              <Field>
                <FieldLabel
                  htmlFor="user-employee-code"
                  className="text-xs font-semibold"
                >
                  Matrícula / Código operacional
                </FieldLabel>
                <Input
                  id="user-employee-code"
                  name="employeeCode"
                  maxLength={50}
                  placeholder="Ex.: MAT-1029"
                  disabled={pending}
                  className="text-xs h-11"
                />
              </Field>

              <Field>
                <FieldLabel
                  htmlFor="user-pin"
                  className="text-xs font-semibold"
                >
                  PIN rápido de terminal
                </FieldLabel>
                <Input
                  id="user-pin"
                  name="pin"
                  maxLength={6}
                  pattern="\d{6}"
                  placeholder="Ex.: 123456"
                  disabled={pending}
                  className="text-xs h-11 font-mono"
                />
              </Field>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
            <Button
              variant="outline"
              type="button"
              onClick={closeModals}
              disabled={pending}
              className="h-9 text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={pending}
              className="h-9 text-xs font-semibold bg-[var(--brand-900)] text-white hover:bg-[var(--brand-700)]"
            >

              Criar usuário
            </Button>
          </div>
        </PlatformForm>
      </Modal>

      {/* MODAL 8: Editar Usuário */}
      <Modal
        open={Boolean(editUserTarget)}
        onClose={closeModals}
        title={`Editar usuário: ${editUserTarget?.name}`}
        className="sm:max-w-lg"
      >
        {editUserTarget && (
          <PlatformForm
            key={editUserTarget.id}
            action={async (form) => {
              const name = String(form.get("name") ?? "").trim();
              const email = String(form.get("email") ?? "").trim();
              const platformRole = (form.get("platformRole") ?? "USER") as
                "USER" | "SUPERADMIN";
              const newPassword = String(form.get("newPassword") ?? "");
              const status = form.get("status") as "ACTIVE" | "SUSPENDED";
              await handleRunAction(
                () =>
                  updatePlatformUserAction({
                    userId: editUserTarget.id,
                    name,
                    email,
                    platformRole,
                    newPassword: newPassword || undefined,
                    status,
                  }),
                "Usuário atualizado com sucesso.",
              );
            }}
            className="flex flex-col gap-4 text-xs"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field>
                <FieldLabel
                  htmlFor="edit-user-name"
                  className="text-xs font-semibold"
                >
                  Nome completo *
                </FieldLabel>
                <Input
                  id="edit-user-name"
                  name="name"
                  defaultValue={editUserTarget.name}
                  required
                  minLength={2}
                  maxLength={100}
                  disabled={pending}
                  className="text-xs h-9"
                />
              </Field>

              <Field>
                <FieldLabel
                  htmlFor="edit-user-email"
                  className="text-xs font-semibold"
                >
                  E-mail *
                </FieldLabel>
                <Input
                  id="edit-user-email"
                  name="email"
                  type="email"
                  defaultValue={editUserTarget.email ?? ""}
                  required
                  disabled={pending}
                  className="text-xs h-9"
                />
              </Field>

              <Field>
                <FieldLabel
                  htmlFor="edit-user-platform-role"
                  className="text-xs font-semibold"
                >
                  Papel na plataforma *
                </FieldLabel>
                <NativeSelect
                  id="edit-user-platform-role"
                  name="platformRole"
                  defaultValue={
                    editUserTarget.platformRole === "SUPERADMIN"
                      ? "SUPERADMIN"
                      : "USER"
                  }
                  disabled={pending}
                  className="w-full text-xs h-9"
                >
                  <NativeSelectOption value="USER">
                    Usuário Comum
                  </NativeSelectOption>
                  <NativeSelectOption value="SUPERADMIN">
                    Superadmin
                  </NativeSelectOption>
                </NativeSelect>
              </Field>

              <Field>
                <FieldLabel
                  htmlFor="edit-user-status"
                  className="text-xs font-semibold"
                >
                  Status *
                </FieldLabel>
                <NativeSelect
                  id="edit-user-status"
                  name="status"
                  defaultValue={editUserTarget.status}
                  disabled={pending}
                  className="w-full text-xs h-9"
                >
                  <NativeSelectOption value="ACTIVE">Ativo</NativeSelectOption>
                  <NativeSelectOption value="SUSPENDED">
                    Suspenso
                  </NativeSelectOption>
                </NativeSelect>
              </Field>
            </div>

            <Field>
              <FieldLabel
                htmlFor="edit-user-new-password"
                className="text-xs font-semibold"
              >
                Redefinir senha (opcional)
              </FieldLabel>
              <Input
                id="edit-user-new-password"
                name="newPassword"
                type="password"
                minLength={8}
                placeholder="Deixe em branco para manter a senha atual"
                disabled={pending}
                className="text-xs h-9"
              />
            </Field>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
              <Button
                variant="outline"
                type="button"
                onClick={closeModals}
                disabled={pending}
                className="h-9 text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={pending}
                className="h-9 text-xs font-semibold bg-[var(--brand-900)] text-white hover:bg-[var(--brand-700)]"
              >

                Salvar alterações
              </Button>
            </div>
          </PlatformForm>
        )}
      </Modal>

      {/* MODAL 9: Excluir Usuário */}
      <Modal
        open={Boolean(deleteUserTarget)}
        onClose={closeModals}
        title={`Excluir usuário: ${deleteUserTarget?.name}`}
        className="sm:max-w-lg"
      >
        {deleteUserTarget && (
          <PlatformForm
            key={deleteUserTarget.id}
            action={async (form) => {
              const confirmationEmail = String(
                form.get("confirmationEmail") ?? "",
              ).trim();
              const reason = String(form.get("reason") ?? "").trim();

              await handleRunAction(
                () =>
                  deletePlatformUserAction({
                    userId: deleteUserTarget.id,
                    confirmationEmail,
                    reason,
                  }),
                "Conta de usuário excluída com sucesso.",
              );
            }}
            className="flex flex-col gap-4 text-xs"
          >
            <div className="p-3 rounded-xl border bg-rose-50 border-rose-200 text-rose-800 text-xs">
              <div className="flex items-center gap-1.5 font-bold mb-1">
                <AlertTriangle className="size-4 shrink-0 text-rose-600" />
                Ação destrutiva!
              </div>
              <p>
                A exclusão da conta de <strong>{deleteUserTarget.name}</strong>{" "}
                revogará todos os acessos e desvinculará a pessoa de todas as
                organizações ({deleteUserTarget.memberships.length} organizações
                vinculadas).
              </p>
            </div>

            <Field>
              <FieldLabel
                htmlFor="delete-user-confirmation"
                className="text-xs font-semibold"
              >
                Para confirmar, digite exatamente o e-mail{" "}
                <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-foreground font-bold">
                  {deleteUserTarget.email ?? "sem-email"}
                </span>
                :
              </FieldLabel>
              <Input
                id="delete-user-confirmation"
                name="confirmationEmail"
                type="email"
                required
                placeholder={deleteUserTarget.email ?? ""}
                disabled={pending}
                className="text-xs h-9"
              />
            </Field>

            <Field>
              <FieldLabel
                htmlFor="delete-user-reason"
                className="text-xs font-semibold"
              >
                Motivo da exclusão (obrigatório para auditoria) *
              </FieldLabel>
              <Textarea
                id="delete-user-reason"
                name="reason"
                required
                minLength={5}
                maxLength={2000}
                placeholder="Descreva o motivo da exclusão da conta..."
                disabled={pending}
                className="text-xs min-h-[60px]"
              />
            </Field>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
              <Button
                variant="outline"
                type="button"
                onClick={closeModals}
                disabled={pending}
                className="h-9 text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={pending}
                className="h-9 text-xs font-semibold bg-destructive text-white hover:bg-destructive/90"
              >

                Confirmar exclusão
              </Button>
            </div>
          </PlatformForm>
        )}
      </Modal>

      {/* MODAL 10: Gerenciar Vínculos Organizacionais */}
      <Modal
        open={Boolean(manageMembershipsTarget)}
        onClose={closeModals}
        title={`Vínculos organizacionais: ${manageMembershipsTarget?.name}`}
        className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"
      >
        {manageMembershipsTarget && (
          <div className="flex flex-col gap-5 text-xs">
            {/* Lista de Vínculos Existentes */}
            <div className="flex flex-col gap-2.5">
              <h3 className="font-bold text-sm text-[var(--text-primary)]">
                Organizações vinculadas atualmente (
                {manageMembershipsTarget.memberships.length})
              </h3>

              {manageMembershipsTarget.memberships.length === 0 ? (
                <p className="text-muted-foreground italic p-3 rounded-xl bg-muted/30 border border-border/50">
                  Este usuário ainda não possui nenhum vínculo ativo com
                  organizações.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {manageMembershipsTarget.memberships.map((m) => (
                    <div
                      key={m.organizationId}
                      className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)]"
                    >
                      <div className="min-w-0 flex-1">
                        <strong className="text-sm font-semibold text-[var(--text-primary)] block truncate">
                          {m.organizationName}
                        </strong>
                        <span className="text-xs text-muted-foreground">
                          Papel atual:{" "}
                          <Badge variant="outline" className="text-[10px] ml-1">
                            {uiLabel(m.role)}
                          </Badge>
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {/* Formulário rápido de alteração de papel */}
                        <PlatformForm
                          action={async (form) => {
                            const newRole = form.get("newRole") as
                              "OWNER" | "ADMIN" | "MANAGER" | "EMPLOYEE";
                            const reason = prompt(
                              "Informe o motivo da alteração de cargo (mínimo 5 caracteres):",
                            );
                            if (!reason || reason.trim().length < 5) {
                              if (reason !== null) {
                                toast.add({
                                  title: "Operação cancelada",
                                  description:
                                    "O motivo é obrigatório para auditoria (mínimo 5 caracteres).",
                                  type: "error",
                                });
                              }
                              return;
                            }
                            await handleRunAction(
                              () =>
                                updateOrganizationMemberRoleAction({
                                  organizationId: m.organizationId,
                                  userId: manageMembershipsTarget.id,
                                  newRole,
                                  reason: reason.trim(),
                                }),
                              "Papel atualizado com sucesso.",
                            );
                          }}
                          className="flex items-center gap-1.5"
                        >
                          <NativeSelect
                            name="newRole"
                            defaultValue={m.role}
                            disabled={pending}
                            className="h-8 text-xs w-28"
                            aria-label="Alterar papel"
                          >
                            <NativeSelectOption value="EMPLOYEE">
                              Colaborador
                            </NativeSelectOption>
                            <NativeSelectOption value="MANAGER">
                              Gestor
                            </NativeSelectOption>
                            <NativeSelectOption value="ADMIN">
                              Administrador
                            </NativeSelectOption>
                            <NativeSelectOption value="OWNER">
                              Proprietário
                            </NativeSelectOption>
                          </NativeSelect>
                          <Button
                            type="submit"
                            variant="outline"
                            size="sm"
                            disabled={pending}
                            className="h-8 text-xs font-semibold px-2"
                            title="Salvar novo papel"
                          >
                            Salvar
                          </Button>
                        </PlatformForm>

                        {/* Botão de desvincular */}
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={pending}
                          onClick={async () => {
                            const reason = prompt(
                              `Confirma desvincular ${manageMembershipsTarget.name} da organização ${m.organizationName}?\nInforme o motivo:`,
                            );
                            if (!reason || reason.trim().length < 5) {
                              if (reason !== null) {
                                toast.add({
                                  title: "Operação cancelada",
                                  description:
                                    "O motivo é obrigatório para auditoria (mínimo 5 caracteres).",
                                  type: "error",
                                });
                              }
                              return;
                            }
                            await handleRunAction(
                              () =>
                                removeOrganizationMemberAction({
                                  organizationId: m.organizationId,
                                  userId: manageMembershipsTarget.id,
                                  reason: reason.trim(),
                                }),
                              "Membro desvinculado com sucesso.",
                            );
                          }}
                          className="h-8 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive px-2"
                          title="Remover vínculo"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Formulário para Adicionar Novo Vínculo */}
            <PlatformForm
              action={async (form) => {
                const organizationId = String(
                  form.get("organizationId") ?? "",
                ).trim();
                const role = form.get("role") as
                  "OWNER" | "ADMIN" | "MANAGER" | "EMPLOYEE";
                const employeeCode = String(
                  form.get("employeeCode") ?? "",
                ).trim();
                const pin = String(form.get("pin") ?? "").trim();
                const reason = String(form.get("reason") ?? "").trim();

                await handleRunAction(
                  () =>
                    addOrganizationMemberAction({
                      organizationId,
                      userId: manageMembershipsTarget.id,
                      role,
                      employeeCode: employeeCode || undefined,
                      pin: pin || undefined,
                      reason,
                    }),
                  "Usuário vinculado à organização com sucesso.",
                );
              }}
              className="flex flex-col gap-3 p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/50"
            >
              <h4 className="font-bold text-xs text-[var(--text-primary)] flex items-center gap-1.5">
                <Plus className="size-3.5 text-[var(--brand-700)]" />
                Vincular a uma nova organização
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field>
                  <FieldLabel
                    htmlFor="link-org-select"
                    className="text-xs font-semibold"
                  >
                    Organização *
                  </FieldLabel>
                  <NativeSelect
                    id="link-org-select"
                    name="organizationId"
                    required
                    disabled={pending}
                    className="w-full text-xs h-9"
                  >
                    <NativeSelectOption value="">
                      Selecione uma organização...
                    </NativeSelectOption>
                    {props.allOrganizations
                      ?.filter(
                        (o) =>
                          !manageMembershipsTarget.memberships.some(
                            (m) => m.organizationId === o.id,
                          ),
                      )
                      .map((o) => (
                        <NativeSelectOption key={o.id} value={o.id}>
                          {o.name} ({o.slug})
                        </NativeSelectOption>
                      ))}
                  </NativeSelect>
                </Field>

                <Field>
                  <FieldLabel
                    htmlFor="link-org-role"
                    className="text-xs font-semibold"
                  >
                    Papel *
                  </FieldLabel>
                  <NativeSelect
                    id="link-org-role"
                    name="role"
                    defaultValue="EMPLOYEE"
                    disabled={pending}
                    className="w-full text-xs h-9"
                  >
                    <NativeSelectOption value="EMPLOYEE">
                      Colaborador
                    </NativeSelectOption>
                    <NativeSelectOption value="MANAGER">
                      Gestor
                    </NativeSelectOption>
                    <NativeSelectOption value="ADMIN">
                      Administrador
                    </NativeSelectOption>
                    <NativeSelectOption value="OWNER">
                      Proprietário
                    </NativeSelectOption>
                  </NativeSelect>
                </Field>

                <Field>
                  <FieldLabel
                    htmlFor="link-employee-code"
                    className="text-xs font-semibold"
                  >
                    Matrícula operacional (opcional)
                  </FieldLabel>
                  <Input
                    id="link-employee-code"
                    name="employeeCode"
                    maxLength={50}
                    placeholder="Ex.: FUNC-001"
                    disabled={pending}
                    className="text-xs h-9"
                  />
                </Field>

                <Field>
                  <FieldLabel
                    htmlFor="link-pin"
                    className="text-xs font-semibold"
                  >
                    PIN de terminal (6 dígitos, opcional)
                  </FieldLabel>
                  <Input
                    id="link-pin"
                    name="pin"
                    maxLength={6}
                    pattern="\d{6}"
                    placeholder="Ex.: 654321"
                    disabled={pending}
                    className="text-xs h-9 font-mono"
                  />
                </Field>
              </div>

              <Field>
                <FieldLabel
                  htmlFor="link-reason"
                  className="text-xs font-semibold"
                >
                  Motivo da vinculação (obrigatório para auditoria) *
                </FieldLabel>
                <Textarea
                  id="link-reason"
                  name="reason"
                  required
                  minLength={5}
                  maxLength={2000}
                  placeholder="Descreva a razão da inclusão deste membro na organização..."
                  disabled={pending}
                  className="text-sm! min-h-12.5"
                />
              </Field>

              <div className="flex justify-end pt-1">
                <Button
                  type="submit"
                  disabled={pending}
                  className="h-8 text-xs font-semibold bg-brand-900 text-white hover:bg-brand-700"
                >

                  Adicionar vínculo
                </Button>
              </div>
            </PlatformForm>

            <div className="flex justify-end pt-2 border-t border-[var(--border-subtle)]">
              <Button
                variant="outline"
                type="button"
                onClick={closeModals}
                disabled={pending}
                className="h-9 text-xs"
              >
                Fechar
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </AppShell>
    </PlatformActivityBoundary>
  );
}
