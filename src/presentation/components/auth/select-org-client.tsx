"use client";

import { useState, useTransition, useMemo } from "react";
import Link from "next/link";
import {
  Building2,
  ArrowRight,
  ArrowLeft,
  Search,
  X,
  LogOut,
  Users,
  Sparkles,
} from "lucide-react";
import {
  switchOrganizationAction,
  logoutAction,
} from "@/presentation/actions/auth-actions";
import { Brand } from "@/presentation/components/shared/brand";
import { uiLabel } from "@/presentation/components/shared/ui-labels";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
} from "@/components/ui/input-group";
import { cn } from "cn";

export interface SelectOrgMembership {
  id: string;
  role: string;
  employeeCode: string | null;
  organization: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    memberCount?: number;
    locationCount?: number;
  };
  isActive: boolean;
}

export interface SelectOrgClientProps {
  user: {
    id: string;
    name: string;
    email: string | null;
  };
  currentOrgId: string | null;
  currentOrgName?: string | null;
  currentRole?: string | null;
  memberships: SelectOrgMembership[];
}

function getOrgInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() || "")
    .join("");
}

export function SelectOrgClient({
  user,
  currentOrgId,
  currentOrgName,
  currentRole,
  memberships,
}: SelectOrgClientProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [switchingOrgId, setSwitchingOrgId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const userInitials = useMemo(() => {
    return (user.name || "U")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() || "")
      .join("");
  }, [user.name]);

  // Ordena: organização ativa em primeiro, depois em ordem alfabética
  const sortedMemberships = useMemo(() => {
    return [...memberships].sort((a, b) => {
      if (a.isActive && !b.isActive) return -1;
      if (!a.isActive && b.isActive) return 1;
      return a.organization.name.localeCompare(b.organization.name);
    });
  }, [memberships]);

  // Filtro de busca por nome ou slug
  const filteredMemberships = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return sortedMemberships;
    return sortedMemberships.filter(
      (m) =>
        m.organization.name.toLowerCase().includes(query) ||
        m.organization.slug.toLowerCase().includes(query),
    );
  }, [sortedMemberships, searchTerm]);

  function handleSelectOrg(orgId: string) {
    if (isPending || switchingOrgId) return;
    setSwitchingOrgId(orgId);

    startTransition(async () => {
      try {
        await switchOrganizationAction(orgId);
      } catch (err: unknown) {
        const error = err as { message?: string; digest?: string };
        if (
          error?.message === "NEXT_REDIRECT" ||
          error?.digest?.includes("NEXT_REDIRECT")
        ) {
          throw err;
        }
        console.error("Erro ao alternar organização:", err);
        setSwitchingOrgId(null);
      }
    });
  }

  const backHref = currentRole === "EMPLOYEE" ? "/tasks" : "/overview";

  return (
    <div className="min-h-dvh bg-[var(--canvas)] flex flex-col justify-between items-center px-4 py-8 relative selection:bg-emerald-100 selection:text-emerald-950">
      {/* Background Decorativo Suave */}
      <div
        className="fixed inset-0 pointer-events-none opacity-40 -z-10"
        style={{
          background:
            "radial-gradient(ellipse at 50% 15%, rgba(36, 123, 86, 0.08) 0%, transparent 60%)",
        }}
      />

      {/* Top Header com Identidade e Ações */}
      <header className="w-full max-w-xl flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          {currentOrgId ? (
            <Button
              variant="ghost"
              size="sm"
              nativeButton={false}
              render={<Link href={backHref} />}
              className="text-[var(--text-secondary)] hover:text-[var(--brand-900)] rounded-full px-3 gap-1.5 font-medium shadow-none"
            >
              <ArrowLeft className="size-4" />
              <span>Voltar ao Marcai</span>
            </Button>
          ) : (
            <Link href="/" className="inline-block hover:opacity-90 transition-opacity">
              <Brand />
            </Link>
          )}
        </div>

        {/* Informações da Conta Logada */}
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex flex-col text-right leading-tight">
            <span className="text-xs font-semibold text-[var(--text-primary)]">
              {user.name}
            </span>
            <span className="text-[11px] text-[var(--text-secondary)] truncate max-w-[180px]">
              {user.email || "Acesso por PIN"}
            </span>
          </div>

          <div className="size-8 rounded-full bg-[var(--brand-900)] text-white text-xs font-bold flex items-center justify-center shrink-0">
            {userInitials}
          </div>

          <form action={logoutAction}>
            <Button
              type="submit"
              variant="ghost"
              size="icon"
              title="Sair da conta"
              className="text-[var(--text-secondary)] hover:text-red-700 hover:bg-red-50 rounded-full size-8"
            >
              <LogOut className="size-4" />
            </Button>
          </form>
        </div>
      </header>

      {/* Container Principal usando shadcn/ui Card */}
      <main className="w-full max-w-xl my-auto">
        <Card className="bg-[var(--surface)] rounded-3xl p-6 sm:p-8 border border-[var(--border-subtle)] shadow-[0_20px_40px_-15px_rgba(0,0,0,0.06)] relative overflow-hidden">
          {/* Header do Card */}
          <CardHeader className="text-center p-0 mb-6 gap-1">
            <div className="inline-flex items-center justify-center size-12 rounded-2xl bg-[var(--brand-soft)] text-[var(--brand-900)] mx-auto mb-3 shadow-sm ring-1 ring-[var(--border-subtle)]">
              <Building2 className="size-6" />
            </div>

            <CardTitle className="text-2xl sm:text-3xl font-extrabold text-[var(--text-primary)] tracking-tight">
              Seus espaços de trabalho
            </CardTitle>
            <CardDescription className="text-sm text-[var(--text-secondary)] mt-1 max-w-md mx-auto">
              Selecione a organização em que deseja operar. Você pode trocar de
              espaço a qualquer momento no sistema.
            </CardDescription>
          </CardHeader>

          <CardContent className="p-0">
            {memberships.length > 2 && (
              <div className="mb-4">
                <InputGroup className="h-10 bg-[var(--canvas)] border-[var(--border-subtle)] rounded-xl focus-within:border-[var(--brand-700)] focus-within:ring-2 focus-within:ring-[var(--brand-soft)]">
                  <InputGroupAddon align="inline-start">
                    <Search className="size-4 text-[var(--text-secondary)]" />
                  </InputGroupAddon>
                  <InputGroupInput
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar por nome ou slug..."
                    className="text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]"
                  />
                  {searchTerm && (
                    <InputGroupAddon align="inline-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => setSearchTerm("")}
                        className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] size-6"
                        title="Limpar busca"
                      >
                        <X className="size-3.5" />
                      </Button>
                    </InputGroupAddon>
                  )}
                </InputGroup>
              </div>
            )}

            {/* Lista de Organizações */}
            <div
              className="flex flex-col gap-2.5 max-h-[380px] overflow-y-auto pr-0.5"
              tabIndex={0}
              aria-label="Lista de organizações"
            >
              {filteredMemberships.length === 0 ? (
                <div className="py-8 text-center flex flex-col items-center justify-center gap-2">
                  <Building2 className="size-8 text-[var(--text-secondary)] opacity-50" />
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    Nenhuma organização encontrada
                  </p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Não encontramos resultados para &ldquo;{searchTerm}&rdquo;.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSearchTerm("")}
                    className="mt-2 rounded-full text-xs"
                  >
                    Limpar busca
                  </Button>
                </div>
              ) : (
                filteredMemberships.map((membership) => {
                  const isSelected =
                    switchingOrgId === membership.organization.id;
                  const isCurrentActive = membership.isActive;
                  const initials = getOrgInitials(membership.organization.name);

                  return (
                    <Button
                      key={membership.id}
                      type="button"
                      variant="outline"
                      disabled={isPending}
                      onClick={() => handleSelectOrg(membership.organization.id)}
                      className={cn(
                        "w-full h-auto text-left relative flex items-center justify-between gap-3 p-4 rounded-2xl border transition-all duration-200 outline-none whitespace-normal shadow-none group",
                        isCurrentActive
                          ? "bg-emerald-50/50 border-emerald-500/40 ring-1 ring-emerald-500/20 hover:border-emerald-600/70 hover:bg-emerald-50/80"
                          : "bg-[var(--canvas)] border-[var(--border-subtle)] hover:border-[var(--brand-700)] hover:bg-[var(--surface)] hover:shadow-sm",
                        isPending && !isSelected && "opacity-50 pointer-events-none",
                        isSelected &&
                        "border-[var(--brand-900)] ring-2 ring-[var(--brand-soft)] bg-white",
                      )}
                    >
                      <div className="flex items-center gap-3.5 min-w-0 flex-1">
                        {/* Avatar / Ícone da Organização */}
                        <div
                          className={cn(
                            "size-11 rounded-xl flex items-center justify-center shrink-0 font-bold text-sm tracking-tight transition-colors shadow-xs",
                            isCurrentActive
                              ? "bg-[var(--brand-900)] text-white"
                              : "bg-[var(--surface)] text-[var(--brand-900)] border border-[var(--border-subtle)] group-hover:bg-[var(--brand-soft)]",
                          )}
                        >
                          {initials || <Building2 className="size-5" />}
                        </div>

                        {/* Informações da Organização */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-[length:var(--type-card-title)] text-[var(--text-primary)] group-hover:text-[var(--brand-900)] transition-colors truncate">
                              {membership.organization.name}
                            </span>

                            {isCurrentActive && (
                              <Badge
                                variant="outline"
                                className="text-[10px] uppercase font-bold tracking-wider bg-emerald-100 text-emerald-900 border-emerald-300 py-0 px-2 rounded-full inline-flex items-center gap-1 shadow-none shrink-0"
                              >
                                <span className="size-1.5 rounded-full bg-emerald-600 animate-pulse" />
                                Espaço atual
                              </Badge>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-[var(--text-secondary)]">
                            <span className="font-mono text-[11px] text-[var(--text-secondary)]">
                              @{membership.organization.slug}
                            </span>
                            <span>•</span>
                            <span className="font-medium text-[var(--text-primary)]">
                              {uiLabel(membership.role)}
                            </span>

                            {typeof membership.organization.memberCount ===
                              "number" && (
                                <>
                                  <span>•</span>
                                  <span className="inline-flex items-center gap-1">
                                    <Users className="size-3" />
                                    {membership.organization.memberCount}{" "}
                                    {membership.organization.memberCount === 1
                                      ? "membro"
                                      : "membros"}
                                  </span>
                                </>
                              )}
                          </div>
                        </div>
                      </div>

                      {/* Estado à Direita */}
                      <div className="flex items-center gap-2 shrink-0 pl-2">
                        {isSelected ? (
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-brand-900">
                            <Spinner className="size-4" />
                            <span className="hidden sm:inline">Acessando...</span>
                          </div>
                        ) : isCurrentActive ? (
                          <div className="flex items-center gap-1.5 text-emerald-700 text-xs font-semibold">
                            <span className="hidden sm:inline">Entrar</span>
                            <ArrowRight className="size-4 group-hover:translate-x-1 transition-transform ml-0.5" />
                          </div>
                        ) : (
                          <div className="size-8 rounded-full flex items-center justify-center text-[var(--text-secondary)] group-hover:text-[var(--brand-900)] group-hover:bg-[var(--brand-soft)] transition-all">
                            <ArrowRight className="size-4 group-hover:translate-x-0.5 transition-transform" />
                          </div>
                        )}
                      </div>
                    </Button>
                  );
                })
              )}
            </div>
          </CardContent>

          {/* Dica / Rodapé do Card */}
          <CardFooter className="mt-6 pt-4 border-t border-[var(--border-subtle)] p-0 flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--text-secondary)]">
            <span className="inline-flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-emerald-600 shrink-0" />
              <span>
                Precisa de outro acesso? Solicite ao administrador da organização.
              </span>
            </span>

            {currentOrgId && currentOrgName && (
              <Link
                href={backHref}
                className="font-semibold text-[var(--brand-900)] hover:underline inline-flex items-center gap-1"
              >
                Permanecer em {currentOrgName}
              </Link>
            )}
          </CardFooter>
        </Card>
      </main>

      <footer className="w-full max-w-xl text-center mt-6 text-xs text-[var(--text-secondary)]">
        <p>Marcaí • Gestão operacional simplificada e transparente</p>
      </footer>
    </div>
  );
}
