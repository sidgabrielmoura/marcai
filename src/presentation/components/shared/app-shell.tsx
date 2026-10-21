"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CheckSquare,
  GitMerge,
  Archive,
  CalendarClock,
  PlayCircle,
  Users,
  MapPin,
  FileBarChart,
  Settings,
  Bell,
  UserRound,
  History,
  LogOut,
  Search,
  ChevronDown,
  ArrowUpRight,
  Plus,
  Menu,
  ShieldCheck,
  Building2,
  Activity,
  Workflow, Layers,
  ClipboardCheck,
  type LucideIcon,
} from "lucide-react";
import { logoutAction } from "@/presentation/actions/auth-actions";
import { searchWorkspaceAction, type SearchResult } from "@/presentation/actions/search-actions";
import { useRealtimeEvents } from "@/presentation/hooks/use-realtime-events";
import { toast } from "@/components/ui/toast";
import { getCurrentUserSummaryAction } from "@/presentation/actions/notification-actions";
import { SubscriptionExpirationCard } from "./subscription-expiration-card";
import type { SubscriptionNotice } from "@/application/superadmin/manual-subscription";
import { Brand } from "./brand";
import { OrganizationSwitcher } from "./organization-switcher";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { PlatformButton, PlatformForm, usePlatformActivityContext } from "../superadmin/platform-async";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";

type NavItem = { label: string; href: string; icon: LucideIcon; group: string };
const managementNav: NavItem[] = [
  {
    label: "Visão geral",
    href: "/overview",
    icon: LayoutDashboard,
    group: "Principal",
  },
  {
    label: "Tarefas avulsas",
    href: "/management/tasks",
    icon: CheckSquare,
    group: "Operação",
  },
  {
    label: "Processos",
    href: "/management/processes",
    icon: GitMerge,
    group: "Operação",
  },
  {
    label: "Aprovações",
    href: "/management/approvals",
    icon: ClipboardCheck,
    group: "Operação",
  },
  { label: "Templates", href: "/management/templates", icon: Layers, group: "Operação" },
  {
    label: "Execuções",
    href: "/management/executions",
    icon: History,
    group: "Operação",
  },
  {
    label: "Arquivados",
    href: "/management/archived",
    icon: Archive,
    group: "Operação",
  },
  {
    label: "Pessoas",
    href: "/management/people",
    icon: UserRound,
    group: "Organização",
  },
  {
    label: "Equipes",
    href: "/management/teams",
    icon: Users,
    group: "Organização",
  },
  {
    label: "Unidades",
    href: "/management/locations",
    icon: MapPin,
    group: "Organização",
  },
  {
    label: "Configurações",
    href: "/management/settings",
    icon: Settings,
    group: "Configurações",
  },
];
const employeeNav: NavItem[] = [
  {
    label: "Minhas tarefas",
    href: "/tasks",
    icon: CheckSquare,
    group: "Meu trabalho",
  },
  {
    label: "Histórico",
    href: "/history",
    icon: History,
    group: "Meu trabalho",
  },
  {
    label: "Avisos",
    href: "/notifications",
    icon: Bell,
    group: "Meu trabalho",
  },
  { label: "Minha conta", href: "/account", icon: UserRound, group: "Geral" },
];
const platformNav: NavItem[] = [
  {
    label: "Visão geral",
    href: "/superadmin",
    icon: LayoutDashboard,
    group: "Plataforma",
  },
  {
    label: "Organizações",
    href: "/superadmin?view=organizations",
    icon: Building2,
    group: "Plataforma",
  },
  {
    label: "Usuários",
    href: "/superadmin?view=users",
    icon: Users,
    group: "Plataforma",
  },
  {
    label: "Assinaturas",
    href: "/superadmin?view=subscriptions",
    icon: CalendarClock,
    group: "Plataforma",
  },
  {
    label: "Templates",
    href: "/superadmin?view=templates",
    icon: Layers,
    group: "Plataforma",
  },
  {
    label: "Mapa",
    href: "/superadmin?view=map",
    icon: MapPin,
    group: "Plataforma",
  },
  {
    label: "Uso",
    href: "/superadmin?view=usage",
    icon: FileBarChart,
    group: "Plataforma",
  },
  {
    label: "Suporte",
    href: "/superadmin?view=support",
    icon: UserRound,
    group: "Plataforma",
  },
  {
    label: "Auditoria",
    href: "/superadmin?view=audit",
    icon: Activity,
    group: "Plataforma",
  },
];
const roles: Record<string, string> = {
  OWNER: "Proprietário",
  ADMIN: "Administrador",
  MANAGER: "Gestor",
  EMPLOYEE: "Colaborador",
  SUPERADMIN: "Superadministrador",
};

