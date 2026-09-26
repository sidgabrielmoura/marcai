"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CheckSquare,
  GitMerge,
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
  type LucideIcon,
} from "lucide-react";
import { logoutAction } from "@/presentation/actions/auth-actions";
import { searchWorkspaceAction, type SearchResult } from "@/presentation/actions/search-actions";
import { Brand } from "./brand";
import { OrganizationSwitcher } from "./organization-switcher";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
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
    label: "Tarefas",
    href: "/management/tasks",
    icon: CheckSquare,
    group: "Principal",
  },
  {
    label: "Processos",
    href: "/management/processes",
    icon: GitMerge,
    group: "Principal",
  },
  {
    label: "Rotinas",
    href: "/management/routines",
    icon: CalendarClock,
    group: "Principal",
  },
  {
    label: "Execuções",
    href: "/management/executions",
    icon: PlayCircle,
    group: "Principal",
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
    group: "Geral",
  },
  { label: "Avisos", href: "/notifications", icon: Bell, group: "Geral" },
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
    label: "Planos e assinaturas",
    href: "/superadmin?view=subscriptions",
    icon: CalendarClock,
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
}: {
  children: ReactNode;
  userName: string;
  orgName: string;
  role?: string;
  mode?: "management" | "employee" | "platform";
  activeView?: string;
}) {
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState("");
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

  const renderNav = (item: NavItem) => (
    <Link
      key={item.href}
      href={item.href}
      onClick={() => setSearchOpen(false)}
      className={`sidebar-link ${isActive(item) ? "is-active" : ""}`}
      aria-current={isActive(item) ? "page" : undefined}
    >
      <item.icon size={18} strokeWidth={1.7} />
      <span>{item.label}</span>
    </Link>
  );
  const moreActive =
    ["/notifications", "/account"].includes(pathname) ||
    (pathname.startsWith("/management/") &&
      ![
        "/management/tasks",
        "/management/processes",
        "/management/routines",
        "/management/executions",
      ].some((path) => pathname.startsWith(path)));

  return (
    <div className={`app-frame app-frame--${mode}`}>
      <a href="#main-content" className="skip-link">
        Pular para o conteúdo
      </a>
      <aside className="app-sidebar gap-0! space-y-2! p-3!">
        <Link
          href={home}
          className="sidebar-brand"
          aria-label="Marcai, página inicial"
        >
          <Brand />
        </Link>
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
          <form action={logoutAction}>
            <Button
              variant="ghost"
              type="submit"
              className="sidebar-link w-full justify-start font-medium h-auto py-2.5 shadow-none"
            >
              <LogOut size={18} strokeWidth={1.7} />
              <span>Sair da conta</span>
            </Button>
          </form>
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
          <Link href={mode === "management" ? "/overview" : home}>
            {mode === "management" ? "Ver visão geral" : "Acompanhar"}
            <ArrowUpRight size={15} />
          </Link>
        </div>
      </aside>
      <div className="app-workspace">
        <header className="app-topbar">
          <Link
            className="mobile-brand"
            href={home}
            aria-label="Marcai, início"
          >
            <Brand compact />
          </Link>
          <Button
            variant="outline"
            className="shell-search justify-start font-medium h-auto text-left"
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Buscar no Marcai"
          >
            <Search size={18} />
            <span>Buscar no Marcai</span>
            <kbd>Ctrl K</kbd>
          </Button>
          {mode !== "platform" && (
            <OrganizationSwitcher currentOrgName={orgName} />
          )}
          <div className="topbar-account">
            {mode !== "platform" && (
              <Link
                href="/notifications"
                className="icon-button"
                aria-label="Notificações"
              >
                <Bell size={19} strokeWidth={1.6} />
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
          {children}
        </main>
      </div>
      <nav className="mobile-navigation" aria-label="Navegação móvel">
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
                  {item.label === "Visão geral" ? "Início" : item.label}
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
              className={moreActive ? "is-active" : ""}
            >
              <Menu size={20} />
              <span>Mais</span>
            </Link>
          </>
        ) : (
          items.map((item) => (
            <Link
              href={item.href}
              key={item.href}
              className={isActive(item) ? "is-active" : ""}
              aria-current={isActive(item) ? "page" : undefined}
            >
              <item.icon size={20} />
              <span>
                {item.label.replace("Minhas ", "").replace("Minha ", "")}
              </span>
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
          <form action={logoutAction} className="pt-4 flex justify-end">
            <Button
              variant="outline"
              type="submit"
              className="gap-2 text-red-700 hover:text-red-800 hover:bg-red-50 border-red-200"
            >
              <LogOut data-icon="inline-start" />
              Sair da conta
            </Button>
          </form>
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
                    onSelect={() => {
                      setSearchOpen(false);
                      window.location.href = item.href;
                    }}
                    className="flex items-center gap-2 px-3 py-2 rounded-[10px] cursor-pointer text-[length:var(--type-label)] font-medium text-[var(--brand-900)] hover:bg-[var(--canvas)]"
                  >
                    <item.icon className="size-4 text-[var(--brand-700)]" />
                    <span>{item.label}</span>
                  </CommandItem>
                ))}
            </CommandGroup>
            {searchBusy && <p className="px-3 py-2 text-sm text-muted-foreground" role="status">Buscando no seu acesso…</p>}
            {searchError && <p className="px-3 py-2 text-sm text-destructive" role="alert">{searchError}</p>}
            {Array.from(new Set(searchResults.map(result => result.group))).map(group => <CommandGroup heading={group} key={group}>
              {searchResults.filter(result => result.group === group).map(result => <CommandItem key={`${group}-${result.id}`} value={`${group}-${result.id}`} onSelect={() => { setSearchOpen(false); window.location.href = result.href; }} className="flex flex-col items-start gap-1 px-3 py-2 cursor-pointer">
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
              href="/management/processes/new"
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
