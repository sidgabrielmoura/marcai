"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { Building2, ChevronDown, Check } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { LogoLoader } from "@/components/loader/logo-loader";
import { Button } from "@/components/ui/button";
import {
  switchOrganizationAction,
  getUserOrganizationsAction,
  type UserOrganizationOption,
} from "@/presentation/actions/auth-actions";
import { uiLabel } from "./ui-labels";
import { cn } from "cn";

interface OrganizationSwitcherProps {
  currentOrgName: string;
  className?: string;
  children?: React.ReactNode;
}

export function OrganizationSwitcher({
  currentOrgName,
  className,
  children,
}: OrganizationSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [orgs, setOrgs] = useState<UserOrganizationOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);

  async function fetchOrganizations() {
    if (orgs.length > 0) return;
    setLoading(true);
    try {
      const data = await getUserOrganizationsAction();
      setOrgs(data);
    } catch (err) {
      console.error("Erro ao carregar organizações:", err);
    } finally {
      setLoading(false);
    }
  }

  // Pre-carrega em segundo plano
  useEffect(() => {
    fetchOrganizations();
  }, []);

  // Fechar ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  // Fechar ao pressionar Escape
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    if (open) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [open]);

  function handleToggle() {
    setOpen((prev) => {
      const next = !prev;
      if (next && orgs.length === 0) {
        fetchOrganizations();
      }
      return next;
    });
  }

  function handleSelect(org: UserOrganizationOption) {
    if (org.isActive) {
      setOpen(false);
      return;
    }
    if (isPending || switchingId) return;

    setSwitchingId(org.id);
    startTransition(async () => {
      try {
        await switchOrganizationAction(org.id);
      } catch (err) {
        setSwitchingId(null);
        console.error("Erro ao trocar organização:", err);
      }
    });
  }

  return (
    <div ref={containerRef} className="relative inline-flex items-center">
      {/* Botão Gatilho */}
      {children ? (
        <div
          role="button"
          tabIndex={0}
          onClick={handleToggle}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleToggle();
            }
          }}
          className="cursor-pointer"
        >
          {children}
        </div>
      ) : (
        <Button
          variant="ghost"
          type="button"
          onClick={handleToggle}
          aria-expanded={open}
          aria-haspopup="true"
          className={cn(
            "organization-switch h-auto p-0 font-normal hover:bg-transparent cursor-pointer hover:opacity-80 transition-opacity text-left outline-none flex items-center gap-1.5 shadow-none",
            className,
          )}
          title={currentOrgName}
          aria-label={`Trocar organização atual (${currentOrgName})`}
        >
          <span className="truncate">{currentOrgName}</span>
          <ChevronDown
            size={14}
            className={cn(
              "shrink-0 transition-transform duration-200 text-[var(--text-secondary)]",
              open && "rotate-180",
            )}
          />
        </Button>
      )}

      {/* Menu Dropdown Flutuante */}
      {open && (
        <div
          className={cn(
            "absolute top-[calc(100%+8px)] left-0 min-w-[260px] w-max max-w-[320px]",
            "bg-[var(--surface)] border border-[var(--border-subtle)] rounded-2xl p-2",
            "shadow-xl z-50 flex flex-col gap-1",
            "animate-in fade-in-0 zoom-in-95 duration-150",
          )}
          role="menu"
          aria-orientation="vertical"
        >
          <div className="text-[11px] font-bold text-[var(--text-secondary)] px-2.5 py-1.5 uppercase tracking-wider select-none">
            Suas organizações
          </div>

          <div className="h-px bg-[var(--border-subtle)] my-0.5" />

          {loading && orgs.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-6 gap-2 text-xs text-[var(--text-secondary)]">
              <LogoLoader size={44} text="Carregando organizações..." />
            </div>
          ) : orgs.length === 0 ? (
            <div className="p-3 text-xs text-center text-[var(--text-secondary)]">
              Nenhuma organização encontrada.
            </div>
          ) : (
            <div className="flex flex-col gap-1 max-h-72 overflow-y-auto">
              {orgs.map((org) => {
                const isSwitchingThis = switchingId === org.id;

                return (
                  <Button
                    key={org.id}
                    type="button"
                    variant="ghost"
                    role="menuitem"
                    disabled={isPending}
                    onClick={() => handleSelect(org)}
                    className={cn(
                      "w-full h-auto flex items-center justify-between gap-3 p-2 rounded-xl text-left transition-all cursor-pointer outline-none whitespace-normal shadow-none font-normal",
                      org.isActive
                        ? "bg-[var(--brand-soft)] text-[var(--brand-900)] font-semibold hover:bg-[var(--brand-soft)]"
                        : "hover:bg-[var(--canvas)] text-[var(--text-primary)]",
                      isPending && !isSwitchingThis && "opacity-50 pointer-events-none",
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div
                        className={cn(
                          "size-8 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                          org.isActive
                            ? "bg-[var(--brand-900)] text-white"
                            : "bg-[var(--canvas)] text-[var(--text-secondary)]",
                        )}
                      >
                        <Building2 className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm truncate leading-tight font-medium">
                          {org.name}
                        </p>
                        <p className="text-[11px] text-[var(--text-secondary)] truncate mt-0.5">
                          {uiLabel(org.role)}
                        </p>
                      </div>
                    </div>

                    {isSwitchingThis ? (
                      <LogoLoader size={20} className="shrink-0" />
                    ) : org.isActive ? (
                      <Check className="size-4 shrink-0 text-[var(--brand-900)]" />
                    ) : null}
                  </Button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
