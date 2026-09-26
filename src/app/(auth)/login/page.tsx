"use client";

import { useState, useActionState } from "react";
import { Brand } from "@/presentation/components/shared/brand";
import {
  loginWithPasswordAction,
  loginWithPinAction,
  AuthState,
} from "@/presentation/actions/auth-actions";
import {
  Lock,
  Mail,
  KeyRound,
  Building2,
  UserCircle,
  ArrowRight,
  HelpCircle,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
} from "@/components/ui/input-group";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export default function LoginPage() {
  const [tab, setTab] = useState<"pin" | "password">("pin");

  const [passwordState, passwordFormAction, isPasswordPending] = useActionState<
    AuthState,
    FormData
  >(loginWithPasswordAction, {});

  const [pinState, pinFormAction, isPinPending] = useActionState<
    AuthState,
    FormData
  >(loginWithPinAction, {});

  return (
    <div className="auth-frame">
      <aside className="auth-story">
        <Brand />
        <div className="auth-story-copy">
          <span>MENOS RUÍDO. MAIS CLAREZA.</span>
          <h2>
            Sua operação,
            <br />
            no ritmo certo.
          </h2>
          <p>
            Conecte pessoas, organize processos e acompanhe cada etapa. Tudo em
            um só lugar.
          </p>
        </div>
        <div
          className="auth-preview"
          aria-label="Organize, acompanhe e conclua seu trabalho"
        >
          <div>
            <span>01</span>
            <strong>Organize o dia</strong>
            <span>Processos e rotinas</span>
          </div>
          <div>
            <span>02</span>
            <strong>Conecte a equipe</strong>
            <span>Cada pessoa sabe o que fazer</span>
          </div>
          <div>
            <span>03</span>
            <strong>Acompanhe a execução</strong>
            <span>Clareza do início ao fim</span>
          </div>
        </div>
        <p className="auth-story-footer">Gestão e execução operacional</p>
      </aside>
      <div className="auth-form-panel">
        <div className="w-full max-w-105 mx-auto">
          <div className="auth-form-brand">
            <Brand />
          </div>

          <div className="mb-7">
            <h1 className="text-(--text-primary) text-(length:--type-page-title) font-extrabold">
              Acesse sua conta
            </h1>
            <p className="text-(length:--type-label) sm:text-(length:--type-body) text-(--text-secondary) mt-1.5 leading-relaxed">
              Entre para acompanhar suas tarefas e sua operação.
            </p>
          </div>

          <ToggleGroup
            value={[tab]}
            onValueChange={(val) => {
              const selected = Array.isArray(val) ? val[val.length - 1] : val;
              if (selected === "pin" || selected === "password") {
                setTab(selected);
              }
            }}
            className="grid grid-cols-2 p-1 bg-canvas border border-(--border-subtle) rounded-[14px] mb-6 w-full gap-1"
          >
            <ToggleGroupItem
              value="pin"
              className={cn(
                "h-11 text-(length:--type-label) font-semibold rounded-[10px] transition-all flex items-center justify-center gap-2 cursor-pointer border-0",
                tab === "pin"
                  ? "bg-surface text-brand-900 shadow-none border border-(--border-subtle) data-[state=on]:bg-surface data-[state=on]:text-brand-900 hover:bg-surface"
                  : "text-(--text-secondary) hover:text-brand-900",
              )}
            >
              <KeyRound className="size-4 text-brand-700" />
              <span>Acesso por PIN</span>
            </ToggleGroupItem>
            <ToggleGroupItem
              value="password"
              className={cn(
                "h-[44px] text-[length:var(--type-label)] font-semibold rounded-[10px] transition-all flex items-center justify-center gap-2 cursor-pointer border-0",
                tab === "password"
                  ? "bg-[var(--surface)] text-[var(--brand-900)] shadow-none border border-[var(--border-subtle)] data-[state=on]:bg-[var(--surface)] data-[state=on]:text-[var(--brand-900)] hover:bg-[var(--surface)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--brand-900)]",
              )}
            >
              <Mail className="size-4 text-[var(--brand-700)]" />
              <span>E-mail e senha</span>
            </ToggleGroupItem>
          </ToggleGroup>

          {tab === "pin" && (
            <form action={pinFormAction} className="flex flex-col gap-4">
              {pinState?.error && (
                <Alert variant="destructive" className="rounded-[14px]">
                  <AlertTitle>Não foi possível entrar</AlertTitle>
                  <AlertDescription>{pinState.error}</AlertDescription>
                </Alert>
              )}

              <FieldGroup className="gap-4">
                <Field>
                  <FieldLabel
                    htmlFor="organizationSlug"
                    className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]"
                  >
                    Código da empresa
                  </FieldLabel>
                  <InputGroup className="h-[50px] rounded-[14px] bg-[var(--surface)] border-[var(--border-subtle)] px-3 focus-within:border-[var(--brand-900)] focus-within:ring-1 focus-within:ring-[var(--brand-900)]">
                    <InputGroupAddon align="inline-start">
                      <Building2 className="size-5 text-[var(--brand-700)] pointer-events-none" />
                    </InputGroupAddon>
                    <InputGroupInput
                      id="organizationSlug"
                      name="organizationSlug"
                      type="text"
                      required
                      defaultValue={
                        process.env.NODE_ENV === "development"
                          ? "alpha-varejo"
                          : ""
                      }
                      placeholder="ex: alpha-varejo"
                      className="text-[16px] text-[var(--text-primary)] placeholder:text-muted-foreground pl-1"
                    />
                  </InputGroup>
                </Field>

                <Field>
                  <FieldLabel
                    htmlFor="employeeCode"
                    className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]"
                  >
                    Matrícula
                  </FieldLabel>
                  <InputGroup className="h-[50px] rounded-[14px] bg-[var(--surface)] border-[var(--border-subtle)] px-3 focus-within:border-[var(--brand-900)] focus-within:ring-1 focus-within:ring-[var(--brand-900)]">
                    <InputGroupAddon align="inline-start">
                      <UserCircle className="size-5 text-[var(--brand-700)] pointer-events-none" />
                    </InputGroupAddon>
                    <InputGroupInput
                      id="employeeCode"
                      name="employeeCode"
                      type="text"
                      required
                      defaultValue={
                        process.env.NODE_ENV === "development" ? "EMP-001" : ""
                      }
                      placeholder="ex: EMP-001"
                      className="text-[16px] text-[var(--text-primary)] placeholder:text-muted-foreground pl-1"
                    />
                  </InputGroup>
                </Field>

                <Field>
                  <FieldLabel
                    htmlFor="pin"
                    className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]"
                  >
                    PIN de acesso (6 dígitos)
                  </FieldLabel>
                  <InputGroup className="h-[50px] rounded-[14px] bg-[var(--surface)] border-[var(--border-subtle)] px-3 focus-within:border-[var(--brand-900)] focus-within:ring-1 focus-within:ring-[var(--brand-900)]">
                    <InputGroupAddon align="inline-start">
                      <KeyRound className="size-5 text-[var(--brand-700)] pointer-events-none" />
                    </InputGroupAddon>
                    <InputGroupInput
                      id="pin"
                      name="pin"
                      type="password"
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      minLength={6}
                      maxLength={6}
                      required
                      defaultValue={
                        process.env.NODE_ENV === "development" ? "123456" : ""
                      }
                      placeholder="••••••"
                      className="text-[16px] font-mono tracking-widest text-[var(--text-primary)] placeholder:text-muted-foreground pl-1"
                    />
                  </InputGroup>
                </Field>
              </FieldGroup>

              <Button
                type="submit"
                disabled={isPinPending}
                className="mt-2 w-full h-[50px] bg-[var(--brand-900)] hover:bg-[var(--brand-700)] text-white font-semibold text-[16px] rounded-[14px] shadow-none"
              >
                {isPinPending ? (
                  <>
                    <Spinner data-icon="inline-start" />
                    <span>Validando PIN...</span>
                  </>
                ) : (
                  <>
                    <span>Entrar com PIN</span>
                    <ArrowRight data-icon="inline-end" />
                  </>
                )}
              </Button>
            </form>
          )}

          {tab === "password" && (
            <form action={passwordFormAction} className="flex flex-col gap-4">
              {passwordState?.error && (
                <Alert variant="destructive" className="rounded-[14px]">
                  <AlertTitle>Não foi possível entrar</AlertTitle>
                  <AlertDescription>{passwordState.error}</AlertDescription>
                </Alert>
              )}

              <FieldGroup className="gap-4">
                <Field>
                  <FieldLabel
                    htmlFor="email"
                    className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]"
                  >
                    E-mail corporativo
                  </FieldLabel>
                  <InputGroup className="h-[50px] rounded-[14px] bg-[var(--surface)] border-[var(--border-subtle)] px-3 focus-within:border-[var(--brand-900)] focus-within:ring-1 focus-within:ring-[var(--brand-900)]">
                    <InputGroupAddon align="inline-start">
                      <Mail className="size-5 text-[var(--brand-700)] pointer-events-none" />
                    </InputGroupAddon>
                    <InputGroupInput
                      autoComplete="username"
                      id="email"
                      name="email"
                      type="email"
                      required
                      defaultValue={
                        process.env.NODE_ENV === "development"
                          ? "carlos@alphavarejo.com"
                          : ""
                      }
                      placeholder="nome@empresa.com"
                      className="text-[16px] text-[var(--text-primary)] placeholder:text-muted-foreground pl-1"
                    />
                  </InputGroup>
                </Field>

                <Field>
                  <FieldLabel
                    htmlFor="password"
                    className="text-[length:var(--type-label)] font-semibold text-[var(--brand-900)]"
                  >
                    Senha
                  </FieldLabel>
                  <InputGroup className="h-[50px] rounded-[14px] bg-[var(--surface)] border-[var(--border-subtle)] px-3 focus-within:border-[var(--brand-900)] focus-within:ring-1 focus-within:ring-[var(--brand-900)]">
                    <InputGroupAddon align="inline-start">
                      <Lock className="size-5 text-[var(--brand-700)] pointer-events-none" />
                    </InputGroupAddon>
                    <InputGroupInput
                      autoComplete="current-password"
                      id="password"
                      name="password"
                      type="password"
                      required
                      defaultValue={
                        process.env.NODE_ENV === "development" ? "senha123" : ""
                      }
                      placeholder="Sua senha"
                      className="text-[16px] text-[var(--text-primary)] placeholder:text-muted-foreground pl-1"
                    />
                  </InputGroup>
                </Field>
              </FieldGroup>

              <Button
                type="submit"
                disabled={isPasswordPending}
                className="mt-2 w-full h-[50px] bg-[var(--brand-900)] hover:bg-[var(--brand-700)] text-white font-semibold text-[16px] rounded-[14px] shadow-none"
              >
                {isPasswordPending ? (
                  <>
                    <Spinner data-icon="inline-start" />
                    <span>Entrando...</span>
                  </>
                ) : (
                  <>
                    <span>Entrar com senha</span>
                    <ArrowRight data-icon="inline-end" />
                  </>
                )}
              </Button>
            </form>
          )}

          <div className="mt-6 pt-4 border-t border-[var(--border-subtle)] flex items-start gap-2.5 text-[length:var(--type-label)] text-[var(--text-secondary)]">
            <HelpCircle className="size-4 shrink-0 text-[var(--brand-700)] mt-0.5" />
            <p className="leading-snug">
              Esqueceu seu PIN ou precisa de ajuda? Fale com o responsável pela
              sua unidade.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