export function AppShell({
  children,
  userName,
  orgName,
  role = "EMPLOYEE",
  mode = "management",
  activeView = "overview",
  userId,
  initialSubscriptionNotice,
}: {
  children: ReactNode;
  userName: string;
  orgName: string;
  role?: string;
  mode?: "management" | "employee" | "platform";
  activeView?: string;
  userId?: string;
  initialSubscriptionNotice?: SubscriptionNotice | null;
}) {
  const pathname = usePathname();
  const platformActivity = usePlatformActivityContext();
  const ShellForm = mode === "platform" ? PlatformForm : "form";
  const ShellButton = mode === "platform" ? PlatformButton : Button;
  const shellFormOptions = mode === "platform" ? { standalone: true } : {};
  function navigateShell(href: string) {
    if (mode === "platform" && platformActivity) {
      if (platformActivity.locked()) return;
      setSearchOpen(false);
      platformActivity.navigate(href);
    } else {
      setSearchOpen(false);
      window.location.href = href;
    }
  }
  const mobileNavigationRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (mode !== "platform") return;
    const navigation = mobileNavigationRef.current;
    const active = navigation?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!navigation || !active) return;
    let mounted = true;
    const centerActive = () => {
      if (!mounted || !navigation.clientWidth) return;
      const bounds = active.getBoundingClientRect();
      const containerBounds = navigation.getBoundingClientRect();
      const left = navigation.scrollLeft + bounds.left - containerBounds.left - (navigation.clientWidth - bounds.width) / 2;
      navigation.scrollTo({ left: Math.max(0, left), behavior: "instant" });
    };
    const observer = new ResizeObserver(centerActive);
    observer.observe(navigation);
    void document.fonts.ready.then(centerActive);
    centerActive();
    return () => { mounted = false; observer.disconnect(); };
  }, [activeView, mode]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [currentUserId, setCurrentUserId] = useState<string | undefined>(userId);
  const [subscriptionNotice, setSubscriptionNotice] = useState<SubscriptionNotice | null | undefined>(
    initialSubscriptionNotice
  );
  const [searchOpen, setSearchOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState("");

  const isOperacaoActive = [
    "/management/tasks",
    "/management/approvals",
    "/management/executions",
    "/management/processes",
    "/management/archived",
    "/management/templates",
  ].some((path) => pathname === path || pathname.startsWith(`${path}/`));

  const isOrganizacaoActive = [
    "/management/people",
    "/management/teams",
    "/management/locations",
  ].some((path) => pathname === path || pathname.startsWith(`${path}/`));

  const [operacaoOpen, setOperacaoOpen] = useState(false);
  const [organizacaoOpen, setOrganizacaoOpen] = useState(false);

  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);

  useEffect(() => {
    if (mode === "platform") return;
    let active = true;
    getCurrentUserSummaryAction()
      .then((summary) => {
        if (active && summary) {
          setUnreadCount(summary.unreadCount);
          if ((summary as any).pendingApprovalsCount !== undefined) {
            setPendingApprovalsCount((summary as any).pendingApprovalsCount);
          }
          if (summary.userId) setCurrentUserId(summary.userId);
          if (summary.subscriptionNotice !== undefined) {
            setSubscriptionNotice(summary.subscriptionNotice);
          }
        }
      })
      .catch(() => { });
    return () => {
      active = false;
    };
  }, [pathname, mode]);

  useRealtimeEvents((eventType, payload) => {
    if (eventType === "NOTIFICATION_CREATED" && payload) {
      const targetUserId = payload.userId;
      if (!currentUserId || !targetUserId || targetUserId === currentUserId) {
        setUnreadCount((c) => c + 1);
        const typeMap: Record<string, string> = {
          TASK_ASSIGNED: "info",
          APPROVAL_REQUESTED: "warning",
          TASK_CORRECTION_REQUESTED: "error",
          TASK_EXPIRING_SOON: "warning",
          TASK_OVERDUE: "error",
          PAUSE_ALERT: "warning",
          OPERATIONAL_ALERT: "error",
        };
        const toastType =
          typeMap[payload.type] ||
          (payload.priority === "HIGH" || payload.priority === "CRITICAL"
            ? "warning"
            : "info");
        try {
          toast.add({
            title: payload.title || "Nova notificação",
            description: payload.message || "",
            type: toastType,
          });
        } catch {
          // ignore
        }
      }
    }
  }, mode !== "platform");

  useEffect(() => {
    let current = true;
    setSearchResults([]);
    setSearchError("");
    if (query.trim().length < 2) { setSearchBusy(false); return; }
    setSearchBusy(true);
    const timer = setTimeout(async () => {
      try {
        const results = await searchWorkspaceAction(query);
        if (current) setSearchResults(results);
      } catch { if (current) setSearchError("Não foi possível buscar. Tente novamente."); }
      finally { if (current) setSearchBusy(false); }
    }, 300);
    return () => { current = false; clearTimeout(timer); };
  }, [query]);
  const items =
    mode === "platform"
      ? platformNav
      : mode === "employee"
        ? employeeNav
        : managementNav;
  const home =
    mode === "platform"
      ? "/superadmin"
      : mode === "employee"
        ? "/tasks"
        : "/overview";
  const initials = userName
    .replace(/\(.*?\)/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((n) => n[0])
    .join("");
  const displayName = userName.replace(/\s*\(.*?\)/g, "");
  const account = mode === "management" ? "/management/more" : "/account";
  const isActive = (item: NavItem) =>
    mode === "platform"
      ? item.href.includes("view=")
        ? item.href.endsWith(`view=${activeView}`)
        : activeView === "overview"
      : pathname === item.href || pathname.startsWith(`${item.href}/`);

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);

  const renderNav = (item: NavItem) => {
    const isNotification = item.href === "/notifications";
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setSearchOpen(false)}
        className={`sidebar-link ${isActive(item) ? "is-active" : ""}`}
        aria-current={isActive(item) ? "page" : undefined}
      >
        <item.icon size={18} strokeWidth={1.7} />
        <span>{item.label}</span>
        {isNotification && unreadCount > 0 && (
          <span className="sidebar-badge" aria-label={`${unreadCount} avisos não lidos`}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </Link>
    );
  };

  const renderSubNav = (item: NavItem) => {
    const isApprovals = item.href === "/management/approvals";
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setSearchOpen(false)}
        className={`sidebar-link min-h-9.5! py-2! pl-7! text-(length:--type-label) flex items-center justify-between ${isActive(item) ? "is-active" : ""
          }`}
        aria-current={isActive(item) ? "page" : undefined}
      >
        <span className="flex items-center gap-2">
          <item.icon size={16} strokeWidth={1.7} />
          <span>{item.label}</span>
        </span>
        {isApprovals && pendingApprovalsCount > 0 && (
          <span
            className="ml-auto px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-white"
            title={`${pendingApprovalsCount} aprovações pendentes`}
          >
            {pendingApprovalsCount > 99 ? "99+" : pendingApprovalsCount}
          </span>
        )}
      </Link>
    );
  };
  const moreActive =
    ["/notifications", "/account"].includes(pathname) ||
    (pathname.startsWith("/management/") &&
      ![
        "/management/tasks",
        "/management/processes",
        "/management/archived",
      ].some((path) => pathname.startsWith(path)));

  return (
    <div className={`app-frame app-frame--${mode}`}>
      <a href="#main-content" className="skip-link">
        Pular para o conteúdo
      </a>
      <aside className="app-sidebar gap-0! p-3!">
        <Link
          href={home}
          className="sidebar-brand"
          aria-label="Tarefaí, página inicial"
        >
          <Brand />
        </Link>

        {mode === "management" ? (
          <nav
            aria-label="Navegação principal"
            className="flex-1 flex flex-col min-h-0 space-y-2"
          >
            {/* Visão Geral */}
            <div className="space-y-1">
              {renderNav({
                label: "Visão geral",
                href: "/overview",
                icon: LayoutDashboard,
                group: "Principal",
              })}
            </div>

            {/* Módulo Operação */}
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => setOperacaoOpen((prev) => !prev)}
                className={`flex items-center justify-between w-full px-3 py-2 rounded-[9px] text-[length:var(--type-label)] font-semibold transition-all cursor-pointer select-none group ${!operacaoOpen && isOperacaoActive
                  ? "bg-[#e8efe9] text-[#164d36]"
                  : "text-[var(--text-secondary)] hover:text-[#164d36] hover:bg-[#eaf0eb]"
                  }`}
                aria-expanded={operacaoOpen}
                aria-label="Alternar módulo de Operação"
              >
                <span className="flex items-center gap-2.5">
                  <Workflow
                    size={17}
                    strokeWidth={1.8}
                    className={`shrink-0 transition-colors ${!operacaoOpen && isOperacaoActive
                      ? "text-[#164d36]"
                      : "text-[var(--brand-700)] group-hover:text-[#164d36]"
                      }`}
                  />
                  <span className="tracking-tight">Operação</span>
                </span>
                <div className="flex items-center gap-1.5">
                  {!operacaoOpen && isOperacaoActive && (
                    <span
                      className="size-1.5 rounded-full bg-[#247b56]"
                      title="Página ativa nesta seção"
                    />
                  )}
                  <ChevronDown
                    size={15}
                    strokeWidth={2}
                    className={`shrink-0 transition-transform duration-200 text-[var(--text-secondary)] group-hover:text-[#164d36] ${!operacaoOpen ? "-rotate-90" : ""
                      }`}
                  />
                </div>
              </button>

              <div
                className={`overflow-hidden transition-all duration-200 ease-in-out ${operacaoOpen
                  ? "max-h-96 opacity-100"
                  : "max-h-0 opacity-0 pointer-events-none"
                  }`}
              >
                <div className="space-y-0.5 pt-0.5">
                  {managementNav
                    .filter((item) => item.group === "Operação")
                    .map(renderSubNav)}
                </div>
              </div>
            </div>


            {/* Parte inferior: Organização, Configurações e Sair da conta */}
            <div className="sidebar-bottom mt-auto pt-3 border-t border-[var(--border-subtle)] space-y-1">
              {/* Módulo Organização */}
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => setOrganizacaoOpen((prev) => !prev)}
                  className={`flex items-center justify-between w-full px-3 py-2 rounded-[9px] text-[length:var(--type-label)] font-semibold transition-all cursor-pointer select-none group ${!organizacaoOpen && isOrganizacaoActive
                    ? "bg-[#e8efe9] text-[#164d36]"
                    : "text-[var(--text-secondary)] hover:text-[#164d36] hover:bg-[#eaf0eb]"
                    }`}
                  aria-expanded={organizacaoOpen}
                  aria-label="Alternar módulo de Organização"
                >
                  <span className="flex items-center gap-2.5">
                    <Building2
                      size={17}
                      strokeWidth={1.8}
                      className={`shrink-0 transition-colors ${!organizacaoOpen && isOrganizacaoActive
                        ? "text-[#164d36]"
                        : "text-[var(--brand-700)] group-hover:text-[#164d36]"
                        }`}
                    />
                    <span className="tracking-tight">Organização</span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    {!organizacaoOpen && isOrganizacaoActive && (
                      <span
                        className="size-1.5 rounded-full bg-[#247b56]"
                        title="Página ativa nesta seção"
                      />
                    )}
                    <ChevronDown
                      size={15}
                      strokeWidth={2}
                      className={`shrink-0 transition-transform duration-200 text-[var(--text-secondary)] group-hover:text-[#164d36] ${!organizacaoOpen ? "-rotate-90" : ""
                        }`}
                    />
                  </div>
                </button>

                <div
                  className={`overflow-hidden transition-all duration-200 ease-in-out ${organizacaoOpen
                    ? "max-h-96 opacity-100"
                    : "max-h-0 opacity-0 pointer-events-none"
                    }`}
                >
                  <div className="space-y-0.5 pt-0.5">
                    {managementNav
                      .filter((item) => item.group === "Organização")
                      .map(renderSubNav)}
                  </div>
                </div>
              </div>

              <Link
                href="/management/settings"
                onClick={() => setSearchOpen(false)}
                className={`sidebar-link ${pathname === "/management/settings" ||
                  pathname.startsWith("/management/settings/")
                  ? "is-active"
                  : ""
                  }`}
                aria-current={
                  pathname.startsWith("/management/settings")
                    ? "page"
                    : undefined
                }
              >
                <Settings size={18} strokeWidth={1.7} />
                <span>Configurações</span>
              </Link>
              <ShellForm action={logoutAction} {...shellFormOptions}>
                <ShellButton
                  variant="ghost"
                  type="submit"
                  className="sidebar-link w-full justify-start font-medium h-auto py-2.5 shadow-none cursor-pointer text-[var(--text-secondary)] hover:text-red-700 hover:bg-red-50/60 dark:hover:bg-red-950/20"
                >
                  <LogOut size={18} strokeWidth={1.7} />
                  <span>Sair da conta</span>
                </ShellButton>
              </ShellForm>
            </div>
          </nav>
        ) : (
          <>
            <nav
              aria-label={
                mode === "platform"
                  ? "Navegação da plataforma"
                  : "Navegação principal"
              }
            >
              {[...new Set(items.map((item) => item.group))].map((group) => (
                <div className="nav-group space-y-1" key={group}>
                  <p className="nav-group-label">{group}</p>
                  {items.filter((item) => item.group === group).map(renderNav)}
                </div>
              ))}
              <ShellForm action={logoutAction} {...shellFormOptions}>
                <ShellButton
                  variant="ghost"
                  type="submit"
                  className="sidebar-link w-full justify-start font-medium h-auto py-2.5 shadow-none"
                >
                  <LogOut size={18} strokeWidth={1.7} />
                  <span>Sair da conta</span>
                </ShellButton>
              </ShellForm>
            </nav>
            <div className="sidebar-note">
              {mode === "platform" ? (
                <ShieldCheck size={24} />
              ) : (
                <CheckSquare size={24} />
              )}
              <p>
                {mode === "platform"
                  ? "Tudo sob controle."
                  : "Clareza em cada etapa."}
              </p>
              <span>
                {mode === "platform"
                  ? "Administre organizações e acompanhe a plataforma."
                  : "Sua operação organizada, do planejamento à execução."}
              </span>
              <Link href={home}>
                Acompanhar
                <ArrowUpRight size={15} />
              </Link>
            </div>
          </>
        )}
      </aside>
      <div className="app-workspace">
        <header className="app-topbar">
          <Link
            className="mobile-brand"
            href={home}
            aria-label="Tarefaí, início"
          >
            <Brand compact />
          </Link>
          <Button
            variant="outline"
            className="shell-search justify-start font-medium h-auto text-left"
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Buscar no Tarefaí"
          >
            <Search size={18} />
            <span>Buscar no Tarefaí</span>
            <kbd>Ctrl K</kbd>
          </Button>
          {mode !== "platform" && (
            <OrganizationSwitcher currentOrgName={orgName} />
          )}
          <div className="topbar-account">
            {mode !== "platform" && (
              <Link
                href={mode === "management" ? "/management/notifications" : "/notifications"}
                className="icon-button relative"
                aria-label={unreadCount > 0 ? `${unreadCount} notificações não lidas` : "Notificações"}
              >
                <Bell size={19} strokeWidth={1.6} />
                {unreadCount > 0 && (
                  <span className="topbar-badge" aria-hidden="true">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </Link>
            )}
            {mode === "platform" ? (
              <Button
                variant="ghost"
                type="button"
                className="account-link p-0 h-auto hover:bg-transparent"
                aria-label="Conta do superadministrador"
                onClick={() => setAccountOpen(true)}
              >
                <Avatar className="user-avatar size-8">
                  <AvatarFallback className="bg-[var(--brand-900)] text-white text-[length:var(--type-label)] font-semibold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="account-caption">
                  <strong>{displayName}</strong>
                  <small>{roles[role] || role}</small>
                </div>
              </Button>
            ) : (
              <Link href={account} className="account-link" aria-label={`Minha conta: ${displayName}`}>
                <Avatar className="user-avatar size-8">
                  <AvatarFallback className="bg-[var(--brand-900)] text-white text-[length:var(--type-label)] font-semibold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="account-caption">
                  <strong>{displayName}</strong>
                  <small>{roles[role] || role}</small>
                </div>
              </Link>
            )}
          </div>
        </header>
        <main className="app-content" id="main-content" tabIndex={-1}>
          {mode !== "platform" && (
            <SubscriptionExpirationCard
              notice={subscriptionNotice}
              orgName={orgName}
              userRole={role}
            />
          )}
          {children}
        </main>
      </div>
      <nav ref={mobileNavigationRef} className="mobile-navigation" aria-label="Navegação móvel">
        {mode === "management" ? (
          <>
            {managementNav.slice(0, 2).map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={isActive(item) ? "is-active" : ""}
                aria-current={isActive(item) ? "page" : undefined}
              >
                <item.icon size={20} />
                <span>
                  {item.label === "Visão geral"
                    ? "Início"
                    : item.label === "Tarefas avulsas"
                      ? "Tarefas"
                      : item.label}
                </span>
              </Link>
            ))}
            <Button
              type="button"
              className="mobile-create"
              onClick={() => setCreateOpen(true)}
              aria-label="Criar tarefa ou processo"
            >
              <Plus size={24} />
            </Button>
            <Link
              href="/management/processes"
              className={
                /\/management\/(processes|routines|executions)/.test(pathname)
                  ? "is-active"
                  : ""
              }
            >
              <GitMerge size={20} />
              <span>Processos</span>
            </Link>
            <Link
              href="/management/more"
              className={`relative ${moreActive ? "is-active" : ""}`}
            >
              <Menu size={20} />
              <span>Mais</span>
              {unreadCount > 0 && (
                <span className="mobile-badge" aria-hidden="true">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Link>
          </>
        ) : (
          items.map((item) => (
            <Link
              href={item.href}
              key={item.href}
              className={`relative ${isActive(item) ? "is-active" : ""}`}
              aria-current={isActive(item) ? "page" : undefined}
            >
              <item.icon size={20} />
              <span>
                {item.label.replace("Minhas ", "").replace("Minha ", "")}
              </span>
              {item.href === "/notifications" && unreadCount > 0 && (
                <span className="mobile-badge" aria-hidden="true">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Link>
          ))
        )}
      </nav>
      <Dialog open={accountOpen} onOpenChange={setAccountOpen}>
        <DialogContent
          className="sm:max-w-sm bg-[var(--surface)] text-[var(--text-primary)] rounded-[18px] border border-[var(--border-subtle)] p-6 shadow-[var(--shadow-float)]"
          showCloseButton={true}
        >
          <DialogHeader className="mb-2">
            <DialogTitle className="text-[length:var(--type-card-title)] font-bold text-[var(--text-primary)]">
              Sua conta
            </DialogTitle>
          </DialogHeader>
          <p className="font-medium text-[length:var(--type-body)] text-[var(--text-primary)]">
            {displayName}
          </p>
          <p className="text-[length:var(--type-label)] text-[var(--text-secondary)]">
            {roles[role]}
          </p>
          <ShellForm action={logoutAction} {...shellFormOptions} className="pt-4 flex justify-end">
            <ShellButton
              variant="outline"
              type="submit"
              className="gap-2 text-red-700 hover:text-red-800 hover:bg-red-50 border-red-200"
            >
              <LogOut data-icon="inline-start" />
              Sair da conta
            </ShellButton>
          </ShellForm>
        </DialogContent>
      </Dialog>

      <CommandDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        title="O que você procura?"
        description="Busque tarefas, processos, pessoas e páginas disponíveis no seu acesso."
        className="bg-[var(--surface)] text-[var(--text-primary)] rounded-[18px] border border-[var(--border-subtle)] max-w-lg"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Digite um nome ou título para buscar"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList className="max-h-72 p-2">
            <CommandEmpty className="py-6 text-center text-[length:var(--type-label)] text-[var(--text-secondary)]">
              {searchBusy ? "Buscando…" : "Nenhum resultado encontrado no seu acesso."}
            </CommandEmpty>
            <CommandGroup heading="Navegação">
              {items
                .filter((item) =>
                  item.label
                    .toLocaleLowerCase("pt-BR")
                    .includes(query.toLocaleLowerCase("pt-BR")),
                )
                .map((item) => (
                  <CommandItem
                    key={item.href}
                    value={item.label}
                    onSelect={() => navigateShell(item.href)}
                    className="flex items-center gap-2 px-3 py-2 rounded-[10px] cursor-pointer text-[length:var(--type-label)] font-medium text-[var(--brand-900)] hover:bg-[var(--canvas)]"
                  >
                    <item.icon className="size-4 text-[var(--brand-700)]" />
                    <span>{item.label}</span>
                  </CommandItem>
                ))}
            </CommandGroup>
            {searchBusy && <p className="px-3 py-2 text-sm text-muted-foreground flex items-center gap-2" role="status"><Spinner aria-hidden="true" />Buscando no seu acesso…</p>}
            {searchError && <p className="px-3 py-2 text-sm text-destructive" role="alert">{searchError}</p>}
            {Array.from(new Set(searchResults.map(result => result.group))).map(group => <CommandGroup heading={group} key={group}>
              {searchResults.filter(result => result.group === group).map(result => <CommandItem key={`${group}-${result.id}`} value={`${group}-${result.id}`} onSelect={() => navigateShell(result.href)} className="flex flex-col items-start gap-1 px-3 py-2 cursor-pointer">
                <span className="font-medium">{result.title}</span><span className="text-caption text-muted-foreground">{result.detail}</span>
              </CommandItem>)}
            </CommandGroup>)}
            {query.trim() && mode === "management" && (
              <CommandGroup heading="Buscar tarefas">
                <CommandItem
                  value={`buscar-tarefas-${query}`}
                  onSelect={() => {
                    setSearchOpen(false);
                    window.location.href = `/management/tasks?q=${encodeURIComponent(query.trim())}`;
                  }}
                  className="flex items-center gap-2 px-3 py-2 rounded-[10px] cursor-pointer text-[length:var(--type-label)] font-medium text-[var(--brand-700)] hover:bg-[var(--canvas)]"
                >
                  <Search className="size-4" />
                  <span>Buscar “{query}” nas tarefas</span>
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </CommandDialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent
          className="sm:max-w-md bg-[var(--surface)] text-[var(--text-primary)] rounded-[18px] border border-[var(--border-subtle)] p-6 shadow-[var(--shadow-float)]"
          showCloseButton={true}
        >
          <DialogHeader className="mb-2">
            <DialogTitle className="text-[length:var(--type-card-title)] font-bold text-[var(--text-primary)]">
              O que você quer criar?
            </DialogTitle>
          </DialogHeader>
          <div className="create-options">
            <Link
              href="/management/tasks/new"
              onClick={() => setCreateOpen(false)}
            >
              <CheckSquare />
              <strong>Criar tarefa</strong>
              <span>Distribua uma atividade para a equipe.</span>
              <ArrowUpRight />
            </Link>
            <Link
              href="/management/processes/new?choose=template"
              onClick={() => setCreateOpen(false)}
            >
              <GitMerge />
              <strong>Criar processo</strong>
              <span>Organize um fluxo de trabalho em etapas.</span>
              <ArrowUpRight />
            </Link>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
