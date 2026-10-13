"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Building2,
  Users,
  Activity,
  ShieldCheck,
  ArrowRight,
  Search,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  CalendarClock,
  FileBarChart,
  MoreVertical,
  X,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Plus,
  MapPin,
  GitMerge,
  CheckSquare,
  Clock,
  Layers,
  Sparkles,
  ExternalLink,
  ShieldAlert,
  Trash2,
  Edit3,
  UserPlus,
  RefreshCw,
  Unlink,
  Check,
  Tag,
  Zap,
} from "lucide-react";
import { AppShell } from "../shared/app-shell";
import { EmptyState, Modal, PageHeader } from "../shared";
import { uiLabel } from "../shared/ui-labels";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
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
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "@/components/ui/toast";
import { Spinner } from "@/components/ui/spinner";
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
  pagination: { page: number; pages: number; total: number; pageSize: number };
};

const viewMeta: Record<
  PlatformView,
  { label: string; title: string; subtitle: string; icon: any }
> = {
  overview: {
    label: "Visão geral",
    title: "Visão da plataforma",
    subtitle: "Acompanhe a base de clientes, métricas de adoção e saúde geral do Marcai.",
    icon: FileBarChart,
  },
  organizations: {
    label: "Organizações",
    title: "Organizações",
    subtitle: "Consulte clientes cadastrados, gerencie acessos e condições contratuais.",
    icon: Building2,
  },
  users: {
    label: "Usuários",
    title: "Usuários da plataforma",
    subtitle: "Consulte pessoas cadastradas, vínculos empresariais e controle global de acesso.",
    icon: Users,
  },
  subscriptions: {
    label: "Planos & Assinaturas",
    title: "Planos e assinaturas",
    subtitle: "Registre o plano e as condições acordadas com cada cliente. O controle financeiro é manual.",
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
    subtitle: "Rastreabilidade de todas as ações administrativas, seus responsáveis e justificativas.",
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
  PLATFORM_USER_UPDATED: "Usuário atualizado",
  PLATFORM_USER_DELETED: "Usuário excluído",
  ORGANIZATION_MEMBER_LINKED: "Vínculo organizacional criado",
  ORGANIZATION_MEMBER_UNLINKED: "Vínculo organizacional removido",
  ORGANIZATION_MEMBER_ROLE_CHANGED: "Cargo de membro alterado",
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
  const router = useRouter();

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

  const [pending, setPending] = useState(false);

  function closeModals() {
    if (!pending) {
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
      closeModals();
      toast.add({
        title: "Operação concluída",
        description: successMessage,
        type: "success",
      });
      router.refresh();
    } catch {
      toast.add({
        title: "Erro inesperado",
        description: "Não foi possível completar a operação. Tente novamente.",
        type: "error",
      });
    } finally {
      setPending(false);
    }
  }

  function href(nextView: PlatformView, organization?: string, page?: number) {
    const params = new URLSearchParams({ view: nextView });
    if (organization) params.set("organization", organization);
    if (page && page > 1) params.set("page", String(page));
    if (props.query) params.set("q", props.query);
    if (props.status !== "ALL") params.set("status", props.status);
    return `/superadmin?${params.toString()}`;
  }

  const isLogView = view === "audit" || view === "support";
  const hasActiveFilters = Boolean(props.query || props.status !== "ALL" || props.organizationFilter);

  return (
    <AppShell
      userName={props.userName}
      orgName="Plataforma Marcai"
      role="SUPERADMIN"
      mode="platform"
      activeView={view}
    >
      <div className="page-stack">
        {/* Header Principal da Página */}
        <PageHeader
          title={viewMeta[view].title}
          subtitle={viewMeta[view].subtitle}
          actions={
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className="h-8 gap-1.5 px-3 rounded-full bg-emerald-500/10 text-emerald-800 dark:text-emerald-400 border-emerald-500/20 font-medium text-xs shadow-none"
              >
                <ShieldCheck className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                Painel Superadmin
              </Badge>
              {(view === "overview" || view === "organizations") && (
                <Button
                  onClick={() => setCreateOrgOpen(true)}
                  className="bg-[var(--brand-900)] text-white hover:bg-[var(--brand-700)] shadow-none h-8 text-xs font-semibold gap-1.5 cursor-pointer"
                >
                  <Plus className="size-3.5" />
                  Nova organização
                </Button>
              )}
              {view === "users" && (
                <Button
                  onClick={() => setCreateUserOpen(true)}
                  className="bg-[var(--brand-900)] text-white hover:bg-[var(--brand-700)] shadow-none h-8 text-xs font-semibold gap-1.5 cursor-pointer"
                >
                  <UserPlus className="size-3.5" />
                  Novo usuário
                </Button>
              )}
              {view === "support" && props.selectedOrganization && (
                <Button
                  onClick={() => setSupportOrgTarget(props.selectedOrganization)}
                  className="bg-[var(--brand-900)] text-white hover:bg-[var(--brand-700)] shadow-none h-8 text-xs font-semibold gap-1.5"
                >
                  <MessageSquare className="size-3.5" />
                  Registrar atendimento
                </Button>
              )}
            </div>
          }
        />

        <nav
          aria-label="Navegação de visões do superadmin"
          className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-[var(--border-subtle)] text-xs scrollbar-none"
        >
          {(
            [
              "overview",
              "organizations",
              "users",
              "subscriptions",
              "usage",
              "support",
              "audit",
            ] as PlatformView[]
          ).map((vKey) => {
            const item = viewMeta[vKey];
            const Icon = item.icon;
            const isActive = view === vKey;
            const badgeCount =
              vKey === "organizations"
                ? metrics.totalOrgs
                : vKey === "users"
                  ? metrics.totalUsers
                  : null;

            return (
              <Link
                key={vKey}
                href={href(vKey, props.organizationFilter)}
                className={cn(
                  "inline-flex items-center gap-2 px-3.5 py-2 rounded-xl font-medium transition-all whitespace-nowrap cursor-pointer shrink-0",
                  isActive
                    ? "bg-[var(--brand-900)] text-white shadow-xs"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-muted)]"
                )}
              >
                <Icon className={cn("size-3.5", isActive ? "text-white" : "text-muted-foreground")} />
                <span>{item.label}</span>
                {badgeCount !== null && (
                  <span
                    className={cn(
                      "px-1.5 py-0.5 rounded-full text-[10px] font-bold tabular-nums leading-none",
                      isActive
                        ? "bg-white/20 text-white"
                        : "bg-[var(--surface-muted)] text-[var(--text-muted)] border border-[var(--border-subtle)]"
                    )}
                  >
                    {badgeCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Chip / Banner de Organização Selecionada (Filtro Ativo) */}
        {props.selectedOrganization && (
          <div className="flex items-center justify-between gap-3 p-3 px-4 rounded-2xl bg-[var(--brand-soft)]/70 border border-[var(--brand-700)]/20 text-xs text-[var(--brand-900)]">
            <div className="flex items-center gap-2 min-w-0">
              <Building2 className="size-4 shrink-0 text-[var(--brand-700)]" />
              <span className="truncate">
                Visualizando dados de:{" "}
                <strong className="font-semibold">{props.selectedOrganization.name}</strong>
              </span>
            </div>
            <Link
              href={href(view)}
              className="inline-flex items-center gap-1 font-semibold text-[var(--brand-700)] hover:text-[var(--brand-900)] hover:underline shrink-0"
            >
              <X className="size-3.5" />
              Limpar filtro de cliente
            </Link>
          </div>
        )}

        {/* Métricas Principais (Visão Geral) */}
        {view === "overview" && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="flex flex-col justify-between p-4.5 bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl shadow-xs transition-all hover:border-[var(--brand-700)]/40">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                  Organizações
                </span>
                <div className="size-8 rounded-xl bg-emerald-500/10 text-emerald-700 flex items-center justify-center">
                  <Building2 className="size-4" />
                </div>
              </div>
              <div>
                <span className="text-2xl sm:text-3xl font-bold tabular-nums text-[var(--text-primary)] block leading-tight">
                  {metrics.totalOrgs}
                </span>
                <span className="text-xs text-[var(--text-secondary)] mt-1 block">
                  {metrics.activeOrgs} ativas · {metrics.suspendedOrgs} suspensas
                </span>
              </div>
            </div>

            <div className="flex flex-col justify-between p-4.5 bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl shadow-xs transition-all hover:border-[var(--brand-700)]/40">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                  Usuários
                </span>
                <div className="size-8 rounded-xl bg-blue-500/10 text-blue-700 flex items-center justify-center">
                  <Users className="size-4" />
                </div>
              </div>
              <div>
                <span className="text-2xl sm:text-3xl font-bold tabular-nums text-[var(--text-primary)] block leading-tight">
                  {metrics.totalUsers}
                </span>
                <span className="text-xs text-[var(--text-secondary)] mt-1 block">
                  Pessoas cadastradas na plataforma
                </span>
              </div>
            </div>

            <div className="flex flex-col justify-between p-4.5 bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl shadow-xs transition-all hover:border-[var(--brand-700)]/40">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                  Processos
                </span>
                <div className="size-8 rounded-xl bg-indigo-500/10 text-indigo-700 flex items-center justify-center">
                  <GitMerge className="size-4" />
                </div>
              </div>
              <div>
                <span className="text-2xl sm:text-3xl font-bold tabular-nums text-[var(--text-primary)] block leading-tight">
                  {metrics.totalProcesses}
                </span>
                <span className="text-xs text-[var(--text-secondary)] mt-1 block">
                  Cadastrados em todas as empresas
                </span>
              </div>
            </div>

            <div className="flex flex-col justify-between p-4.5 bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl shadow-xs transition-all hover:border-[var(--brand-700)]/40">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                  Tarefas Ativas
                </span>
                <div className="size-8 rounded-xl bg-amber-500/10 text-amber-700 flex items-center justify-center">
                  <CheckSquare className="size-4" />
                </div>
              </div>
              <div>
                <span className="text-2xl sm:text-3xl font-bold tabular-nums text-[var(--text-primary)] block leading-tight">
                  {metrics.totalTasks}
                </span>
                <span className="text-xs text-[var(--text-secondary)] mt-1 block">
                  Registros operacionais no sistema
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[var(--surface)] p-3 rounded-2xl border border-[var(--border-subtle)]">
          <form
            method="get"
            action="/superadmin"
            className="flex max-w-3xl gap-2"
          >
            <input type="hidden" name="view" value={view} />
            {props.organizationFilter && (
              <input type="hidden" name="organization" value={props.organizationFilter} />
            )}

            <InputGroup className="h-11 w-full">
              <InputGroupAddon>
                <Search className="size-4 text-muted-foreground" />
              </InputGroupAddon>
              <InputGroupInput
                id="platform-search"
                name="q"
                defaultValue={props.query}
                placeholder={
                  isLogView
                    ? "Buscar por ação, recurso ou cliente..."
                    : view === "users"
                      ? "Buscar por nome ou e-mail..."
                      : "Buscar organização por nome ou slug..."
                }
                className="text-xs!"
              />
              {props.query && (
                <button
                  type="button"
                  onClick={() => {
                    const params = new URLSearchParams(window.location.search);
                    params.delete("q");
                    router.push(`/superadmin?${params.toString()}`);
                  }}
                  className="pr-2.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  title="Limpar busca"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </InputGroup>

            {!isLogView && (
              <NativeSelect
                name="status"
                defaultValue={props.status}
                className="w-full text-xs h-10"
                aria-label="Filtrar por status"
              >
                <NativeSelectOption value="ALL">Todos os status</NativeSelectOption>
                <NativeSelectOption value="ACTIVE">Apenas ativos</NativeSelectOption>
                <NativeSelectOption value="SUSPENDED">Apenas suspensos</NativeSelectOption>
              </NativeSelect>
            )}

            <Button
              type="submit"
              variant="outline"
              size="sm"
              className="h-10 text-xs font-semibold gap-1.5 shrink-0"
            >
              <Search className="size-3.5" />
              Buscar
            </Button>
          </form>

          <div className="flex items-center justify-between sm:justify-end gap-3 text-xs text-muted-foreground shrink-0 px-1">
            <span>
              {pagination.total}{" "}
              {isLogView
                ? "registros"
                : view === "users"
                  ? "usuários"
                  : "organizações"}
            </span>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="xs"
                nativeButton={false}
                render={<Link href={href(view)} />}
                className="h-7 text-xs text-[var(--brand-700)] hover:text-[var(--brand-900)] px-2"
              >
                Limpar filtros
              </Button>
            )}
          </div>
        </div>

        {/* Estado Vazio Quando Não Há Resultados */}
        {!pagination.total && (
          <EmptyState
            icon={isLogView ? Activity : view === "users" ? Users : Building2}
            title="Nenhum resultado encontrado"
            description={
              hasActiveFilters
                ? "Ajuste os filtros de busca para encontrar o que procura."
                : view === "support"
                  ? "Os atendimentos registrados aparecerão aqui."
                  : "Nenhum registro disponível para exibição nesta visão."
            }
            action={
              hasActiveFilters ? (
                <Button variant="outline" size="sm" nativeButton={false} render={<Link href={href(view)} />}>
                  Limpar todos os filtros
                </Button>
              ) : undefined
            }
          />
        )}

        {/* 1. VISÃO DE ORGANIZAÇÕES (Visão Geral & Organizações) */}
        {(view === "overview" || view === "organizations") && !!organizations.length && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {organizations.map((org) => {
              const isActive = org.status === "ACTIVE";

              return (
                <Card
                  key={org.id}
                  className={cn(
                    "relative flex flex-col justify-between rounded-2xl border border-border/70 bg-card p-5 transition-all duration-200 hover:border-border hover:shadow-xs",
                    !isActive && "opacity-80 bg-muted/20"
                  )}
                >
                  <div className="flex flex-col gap-4">
                    {/* Header do Card: Ícone, Nome, Slug e Ações */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div className="size-11 rounded-xl bg-[var(--brand-soft)] text-[var(--brand-900)] flex items-center justify-center font-bold shrink-0">
                          <Building2 className="size-5 text-[var(--brand-700)]" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h2 className="text-base font-bold text-[var(--text-primary)] truncate">
                              {org.name}
                            </h2>
                          </div>
                          <p className="text-xs text-[var(--text-secondary)] truncate">
                            /{org.slug} · Desde {formatDate(org.createdAt)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[11px] font-semibold px-2 py-0.5 rounded-full border shadow-none",
                            isActive
                              ? "bg-emerald-50 text-emerald-800 border-emerald-200/80 dark:bg-emerald-500/10 dark:text-emerald-400"
                              : "bg-rose-50 text-rose-800 border-rose-200/80 dark:bg-rose-500/10 dark:text-rose-400"
                          )}
                        >
                          <span
                            className={cn(
                              "size-1.5 rounded-full mr-1.5 inline-block",
                              isActive ? "bg-emerald-600" : "bg-rose-600"
                            )}
                          />
                          {isActive ? "Ativa" : "Suspensa"}
                        </Badge>

                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <button
                                type="button"
                                className="size-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer"
                                aria-label="Ações da organização"
                              >
                                <MoreVertical className="size-4" />
                              </button>
                            }
                          />
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuItem render={<Link href={href("users", org.id)} />}>
                              <Users className="size-4 mr-2" />
                              Ver pessoas
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setEditOrgTarget(org)}>
                              <Edit3 className="size-4 mr-2" />
                              Editar organização
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openSubscriptionModal(org)}>
                              <CalendarClock className="size-4 mr-2" />
                              {org.subscription ? "Editar plano" : "Registrar plano"}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setSupportOrgTarget(org)}>
                              <MessageSquare className="size-4 mr-2" />
                              Registrar suporte
                            </DropdownMenuItem>
                            <DropdownMenuItem render={<Link href={href("audit", org.id)} />}>
                              <Activity className="size-4 mr-2" />
                              Histórico de auditoria
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => setStatusTarget({ kind: "organization", ...org })}
                              className={isActive ? "text-amber-600 focus:text-amber-700" : "text-emerald-600 focus:text-emerald-700"}
                            >
                              <ShieldAlert className="size-4 mr-2" />
                              {isActive ? "Suspender organização" : "Reativar organização"}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setDeleteOrgTarget(org)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="size-4 mr-2" />
                              Excluir organização
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>

                    {/* Métricas Operacionais da Organização */}
                    <div className="grid grid-cols-4 gap-2 py-3 px-3.5 bg-[var(--surface-muted)]/60 rounded-xl border border-[var(--border-subtle)] text-center">
                      <div>
                        <span className="text-xs text-[var(--text-secondary)] block">Pessoas</span>
                        <strong className="text-sm font-bold text-[var(--text-primary)] tabular-nums">
                          {org.membersCount}
                          {org.subscription?.memberLimit ? (
                            <span className="text-[10px] text-muted-foreground font-normal">
                              /{org.subscription.memberLimit}
                            </span>
                          ) : null}
                        </strong>
                      </div>
                      <div>
                        <span className="text-xs text-[var(--text-secondary)] block">Unidades</span>
                        <strong className="text-sm font-bold text-[var(--text-primary)] tabular-nums">
                          {org.locationsCount}
                          {org.subscription?.locationLimit ? (
                            <span className="text-[10px] text-muted-foreground font-normal">
                              /{org.subscription.locationLimit}
                            </span>
                          ) : null}
                        </strong>
                      </div>
                      <div>
                        <span className="text-xs text-[var(--text-secondary)] block">Processos</span>
                        <strong className="text-sm font-bold text-[var(--text-primary)] tabular-nums">
                          {org.processesCount}
                        </strong>
                      </div>
                      <div>
                        <span className="text-xs text-[var(--text-secondary)] block">Tarefas</span>
                        <strong className="text-sm font-bold text-[var(--text-primary)] tabular-nums">
                          {org.tasksCount}
                        </strong>
                      </div>
                    </div>

                    {/* Resumo Comercial / Assinatura */}
                    <div className="flex items-center justify-between gap-2 text-xs pt-1">
                      {org.subscription ? (
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-semibold text-[var(--text-primary)] truncate">
                            {org.subscription.planName}
                          </span>
                          <span className="text-muted-foreground">·</span>
                          <span className="text-muted-foreground truncate">
                            {org.subscription.amountCents === null
                              ? "Sem valor"
                              : formatCurrency(org.subscription.amountCents)}
                            {org.subscription.cycle === "MONTHLY"
                              ? "/mês"
                              : org.subscription.cycle === "YEARLY"
                                ? "/ano"
                                : ""}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground italic">Sem plano registrado</span>
                      )}

                      {org.subscription && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 shadow-none">
                          {subscriptionStatusLabels[org.subscription.status] ?? org.subscription.status}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Rodapé de Ações Rápidas */}
                  <div className="flex items-center gap-2 pt-4 mt-4 border-t border-[var(--border-subtle)]">
                    <Button
                      variant="outline"
                      size="sm"
                      nativeButton={false}
                      render={<Link href={href("users", org.id)} />}
                      className="flex-1 h-8 text-xs font-semibold"
                    >
                      <Users className="size-3.5" />
                      Pessoas
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openSubscriptionModal(org)}
                      className="flex-1 h-8 text-xs font-semibold"
                    >
                      <CalendarClock className="size-3.5" />
                      {org.subscription ? "Plano" : "+ Plano"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      nativeButton={false}
                      render={<Link href={href("support", org.id)} />}
                      className="h-8 text-xs text-muted-foreground hover:text-foreground"
                    >
                      Suporte
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* 2. VISÃO DE USUÁRIOS (users) */}
        {view === "users" && !!users.length && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {users.map((user) => {
              const isActive = user.status === "ACTIVE";
              const isSuperadmin = user.platformRole === "SUPERADMIN";
              const isProtected = isSuperadmin || user.id === props.currentUserId;

              return (
                <Card
                  key={user.id}
                  className={cn(
                    "relative flex flex-col justify-between rounded-2xl border border-border/70 bg-card p-5 transition-all duration-200 hover:border-border hover:shadow-xs",
                    !isActive && "opacity-80 bg-muted/20"
                  )}
                >
                  <div className="flex flex-col gap-3.5">
                    {/* Header do Usuário: Avatar, Nome, E-mail, Status */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <Avatar className="size-11 rounded-full border border-border/50 shrink-0">
                          <AvatarFallback className="bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] font-bold text-sm tracking-tight">
                            {getInitials(user.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <h2 className="text-base font-bold text-[var(--text-primary)] truncate">
                            {user.name}
                          </h2>
                          <p className="text-xs text-[var(--text-secondary)] truncate">
                            {user.email ?? "Acesso por matrícula / PIN"}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[11px] font-semibold px-2 py-0.5 rounded-full border shadow-none shrink-0",
                            isActive
                              ? "bg-emerald-50 text-emerald-800 border-emerald-200/80 dark:bg-emerald-500/10 dark:text-emerald-400"
                              : "bg-rose-50 text-rose-800 border-rose-200/80 dark:bg-rose-500/10 dark:text-rose-400"
                          )}
                        >
                          <span
                            className={cn(
                              "size-1.5 rounded-full mr-1.5 inline-block",
                              isActive ? "bg-emerald-600" : "bg-rose-600"
                            )}
                          />
                          {isActive ? "Ativo" : "Suspenso"}
                        </Badge>

                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <button
                                type="button"
                                className="size-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer"
                                aria-label="Ações do usuário"
                              >
                                <MoreVertical className="size-4" />
                              </button>
                            }
                          />
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuItem onClick={() => setEditUserTarget(user)}>
                              <Edit3 className="size-4 mr-2" />
                              Editar dados da conta
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setManageMembershipsTarget(user)}>
                              <Building2 className="size-4 mr-2" />
                              Gerenciar organizações
                            </DropdownMenuItem>
                            {!isProtected && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => setStatusTarget({ kind: "user", ...user })}
                                  className={isActive ? "text-amber-600 focus:text-amber-700" : "text-emerald-600 focus:text-emerald-700"}
                                >
                                  <ShieldAlert className="size-4 mr-2" />
                                  {isActive ? "Suspender acesso" : "Reativar acesso"}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => setDeleteUserTarget(user)}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Trash2 className="size-4 mr-2" />
                                  Excluir usuário
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>

                    {/* Metadados: Superadmin, 2FA, Cadastro */}
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      {isSuperadmin && (
                        <Badge className="bg-purple-600 text-white text-[10px] font-semibold px-2 py-0.5">
                          Superadmin
                        </Badge>
                      )}
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] px-2 py-0.5 shadow-none",
                          user.twoFactorEnabled
                            ? "bg-emerald-50/50 text-emerald-700 border-emerald-200/60"
                            : "text-muted-foreground"
                        )}
                      >
                        <ShieldCheck className="size-3 mr-1" />
                        {user.twoFactorEnabled ? "2FA Ativo" : "Sem 2FA"}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">
                        Cadastrado em {formatDate(user.createdAt)}
                      </span>
                    </div>

                    {/* Vínculos com Organizações */}
                    <div className="flex flex-col gap-1.5 pt-2 border-t border-[var(--border-subtle)]">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-[var(--text-secondary)]">
                          Organizações vinculadas:
                        </span>
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => setManageMembershipsTarget(user)}
                          className="h-6 text-[11px] text-[var(--brand-700)] hover:text-[var(--brand-900)] px-1.5"
                        >
                          <Plus className="size-3 mr-1" />
                          Gerenciar
                        </Button>
                      </div>
                      {user.memberships.length ? (
                        <ul className="flex flex-col gap-1 max-h-32 overflow-y-auto pr-1">
                          {user.memberships.map((m) => (
                            <li
                              key={m.organizationId}
                              className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-[var(--surface-muted)]/50 text-xs"
                            >
                              <Link
                                href={href("organizations", m.organizationId)}
                                className="font-medium text-[var(--text-primary)] hover:underline truncate"
                              >
                                {m.organizationName}
                              </Link>
                              <Badge
                                variant="outline"
                                className="text-[10px] font-medium shrink-0 shadow-none"
                              >
                                {uiLabel(m.role)}
                              </Badge>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">Sem vínculos ativos.</p>
                      )}
                    </div>
                  </div>

                  {/* Rodapé de Ações */}
                  <div className="flex items-center gap-2 pt-4 mt-4 border-t border-[var(--border-subtle)]">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditUserTarget(user)}
                      className="flex-1 h-8 text-xs font-semibold"
                    >
                      <Edit3 className="size-3.5 mr-1" />
                      Editar
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setManageMembershipsTarget(user)}
                      className="flex-1 h-8 text-xs font-semibold"
                    >
                      <Building2 className="size-3.5 mr-1" />
                      Vínculos
                    </Button>
                    {!isProtected && (
                      <Button
                        variant={isActive ? "outline" : "default"}
                        size="sm"
                        onClick={() => setStatusTarget({ kind: "user", ...user })}
                        className={cn(
                          "h-8 text-xs font-semibold px-2.5",
                          isActive
                            ? "text-destructive hover:bg-destructive/10 hover:text-destructive border-border"
                            : "bg-[var(--brand-900)] text-white hover:bg-[var(--brand-700)]"
                        )}
                        title={isActive ? "Suspender acesso global" : "Reativar acesso global"}
                      >
                        <ShieldAlert className="size-3.5" />
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* 3. VISÃO DE PLANOS E ASSINATURAS (subscriptions) */}
        {view === "subscriptions" && (
          <div className="flex flex-col gap-4">
            {/* Sub-navegação interna: Assinaturas das Empresas vs Catálogo de Planos Prontos */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-1.5 rounded-2xl bg-[var(--surface-muted)]/60 border border-[var(--border-subtle)]">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setSubscriptionSubView("assignments")}
                  className={cn(
                    "flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer",
                    subscriptionSubView === "assignments"
                      ? "bg-[var(--surface)] text-[var(--text-primary)] shadow-xs border border-[var(--border-subtle)]"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  )}
                >
                  <CalendarClock className="size-3.5 text-[var(--brand-700)]" />
                  <span>Assinaturas das Empresas</span>
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-[var(--surface-muted)] font-bold text-muted-foreground border border-[var(--border-subtle)]">
                    {organizations.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setSubscriptionSubView("plans")}
                  className={cn(
                    "flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer",
                    subscriptionSubView === "plans"
                      ? "bg-[var(--surface)] text-[var(--text-primary)] shadow-xs border border-[var(--border-subtle)]"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  )}
                >
                  <span>Catálogo de Planos Prontos</span>
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-[var(--surface-muted)] font-bold text-muted-foreground border border-[var(--border-subtle)]">
                    {props.platformPlans?.length ?? 0}
                  </span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                {subscriptionSubView === "plans" && (
                  <>
                    <Button
                      size="sm"
                      onClick={() => setCreatePlanOpen(true)}
                      className="h-8 text-xs font-semibold bg-[var(--brand-900)] text-white hover:bg-[var(--brand-700)] gap-1.5 cursor-pointer"
                    >
                      <Plus className="size-3.5" />
                      Novo plano pronto
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* SUB-ABA 1: ASSINATURAS DAS EMPRESAS */}
            {subscriptionSubView === "assignments" && (
              <>
                {organizations.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {organizations.map((org) => {
                      const sub = org.subscription;

                      return (
                        <Card
                          key={org.id}
                          className="flex flex-col justify-between rounded-2xl border border-border/70 bg-card p-5 transition-all duration-200 hover:border-border hover:shadow-xs"
                        >
                          <div className="flex flex-col gap-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <h2 className="text-base font-bold text-[var(--text-primary)] truncate">
                                  {org.name}
                                </h2>
                                <p className="text-xs text-muted-foreground">/{org.slug}</p>
                              </div>
                              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "text-[10px] font-semibold px-2 py-0.5 rounded-full shadow-none",
                                    sub?.status === "ACTIVE" && "bg-emerald-50 text-emerald-800 border-emerald-200",
                                    sub?.status === "TRIAL" && "bg-amber-50 text-amber-800 border-amber-300",
                                    sub?.status === "PAST_DUE" && "bg-rose-50 text-rose-800 border-rose-300",
                                    !sub && "bg-muted text-muted-foreground"
                                  )}
                                >
                                  {sub ? subscriptionStatusLabels[sub.status] ?? sub.status : "Sem plano"}
                                </Badge>
                                {(() => {
                                  const notice = getSubscriptionNotice(sub);
                                  if (!notice) return null;
                                  return (
                                    <Badge
                                      variant="outline"
                                      className={cn(
                                        "text-[10px] font-semibold px-2 py-0.5 rounded-full shadow-none",
                                        notice.isExpired
                                          ? "bg-rose-100/70 text-rose-800 border-rose-300"
                                          : notice.daysRemaining <= 3
                                          ? "bg-amber-100/70 text-amber-900 border-amber-300"
                                          : "bg-emerald-100/70 text-emerald-800 border-emerald-300"
                                      )}
                                    >
                                      {notice.isExpired
                                        ? "Expirado"
                                        : notice.daysRemaining === 0
                                        ? "Vence hoje"
                                        : `${notice.daysRemaining}d restantes`}
                                    </Badge>
                                  );
                                })()}
                              </div>
                            </div>

                            {sub ? (
                              <div className="flex flex-col gap-3 p-3.5 bg-[var(--surface-muted)]/60 rounded-xl border border-[var(--border-subtle)] text-xs">
                                <div className="flex items-center justify-between">
                                  <span className="text-muted-foreground">Plano contratado:</span>
                                  <strong className="text-sm font-bold text-[var(--text-primary)]">
                                    {sub.planName}
                                  </strong>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-muted-foreground">Valor por período:</span>
                                  <strong className="font-semibold text-[var(--text-primary)]">
                                    {sub.amountCents === null ? "Não informado" : formatCurrency(sub.amountCents)}
                                    <span className="text-muted-foreground font-normal">
                                      {" "}
                                      ({sub.cycle === "MONTHLY" ? "Mensal" : sub.cycle === "YEARLY" ? "Anual" : "Customizado"})
                                    </span>
                                  </strong>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-muted-foreground">Vigência:</span>
                                  <span>
                                    {formatDate(`${sub.startsOn}T12:00:00Z`)} até{" "}
                                    {sub.endsOn ? formatDate(`${sub.endsOn}T12:00:00Z`) : "Indeterminada"}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between pt-2 border-t border-[var(--border-subtle)]">
                                  <span className="text-muted-foreground">Limites contratuais:</span>
                                  <span className="font-medium">
                                    {sub.memberLimit ?? "∞"} pessoas · {sub.locationLimit ?? "∞"} unidades
                                  </span>
                                </div>
                                {sub.notes && (
                                  <div className="pt-2 border-t border-[var(--border-subtle)] text-[11px] text-muted-foreground whitespace-pre-wrap">
                                    {sub.notes}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="p-4 rounded-xl bg-[var(--surface-muted)]/30 border border-dashed border-[var(--border-subtle)] text-center text-xs text-muted-foreground">
                                Nenhum contrato manual registrado para este cliente.
                              </div>
                            )}
                          </div>

                          <div className="pt-4 mt-4 border-t border-[var(--border-subtle)]">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openSubscriptionModal(org)}
                              className="w-full h-8 text-xs font-semibold gap-1.5"
                            >
                              <CalendarClock className="size-3.5" />
                              {sub ? "Editar condições da assinatura" : "Registrar assinatura manual"}
                            </Button>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState
                    icon={CalendarClock}
                    title="Nenhuma organização encontrada"
                    description="Não há empresas com assinaturas para os filtros selecionados."
                  />
                )}
              </>
            )}

            {/* SUB-ABA 2: CATÁLOGO DE PLANOS PRONTOS */}
            {subscriptionSubView === "plans" && (
              <div className="flex flex-col gap-4">
                {props.platformPlans && props.platformPlans.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {props.platformPlans.map((plan) => {
                      const assignedCount = organizations.filter(
                        (o) => o.subscription?.planName?.toLowerCase() === plan.name.toLowerCase()
                      ).length;
                      const isArchived = plan.status === "ARCHIVED";

                      return (
                        <Card
                          key={plan.id}
                          className={cn(
                            "relative flex flex-col justify-between rounded-2xl border border-border/70 bg-card p-5 transition-all duration-200 hover:border-border hover:shadow-xs",
                            isArchived && "opacity-75 bg-muted/20"
                          )}
                        >
                          <div className="flex flex-col gap-4">
                            {/* Header do Card */}
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <h4 className="text-base font-bold text-[var(--text-primary)] truncate">
                                    {plan.name}
                                  </h4>
                                </div>
                                <p className="text-xs text-[var(--text-secondary)] mt-0.5 line-clamp-2">
                                  {plan.description || "Sem descrição cadastrada."}
                                </p>
                              </div>

                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 shadow-none",
                                  !isArchived
                                    ? "bg-emerald-50 text-emerald-800 border-emerald-200/80 dark:bg-emerald-500/10 dark:text-emerald-400"
                                    : "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400"
                                )}
                              >
                                {!isArchived ? "Ativo" : "Arquivado"}
                              </Badge>
                            </div>

                            {/* Preço e Periodicidade */}
                            <div className="p-3.5 rounded-xl bg-[var(--surface-muted)]/60 border border-[var(--border-subtle)]">
                              <div className="flex items-baseline gap-1.5">
                                <span className="text-2xl font-black text-[var(--text-primary)] tracking-tight">
                                  {plan.amountCents != null ? formatCurrency(plan.amountCents) : "R$ 0,00"}
                                </span>
                                <span className="text-xs text-muted-foreground font-medium">
                                  /{cycleLabels[plan.cycle as keyof typeof cycleLabels]?.toLowerCase() ?? plan.cycle.toLowerCase()}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)] mt-1.5">
                                <span>
                                  Pessoas:{" "}
                                  <strong className="text-[var(--text-primary)]">
                                    {plan.memberLimit ?? "Ilimitado"}
                                  </strong>
                                </span>
                                <span>·</span>
                                <span>
                                  Unidades:{" "}
                                  <strong className="text-[var(--text-primary)]">
                                    {plan.locationLimit ?? "Ilimitado"}
                                  </strong>
                                </span>
                              </div>
                            </div>

                            {/* Recursos e Destaques */}
                            {plan.features ? (
                              <div className="flex flex-col gap-1.5 text-xs text-[var(--text-secondary)]">
                                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                  Recursos inclusos
                                </span>
                                <ul className="flex flex-col gap-1">
                                  {plan.features
                                    .split("\n")
                                    .filter(Boolean)
                                    .slice(0, 4)
                                    .map((feat, idx) => (
                                      <li key={idx} className="flex items-start gap-1.5 text-xs text-[var(--text-primary)]">
                                        <Check className="size-3.5 text-emerald-600 shrink-0 mt-0.5" />
                                        <span className="line-clamp-1">{feat.trim()}</span>
                                      </li>
                                    ))}
                                </ul>
                              </div>
                            ) : null}

                            {/* Indicador de Empresas com esse plano */}
                            <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-[var(--border-subtle)]">
                              <span>Empresas ativas neste plano:</span>
                              <Badge variant="outline" className="text-[10px] font-bold px-1.5 py-0 shadow-none">
                                {assignedCount} {assignedCount === 1 ? "empresa" : "empresas"}
                              </Badge>
                            </div>
                          </div>

                          {/* Ações do Card */}
                          <div className="flex items-center gap-2 pt-4 mt-4 border-t border-[var(--border-subtle)]">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setEditPlanTarget(plan)}
                              className="flex-1 h-8 text-xs font-semibold cursor-pointer"
                            >
                              <Edit3 className="size-3 mr-1" />
                              Editar
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setApplyPlanTarget(plan)}
                              className="flex-1 h-8 text-xs font-semibold bg-[var(--brand-soft)] text-[var(--brand-900)] hover:bg-[var(--brand-soft)]/80 border-[var(--brand-700)]/20 cursor-pointer"
                            >
                              <Zap className="size-3 mr-1 text-[var(--brand-700)]" />
                              Aplicar
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setDeletePlanTarget(plan)}
                              className="h-8 text-xs font-semibold text-destructive hover:bg-destructive/10 hover:text-destructive px-2.5 cursor-pointer"
                              title="Excluir plano pronto"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState
                    icon={Sparkles}
                    title="Nenhum plano pronto cadastrado"
                    description="Crie modelos de planos com limites e preços para agilizar o registro de assinaturas das empresas."
                    action={
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          onClick={() =>
                            handleRunAction(
                              () => seedDefaultPlatformPlansAction(),
                              "Modelos padrão carregados com sucesso!"
                            )
                          }
                        >
                          Carregar sugestões padrão
                        </Button>
                        <Button
                          onClick={() => setCreatePlanOpen(true)}
                          className="bg-[var(--brand-900)] text-white hover:bg-[var(--brand-700)]"
                        >
                          Criar primeiro plano
                        </Button>
                      </div>
                    }
                  />
                )}
              </div>
            )}
          </div>
        )}

        {/* 4. VISÃO DE USO E LIMITES (usage) */}
        {view === "usage" && !!organizations.length && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {organizations.map((org) => {
              const sub = org.subscription;
              const memberLimit = sub?.memberLimit ?? null;
              const locationLimit = sub?.locationLimit ?? null;
              const isMemberOver = memberLimit !== null && org.membersCount > memberLimit;
              const isLocationOver = locationLimit !== null && org.locationsCount > locationLimit;
              const isOverLimit = isMemberOver || isLocationOver;

              const memberPct = memberLimit ? Math.min(100, Math.round((org.membersCount / memberLimit) * 100)) : null;
              const locationPct = locationLimit ? Math.min(100, Math.round((org.locationsCount / locationLimit) * 100)) : null;

              return (
                <Card
                  key={org.id}
                  className="flex flex-col justify-between rounded-2xl border border-border/70 bg-card p-5 transition-all duration-200 hover:border-border hover:shadow-xs"
                >
                  <div className="flex flex-col gap-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-base font-bold text-[var(--text-primary)] truncate">
                          {org.name}
                        </h2>
                        <p className="text-xs text-muted-foreground">/{org.slug}</p>
                      </div>
                      {isOverLimit && (
                        <Badge
                          variant="outline"
                          className="bg-rose-50 text-rose-700 border-rose-200 text-[10px] font-semibold"
                        >
                          <AlertTriangle className="size-3 mr-1" />
                          Acima do limite
                        </Badge>
                      )}
                    </div>

                    {/* Barras de Consumo */}
                    <div className="flex flex-col gap-3 p-3.5 bg-[var(--surface-muted)]/60 rounded-xl border border-[var(--border-subtle)] text-xs">
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-muted-foreground">Pessoas ativas:</span>
                          <strong className={cn("font-semibold", isMemberOver ? "text-rose-600" : "")}>
                            {org.membersCount} {memberLimit ? `/ ${memberLimit}` : "(Sem limite)"}
                          </strong>
                        </div>
                        {memberLimit && (
                          <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all",
                                isMemberOver ? "bg-rose-500" : "bg-[var(--brand-700)]"
                              )}
                              style={{ width: `${memberPct}%` }}
                            />
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-muted-foreground">Unidades ativas:</span>
                          <strong className={cn("font-semibold", isLocationOver ? "text-rose-600" : "")}>
                            {org.locationsCount} {locationLimit ? `/ ${locationLimit}` : "(Sem limite)"}
                          </strong>
                        </div>
                        {locationLimit && (
                          <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all",
                                isLocationOver ? "bg-rose-500" : "bg-[var(--brand-700)]"
                              )}
                              style={{ width: `${locationPct}%` }}
                            />
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[var(--border-subtle)] text-center">
                        <div>
                          <span className="text-[10px] text-muted-foreground block">Processos</span>
                          <strong className="text-xs font-bold text-[var(--text-primary)]">
                            {org.processesCount}
                          </strong>
                        </div>
                        <div>
                          <span className="text-[10px] text-muted-foreground block">Tarefas</span>
                          <strong className="text-xs font-bold text-[var(--text-primary)]">
                            {org.tasksCount}
                          </strong>
                        </div>
                        <div>
                          <span className="text-[10px] text-muted-foreground block">Execuções</span>
                          <strong className="text-xs font-bold text-[var(--text-primary)]">
                            {org.executionsCount}
                          </strong>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 mt-4 border-t border-[var(--border-subtle)]">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSubscriptionTarget(org)}
                      className="w-full h-8 text-xs font-semibold gap-1.5"
                    >
                      <Layers className="size-3.5" />
                      Ajustar cotas / plano
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* 5. VISÃO DE SUPORTE (support) */}
        {view === "support" && !!logs.length && (
          <div className="flex flex-col gap-3">
            {logs.map((log) => {
              const statusCfg = log.supportStatus ? supportLabels[log.supportStatus] : null;

              return (
                <Card
                  key={log.id}
                  className="rounded-2xl border border-border/70 bg-card p-4 sm:p-5 transition-all hover:border-border hover:shadow-xs"
                >
                  <div className="flex flex-col gap-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Link
                          href={href("support", log.organizationId)}
                          className="font-bold text-sm text-[var(--text-primary)] hover:underline flex items-center gap-1"
                        >
                          <Building2 className="size-3.5 text-[var(--brand-700)]" />
                          {log.orgName}
                        </Link>
                        {statusCfg && (
                          <Badge
                            variant="outline"
                            className={cn("text-[10px] font-semibold px-2 py-0.5", statusCfg.color)}
                          >
                            {statusCfg.label}
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="size-3" />
                        {formatDateTime(log.createdAt)} · {log.actorName}
                      </span>
                    </div>

                    {log.note && (
                      <p className="text-xs text-[var(--text-primary)] whitespace-pre-wrap bg-[var(--surface-muted)]/50 p-3 rounded-xl border border-[var(--border-subtle)]">
                        {log.note}
                      </p>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* 6. VISÃO DE AUDITORIA (audit) */}
        {view === "audit" && !!logs.length && (
          <div className="flex flex-col gap-3">
            {logs.map((log) => (
              <Card
                key={log.id}
                className="rounded-2xl border border-border/70 bg-card p-4 sm:p-5 transition-all hover:border-border hover:shadow-xs"
              >
                <div className="flex flex-col gap-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className="bg-[var(--brand-soft)]/60 text-[var(--brand-900)] border-[var(--brand-700)]/30 text-xs font-semibold"
                      >
                        <Activity className="size-3 mr-1" />
                        {actionLabels[log.action] ?? uiLabel(log.action)}
                      </Badge>
                      <Link
                        href={href("audit", log.organizationId)}
                        className="text-xs font-semibold text-muted-foreground hover:text-foreground hover:underline"
                      >
                        {log.orgName}
                      </Link>
                    </div>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="size-3" />
                      {formatDateTime(log.createdAt)} · {log.actorName}
                    </span>
                  </div>

                  {log.note && (
                    <div className="text-xs text-[var(--text-primary)] bg-[var(--surface-muted)]/50 p-3 rounded-xl border border-[var(--border-subtle)]">
                      <span className="font-semibold text-muted-foreground block mb-1">
                        Justificativa / Motivo:
                      </span>
                      <p className="whitespace-pre-wrap">{log.note}</p>
                    </div>
                  )}

                  <details className="text-[11px] text-muted-foreground cursor-pointer pt-1">
                    <summary className="hover:text-foreground">Detalhes técnicos do registro</summary>
                    <div className="p-2.5 mt-1.5 rounded-lg bg-[var(--surface-muted)] font-mono text-[10px] flex flex-col gap-1">
                      <div>
                        <strong>Ação:</strong> {log.action}
                      </div>
                      <div>
                        <strong>Recurso:</strong> {log.entityType} ({log.entityId})
                      </div>
                      <div>
                        <strong>Organização ID:</strong> {log.organizationId}
                      </div>
                    </div>
                  </details>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Paginação Padronizada */}
        {pagination.total > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-[var(--border-subtle)] text-xs text-muted-foreground">
            <p>
              Página {pagination.page} de {pagination.pages} · Mostrando{" "}
              {(pagination.page - 1) * pagination.pageSize + 1}–
              {Math.min(pagination.page * pagination.pageSize, pagination.total)} de{" "}
              {pagination.total} registros
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page <= 1}
                render={
                  pagination.page > 1 ? (
                    <Link
                      href={href(
                        view,
                        props.organizationFilter,
                        pagination.page - 1
                      )}
                    />
                  ) : undefined
                }
                className="h-8 text-xs font-semibold gap-1"
              >
                <ChevronLeft className="size-3.5" />
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page >= pagination.pages}
                render={
                  pagination.page < pagination.pages ? (
                    <Link
                      href={href(
                        view,
                        props.organizationFilter,
                        pagination.page + 1
                      )}
                    />
                  ) : undefined
                }
                className="h-8 text-xs font-semibold gap-1"
              >
                Próxima
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* MODAL 1: Suspender ou Reativar Acesso */}
      <Modal
        open={Boolean(statusTarget)}
        onClose={closeModals}
        title={`${statusTarget?.status === "ACTIVE" ? "Suspender" : "Reativar"} acesso`}
      >
        {statusTarget && (
          <form
            action={async (form) => {
              const nextStatus = statusTarget.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
              const reason = String(form.get("reason") ?? "");
              await handleRunAction(
                () =>
                  statusTarget.kind === "organization"
                    ? toggleOrganizationStatusAction(statusTarget.id, nextStatus, reason)
                    : updatePlatformUserStatusAction(statusTarget.id, nextStatus, reason),
                "Status de acesso atualizado com sucesso."
              );
            }}
            className="flex flex-col gap-4"
          >
            <div
              className={cn(
                "p-3 rounded-xl border text-xs",
                statusTarget.status === "ACTIVE"
                  ? "bg-rose-50 border-rose-200 text-rose-800"
                  : "bg-emerald-50 border-emerald-200 text-emerald-800"
              )}
            >
              <p>
                {statusTarget.status === "ACTIVE"
                  ? `Atenção: A suspensão impedirá imediatamente o acesso ${statusTarget.kind === "organization"
                    ? "de todas as pessoas e operações vinculadas à organização"
                    : "deste usuário na plataforma em todas as organizações"
                  }.`
                  : `A reativação restabelecerá o acesso ${statusTarget.kind === "organization"
                    ? "dos colaboradores à organização"
                    : "deste usuário na plataforma"
                  }.`}
              </p>
            </div>

            <div className="text-xs">
              Alvo da operação: <strong>{statusTarget.name}</strong>
            </div>

            <Field>
              <FieldLabel htmlFor="status-reason" className="text-xs font-semibold">
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
                    : "bg-[var(--brand-900)] hover:bg-[var(--brand-700)]"
                )}
              >
                {pending && <Spinner className="size-3 mr-1.5" />}
                {statusTarget.status === "ACTIVE" ? "Confirmar suspensão" : "Confirmar reativação"}
              </Button>
            </div>
          </form>
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
          <form
            key={subscriptionTarget.id}
            action={async (form) => {
              const amountNum =
                subAmount.trim() === "" ? null : Number(subAmount.replace(",", "."));
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
                      memberLimit: subMemberLimit.trim() === "" ? null : Number(subMemberLimit),
                      locationLimit: subLocationLimit.trim() === "" ? null : Number(subLocationLimit),
                      notes: subNotes.trim(),
                    },
                    String(form.get("reason") ?? "")
                  ),
                "Assinatura salva no histórico do cliente."
              );
            }}
            className="flex flex-col gap-4 text-xs"
          >
            <p className="text-muted-foreground">
              Condições contratuais de <strong>{subscriptionTarget.name}</strong>. O controle
              financeiro e cobrança são manuais.
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
                Selecione um plano pronto para preencher os valores, ciclo e limites abaixo automaticamente. Você pode customizá-los livremente antes de salvar.
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
                    {plan.amountCents != null ? formatCurrency(plan.amountCents) : "R$ 0,00"} (
                    {cycleLabels[plan.cycle as keyof typeof cycleLabels] ?? plan.cycle})
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="plan-name" className="text-xs font-semibold">
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
                <FieldLabel htmlFor="subscription-status" className="text-xs font-semibold">
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
                  {Object.entries(subscriptionStatusLabels).map(([value, label]) => (
                    <NativeSelectOption key={value} value={value}>
                      {label}
                    </NativeSelectOption>
                  ))}
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
                  <NativeSelectOption value="MONTHLY">Mensal</NativeSelectOption>
                  <NativeSelectOption value="YEARLY">Anual</NativeSelectOption>
                  <NativeSelectOption value="CUSTOM">Personalizada</NativeSelectOption>
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
                <FieldLabel htmlFor="starts-on" className="text-xs font-semibold">
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
                <FieldLabel htmlFor="member-limit" className="text-xs font-semibold">
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
                <FieldLabel htmlFor="location-limit" className="text-xs font-semibold">
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
              <FieldLabel htmlFor="subscription-notes" className="text-xs font-semibold">
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
              <FieldLabel htmlFor="subscription-reason" className="text-xs font-semibold">
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
                {pending && <Spinner className="size-3 mr-1.5" />}
                Salvar assinatura
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={createPlanOpen}
        onClose={closeModals}
        title="Criar novo modelo de plano pronto"
        className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"
      >
        <form
          action={async (form) => {
            const amountVal = String(form.get("amount") ?? "").trim();
            const amountNum = amountVal === "" ? null : Number(amountVal.replace(",", "."));
            const memberLim = nullableNumber(form, "memberLimit");
            const locationLim = nullableNumber(form, "locationLimit");

            await handleRunAction(
              () =>
                createPlatformPlanAction({
                  name: String(form.get("name") ?? "").trim(),
                  description: String(form.get("description") ?? "").trim() || null,
                  cycle: (form.get("cycle") ?? "MONTHLY") as "MONTHLY" | "YEARLY" | "CUSTOM",
                  amountCents:
                    amountNum === null || Number.isNaN(amountNum)
                      ? null
                      : Math.round(amountNum * 100),
                  memberLimit: memberLim,
                  locationLimit: locationLim,
                  features: String(form.get("features") ?? "").trim() || null,
                  status: (form.get("status") ?? "ACTIVE") as "ACTIVE" | "ARCHIVED",
                }),
              "Plano pronto criado com sucesso!"
            );
          }}
          className="flex flex-col gap-4 text-xs"
        >
          <p className="text-muted-foreground">
            Defina os parâmetros do plano modelo. Ao registrar ou alterar a assinatura de qualquer empresa, você poderá carregar este plano pré-configurado.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="plan-create-name" className="text-xs font-semibold">
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
              <FieldLabel htmlFor="plan-create-cycle" className="text-xs font-semibold">
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
                <NativeSelectOption value="CUSTOM">Personalizada</NativeSelectOption>
              </NativeSelect>
            </Field>

            <Field>
              <FieldLabel htmlFor="plan-create-amount" className="text-xs font-semibold">
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
              <FieldLabel htmlFor="plan-create-member-limit" className="text-xs font-semibold">
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
              <FieldLabel htmlFor="plan-create-location-limit" className="text-xs font-semibold">
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
              <FieldLabel htmlFor="plan-create-status" className="text-xs font-semibold">
                Situação no catálogo
              </FieldLabel>
              <NativeSelect
                id="plan-create-status"
                name="status"
                defaultValue="ACTIVE"
                disabled={pending}
                className="w-full text-xs h-11"
              >
                <NativeSelectOption value="ACTIVE">Ativo (sugerido para novas assinaturas)</NativeSelectOption>
                <NativeSelectOption value="ARCHIVED">Arquivado (não sugerido para novos clientes)</NativeSelectOption>
              </NativeSelect>
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor="plan-create-desc" className="text-xs font-semibold">
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
            <FieldLabel htmlFor="plan-create-features" className="text-xs font-semibold">
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
              {pending && <Spinner className="size-3 mr-1.5" />}
              Criar modelo de plano
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL: Editar Plano Pronto */}
      <Modal
        open={Boolean(editPlanTarget)}
        onClose={closeModals}
        title={`Editar plano pronto: ${editPlanTarget?.name}`}
        className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"
      >
        {editPlanTarget && (
          <form
            key={editPlanTarget.id}
            action={async (form) => {
              const amountVal = String(form.get("amount") ?? "").trim();
              const amountNum = amountVal === "" ? null : Number(amountVal.replace(",", "."));
              const memberLim = nullableNumber(form, "memberLimit");
              const locationLim = nullableNumber(form, "locationLimit");

              await handleRunAction(
                () =>
                  updatePlatformPlanAction(editPlanTarget.id, {
                    name: String(form.get("name") ?? "").trim(),
                    description: String(form.get("description") ?? "").trim() || null,
                    cycle: (form.get("cycle") ?? "MONTHLY") as "MONTHLY" | "YEARLY" | "CUSTOM",
                    amountCents:
                      amountNum === null || Number.isNaN(amountNum)
                        ? null
                        : Math.round(amountNum * 100),
                    memberLimit: memberLim,
                    locationLimit: locationLim,
                    features: String(form.get("features") ?? "").trim() || null,
                    status: (form.get("status") ?? "ACTIVE") as "ACTIVE" | "ARCHIVED",
                  }),
                "Plano pronto atualizado com sucesso!"
              );
            }}
            className="flex flex-col gap-4 text-xs"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="plan-edit-name" className="text-xs font-semibold">
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
                <FieldLabel htmlFor="plan-edit-cycle" className="text-xs font-semibold">
                  Periodicidade padrão *
                </FieldLabel>
                <NativeSelect
                  id="plan-edit-cycle"
                  name="cycle"
                  defaultValue={editPlanTarget.cycle}
                  disabled={pending}
                  className="w-full text-xs h-11"
                >
                  <NativeSelectOption value="MONTHLY">Mensal</NativeSelectOption>
                  <NativeSelectOption value="YEARLY">Anual</NativeSelectOption>
                  <NativeSelectOption value="CUSTOM">Personalizada</NativeSelectOption>
                </NativeSelect>
              </Field>

              <Field>
                <FieldLabel htmlFor="plan-edit-amount" className="text-xs font-semibold">
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
                <FieldLabel htmlFor="plan-edit-member-limit" className="text-xs font-semibold">
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
                <FieldLabel htmlFor="plan-edit-location-limit" className="text-xs font-semibold">
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
                <FieldLabel htmlFor="plan-edit-status" className="text-xs font-semibold">
                  Situação no catálogo
                </FieldLabel>
                <NativeSelect
                  id="plan-edit-status"
                  name="status"
                  defaultValue={editPlanTarget.status}
                  disabled={pending}
                  className="w-full text-xs h-11"
                >
                  <NativeSelectOption value="ACTIVE">Ativo (sugerido para novas assinaturas)</NativeSelectOption>
                  <NativeSelectOption value="ARCHIVED">Arquivado (não sugerido)</NativeSelectOption>
                </NativeSelect>
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="plan-edit-desc" className="text-xs font-semibold">
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
              <FieldLabel htmlFor="plan-edit-features" className="text-xs font-semibold">
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
                {pending && <Spinner className="size-3 mr-1.5" />}
                Salvar alterações
              </Button>
            </div>
          </form>
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
          <form
            action={async () => {
              await handleRunAction(
                () => deletePlatformPlanAction(deletePlanTarget.id),
                `Plano "${deletePlanTarget.name}" excluído do catálogo.`
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
                Você está prestes a excluir o modelo <strong>{deletePlanTarget.name}</strong>. Empresas que já contratualizaram este plano continuarão com suas condições preservadas, mas o modelo não estará mais disponível para novas assinaturas.
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
                {pending && <Spinner className="size-3 mr-1.5" />}
                Confirmar exclusão
              </Button>
            </div>
          </form>
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
          <form
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
                    "locationsCount" in org ? (org as GlobalOrg).locationsCount : 0,
                  processesCount:
                    "processesCount" in org ? (org as GlobalOrg).processesCount : 0,
                  tasksCount:
                    "tasksCount" in org ? (org as GlobalOrg).tasksCount : 0,
                  executionsCount:
                    "executionsCount" in org ? (org as GlobalOrg).executionsCount : 0,
                  subscription:
                    "subscription" in org ? (org as GlobalOrg).subscription : null,
                };
                setApplyPlanTarget(null);
                openSubscriptionModal(fullOrg, applyPlanTarget);
              }
            }}
            className="flex flex-col gap-4 text-xs"
          >
            <p className="text-muted-foreground">
              Selecione a empresa que receberá o plano <strong>{applyPlanTarget.name}</strong> (
              {applyPlanTarget.amountCents != null
                ? formatCurrency(applyPlanTarget.amountCents)
                : "R$ 0,00"}
              /
              {cycleLabels[applyPlanTarget.cycle as keyof typeof cycleLabels]?.toLowerCase() ??
                applyPlanTarget.cycle.toLowerCase()}
              ).
            </p>

            <Field>
              <FieldLabel htmlFor="apply-plan-org" className="text-xs font-semibold">
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
          </form>
        )}
      </Modal>

      {/* MODAL 3: Registrar Atendimento de Suporte */}
      <Modal
        open={Boolean(supportOrgTarget)}
        onClose={closeModals}
        title="Registrar atendimento de suporte"
      >
        {supportOrgTarget && (
          <form
            action={async (form) => {
              const status = String(form.get("status") ?? "OPEN");
              const note = String(form.get("note") ?? "");
              await handleRunAction(
                () => addSupportNoteAction(supportOrgTarget.id, status, note),
                "Atendimento registrado com sucesso no histórico do cliente."
              );
            }}
            className="flex flex-col gap-4 text-xs"
          >
            <p className="text-muted-foreground">
              Cliente: <strong>{supportOrgTarget.name}</strong>. O registro ficará disponível para a
              equipe da plataforma.
            </p>

            <Field>
              <FieldLabel htmlFor="support-status" className="text-xs font-semibold">
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
              <FieldLabel htmlFor="support-note" className="text-xs font-semibold">
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
                {pending && <Spinner className="size-3 mr-1.5" />}
                Registrar atendimento
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* MODAL 4: Criar Nova Organização */}
      <Modal
        open={createOrgOpen}
        onClose={closeModals}
        title="Nova organização"
        className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"
      >
        <form
          action={async (form) => {
            const name = String(form.get("name") ?? "").trim();
            const slug = String(form.get("slug") ?? "").trim();
            const createDefaultLocation = form.get("createDefaultLocation") === "on";

            await handleRunAction(
              () =>
                createOrganizationAction({
                  name,
                  slug,
                  createDefaultLocation,
                }),
              "Organização criada com sucesso."
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
                Gera imediatamente uma unidade operacional ativa no fuso de São Paulo.
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
              {pending && <Spinner className="size-3 mr-1.5" />}
              Criar organização
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL 5: Editar Organização */}
      <Modal
        open={Boolean(editOrgTarget)}
        onClose={closeModals}
        title={`Editar organização: ${editOrgTarget?.name}`}
        className="sm:max-w-lg"
      >
        {editOrgTarget && (
          <form
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
                "Organização atualizada com sucesso."
              );
            }}
            className="flex flex-col gap-4 text-xs"
          >
            <Field>
              <FieldLabel htmlFor="edit-org-name" className="text-xs font-semibold">
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
              <FieldLabel htmlFor="edit-org-slug" className="text-xs font-semibold">
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
                Cuidado: alterar o identificador afetará links diretos de acesso desta organização.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="edit-org-status" className="text-xs font-semibold">
                Status de operação *
              </FieldLabel>
              <NativeSelect
                id="edit-org-status"
                name="status"
                defaultValue={editOrgTarget.status}
                disabled={pending}
                className="w-full text-xs h-9"
              >
                <NativeSelectOption value="ACTIVE">Ativa (Operação normal)</NativeSelectOption>
                <NativeSelectOption value="SUSPENDED">Suspensa (Bloqueio total de acesso)</NativeSelectOption>
              </NativeSelect>
            </Field>

            <Field>
              <FieldLabel htmlFor="edit-org-reason" className="text-xs font-semibold">
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
                {pending && <Spinner className="size-3 mr-1.5" />}
                Salvar alterações
              </Button>
            </div>
          </form>
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
          <form
            key={deleteOrgTarget.id}
            action={async (form) => {
              const confirmationSlug = String(form.get("confirmationSlug") ?? "").trim();
              const reason = String(form.get("reason") ?? "").trim();

              await handleRunAction(
                () =>
                  deleteOrganizationAction({
                    organizationId: deleteOrgTarget.id,
                    confirmationSlug,
                    reason,
                  }),
                "Organização e registros vinculados excluídos com sucesso."
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
                A exclusão da organização <strong>{deleteOrgTarget.name}</strong> removerá permanentemente
                todas as unidades, tarefas, processos operacionais, execuções e desvinculará
                todos os membros.
              </p>
            </div>

            <Field>
              <FieldLabel htmlFor="delete-org-confirmation" className="text-xs font-semibold">
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
              <FieldLabel htmlFor="delete-org-reason" className="text-xs font-semibold">
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
                {pending && <Spinner className="size-3 mr-1.5" />}
                Confirmar exclusão definitiva
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* MODAL 7: Criar Novo Usuário */}
      <Modal
        open={createUserOpen}
        onClose={closeModals}
        title="Novo usuário da plataforma"
        className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"
      >
        <form
          action={async (form) => {
            const name = String(form.get("name") ?? "").trim();
            const email = String(form.get("email") ?? "").trim();
            const password = String(form.get("password") ?? "");
            const platformRole = (form.get("platformRole") ?? "USER") as "USER" | "SUPERADMIN";
            const organizationId = String(form.get("organizationId") ?? "").trim();
            const role = (form.get("role") || undefined) as "OWNER" | "ADMIN" | "MANAGER" | "EMPLOYEE" | undefined;
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
              "Usuário cadastrado com sucesso."
            );
          }}
          className="flex flex-col gap-4 text-xs"
        >
          <p className="text-muted-foreground">
            Cadastre um novo usuário para acesso à plataforma Marcai ou ao painel administrativo.
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
              <FieldLabel htmlFor="user-email" className="text-xs font-semibold">
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
              <FieldLabel htmlFor="user-password" className="text-xs font-semibold">
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
              <FieldLabel htmlFor="user-platform-role" className="text-xs font-semibold">
                Perfil de acesso global *
              </FieldLabel>
              <NativeSelect
                id="user-platform-role"
                name="platformRole"
                defaultValue="USER"
                disabled={pending}
                className="w-full text-xs h-9"
              >
                <NativeSelectOption value="USER">Usuário Comum (Empresarial)</NativeSelectOption>
                <NativeSelectOption value="SUPERADMIN">Superadmin (Gestor da Plataforma)</NativeSelectOption>
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
                <FieldLabel htmlFor="user-org-select" className="text-xs font-semibold">
                  Organização
                </FieldLabel>
                <NativeSelect
                  id="user-org-select"
                  name="organizationId"
                  defaultValue=""
                  disabled={pending}
                  className="w-full text-xs h-9"
                >
                  <NativeSelectOption value="">Nenhuma (Vincular depois)</NativeSelectOption>
                  {props.allOrganizations?.map((o) => (
                    <NativeSelectOption key={o.id} value={o.id}>
                      {o.name} ({o.slug})
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>

              <Field>
                <FieldLabel htmlFor="user-org-role" className="text-xs font-semibold">
                  Papel na organização
                </FieldLabel>
                <NativeSelect
                  id="user-org-role"
                  name="role"
                  defaultValue="EMPLOYEE"
                  disabled={pending}
                  className="w-full text-xs h-9"
                >
                  <NativeSelectOption value="EMPLOYEE">Colaborador / Operador</NativeSelectOption>
                  <NativeSelectOption value="MANAGER">Gestor de Equipe</NativeSelectOption>
                  <NativeSelectOption value="ADMIN">Administrador</NativeSelectOption>
                  <NativeSelectOption value="OWNER">Proprietário (Owner)</NativeSelectOption>
                </NativeSelect>
              </Field>

              <Field>
                <FieldLabel htmlFor="user-employee-code" className="text-xs font-semibold">
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
                <FieldLabel htmlFor="user-pin" className="text-xs font-semibold">
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
              {pending && <Spinner className="size-3 mr-1.5" />}
              Criar usuário
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL 8: Editar Usuário */}
      <Modal
        open={Boolean(editUserTarget)}
        onClose={closeModals}
        title={`Editar usuário: ${editUserTarget?.name}`}
        className="sm:max-w-lg"
      >
        {editUserTarget && (
          <form
            key={editUserTarget.id}
            action={async (form) => {
              const name = String(form.get("name") ?? "").trim();
              const email = String(form.get("email") ?? "").trim();
              const platformRole = (form.get("platformRole") ?? "USER") as "USER" | "SUPERADMIN";
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
                "Usuário atualizado com sucesso."
              );
            }}
            className="flex flex-col gap-4 text-xs"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="edit-user-name" className="text-xs font-semibold">
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
                <FieldLabel htmlFor="edit-user-email" className="text-xs font-semibold">
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
                <FieldLabel htmlFor="edit-user-platform-role" className="text-xs font-semibold">
                  Papel na plataforma *
                </FieldLabel>
                <NativeSelect
                  id="edit-user-platform-role"
                  name="platformRole"
                  defaultValue={editUserTarget.platformRole === "SUPERADMIN" ? "SUPERADMIN" : "USER"}
                  disabled={pending}
                  className="w-full text-xs h-9"
                >
                  <NativeSelectOption value="USER">Usuário Comum</NativeSelectOption>
                  <NativeSelectOption value="SUPERADMIN">Superadmin</NativeSelectOption>
                </NativeSelect>
              </Field>

              <Field>
                <FieldLabel htmlFor="edit-user-status" className="text-xs font-semibold">
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
                  <NativeSelectOption value="SUSPENDED">Suspenso</NativeSelectOption>
                </NativeSelect>
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="edit-user-new-password" className="text-xs font-semibold">
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
                {pending && <Spinner className="size-3 mr-1.5" />}
                Salvar alterações
              </Button>
            </div>
          </form>
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
          <form
            key={deleteUserTarget.id}
            action={async (form) => {
              const confirmationEmail = String(form.get("confirmationEmail") ?? "").trim();
              const reason = String(form.get("reason") ?? "").trim();

              await handleRunAction(
                () =>
                  deletePlatformUserAction({
                    userId: deleteUserTarget.id,
                    confirmationEmail,
                    reason,
                  }),
                "Conta de usuário excluída com sucesso."
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
                A exclusão da conta de <strong>{deleteUserTarget.name}</strong> revogará todos os acessos
                e desvinculará a pessoa de todas as organizações ({deleteUserTarget.memberships.length} organizações vinculadas).
              </p>
            </div>

            <Field>
              <FieldLabel htmlFor="delete-user-confirmation" className="text-xs font-semibold">
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
              <FieldLabel htmlFor="delete-user-reason" className="text-xs font-semibold">
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
                {pending && <Spinner className="size-3 mr-1.5" />}
                Confirmar exclusão
              </Button>
            </div>
          </form>
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
                Organizações vinculadas atualmente ({manageMembershipsTarget.memberships.length})
              </h3>

              {manageMembershipsTarget.memberships.length === 0 ? (
                <p className="text-muted-foreground italic p-3 rounded-xl bg-muted/30 border border-border/50">
                  Este usuário ainda não possui nenhum vínculo ativo com organizações.
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
                          Papel atual: <Badge variant="outline" className="text-[10px] ml-1">{uiLabel(m.role)}</Badge>
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {/* Formulário rápido de alteração de papel */}
                        <form
                          action={async (form) => {
                            const newRole = form.get("newRole") as "OWNER" | "ADMIN" | "MANAGER" | "EMPLOYEE";
                            const reason = prompt("Informe o motivo da alteração de cargo (mínimo 5 caracteres):");
                            if (!reason || reason.trim().length < 5) {
                              if (reason !== null) {
                                toast.add({
                                  title: "Operação cancelada",
                                  description: "O motivo é obrigatório para auditoria (mínimo 5 caracteres).",
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
                              "Papel atualizado com sucesso."
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
                            <NativeSelectOption value="EMPLOYEE">Colaborador</NativeSelectOption>
                            <NativeSelectOption value="MANAGER">Gestor</NativeSelectOption>
                            <NativeSelectOption value="ADMIN">Administrador</NativeSelectOption>
                            <NativeSelectOption value="OWNER">Proprietário</NativeSelectOption>
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
                        </form>

                        {/* Botão de desvincular */}
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={pending}
                          onClick={async () => {
                            const reason = prompt(
                              `Confirma desvincular ${manageMembershipsTarget.name} da organização ${m.organizationName}?\nInforme o motivo:`
                            );
                            if (!reason || reason.trim().length < 5) {
                              if (reason !== null) {
                                toast.add({
                                  title: "Operação cancelada",
                                  description: "O motivo é obrigatório para auditoria (mínimo 5 caracteres).",
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
                              "Membro desvinculado com sucesso."
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
            <form
              action={async (form) => {
                const organizationId = String(form.get("organizationId") ?? "").trim();
                const role = form.get("role") as "OWNER" | "ADMIN" | "MANAGER" | "EMPLOYEE";
                const employeeCode = String(form.get("employeeCode") ?? "").trim();
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
                  "Usuário vinculado à organização com sucesso."
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
                  <FieldLabel htmlFor="link-org-select" className="text-xs font-semibold">
                    Organização *
                  </FieldLabel>
                  <NativeSelect
                    id="link-org-select"
                    name="organizationId"
                    required
                    disabled={pending}
                    className="w-full text-xs h-9"
                  >
                    <NativeSelectOption value="">Selecione uma organização...</NativeSelectOption>
                    {props.allOrganizations
                      ?.filter(
                        (o) =>
                          !manageMembershipsTarget.memberships.some(
                            (m) => m.organizationId === o.id
                          )
                      )
                      .map((o) => (
                        <NativeSelectOption key={o.id} value={o.id}>
                          {o.name} ({o.slug})
                        </NativeSelectOption>
                      ))}
                  </NativeSelect>
                </Field>

                <Field>
                  <FieldLabel htmlFor="link-org-role" className="text-xs font-semibold">
                    Papel *
                  </FieldLabel>
                  <NativeSelect
                    id="link-org-role"
                    name="role"
                    defaultValue="EMPLOYEE"
                    disabled={pending}
                    className="w-full text-xs h-9"
                  >
                    <NativeSelectOption value="EMPLOYEE">Colaborador</NativeSelectOption>
                    <NativeSelectOption value="MANAGER">Gestor</NativeSelectOption>
                    <NativeSelectOption value="ADMIN">Administrador</NativeSelectOption>
                    <NativeSelectOption value="OWNER">Proprietário</NativeSelectOption>
                  </NativeSelect>
                </Field>

                <Field>
                  <FieldLabel htmlFor="link-employee-code" className="text-xs font-semibold">
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
                  <FieldLabel htmlFor="link-pin" className="text-xs font-semibold">
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
                <FieldLabel htmlFor="link-reason" className="text-xs font-semibold">
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
                  {pending && <Spinner className="size-3 mr-1.5" />}
                  Adicionar vínculo
                </Button>
              </div>
            </form>

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
  );
}
