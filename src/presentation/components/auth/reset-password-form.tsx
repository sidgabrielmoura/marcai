"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { resetPasswordWithTokenAction } from "@/presentation/actions/recovery-actions";
import { Lock, Eye, EyeOff, Check, X, ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
} from "@/components/ui/input-group";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

interface ResetPasswordFormProps {
  token: string;
  name?: string;
  emailMasked?: string;
}

export function ResetPasswordForm({ token, name, emailMasked }: ResetPasswordFormProps) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isSuccess, setIsSuccess] = useState(false);

  // Requisitos de validação
  const hasMinLength = password.length >= 8;
  const hasUpperLower = /[a-z]/.test(password) && /[A-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const isFormValid = hasMinLength && hasUpperLower && hasNumber && passwordsMatch;

  // Cálculo da pontuação de força
  const strengthScore = [hasMinLength, hasUpperLower, hasNumber, passwordsMatch].filter(Boolean).length;
  const strengthLabels = ["Muito fraca", "Fraca", "Média", "Forte", "Excelente"];
  const strengthColors = [
    "bg-zinc-200",
    "bg-red-500",
    "bg-amber-500",
    "bg-emerald-500",
    "bg-emerald-600",
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid || isPending) return;

    startTransition(async () => {
      const res = await resetPasswordWithTokenAction(token, password);

      if (res.error) {
        toast.add({
          title: "Não foi possível redefinir",
          description: res.error,
          type: "error",
        });
      } else {
        setIsSuccess(true);
        toast.add({
          title: "Senha redefinida com sucesso!",
          description: "Você já pode entrar com sua nova senha.",
          type: "success",
        });
      }
    });
  };

  if (isSuccess) {
    return (
      <div className="flex flex-col items-center text-center py-4">
        <div className="size-16 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center mb-4 ring-8 ring-emerald-50/50">
          <CheckCircle2 className="size-8" />
        </div>

        <h2 className="text-xl font-extrabold text-[var(--text-primary)] tracking-tight">
          Senha redefinida com sucesso!
        </h2>

        <p className="text-sm text-[var(--text-secondary)] mt-2 leading-relaxed max-w-sm">
          Sua nova senha foi atualizada. Por motivos de segurança, todas as sessões anteriores foram desconectadas.
        </p>

        <Link
          href="/login"
          className="mt-6 w-full h-[50px] bg-[var(--brand-900)] hover:bg-[var(--brand-700)] text-white font-semibold text-[16px] rounded-[14px] shadow-none flex items-center justify-center gap-2 cursor-pointer transition-all"
        >
          <span>Ir para o login</span>
          <ArrowRight data-icon="inline-end" />
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {emailMasked && (
        <div className="bg-[var(--canvas)] border border-[var(--border-subtle)] rounded-xl px-3.5 py-2.5 text-xs text-[var(--text-secondary)] flex items-center justify-between">
          <span>Redefinindo para:</span>
          <strong className="text-[var(--text-primary)] font-semibold">{emailMasked}</strong>
        </div>
      )}

      <FieldGroup className="gap-4">
        {/* Nova Senha */}
        <Field>
          <FieldLabel
            htmlFor="password"
            className="text-[length:var(--type-label)] font-bold text-[var(--text-primary)]"
          >
            Nova Senha
          </FieldLabel>
          <InputGroup className="h-12 bg-[var(--surface)] border-[var(--border-subtle)] rounded-[12px] focus-within:ring-2 focus-within:ring-[var(--brand-700)] focus-within:border-[var(--brand-700)]">
            <InputGroupAddon className="text-[var(--text-secondary)] pl-3">
              <Lock className="size-5" />
            </InputGroupAddon>
            <InputGroupInput
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              placeholder="Digite sua nova senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoFocus
              disabled={isPending}
              className="text-[length:var(--type-body)] placeholder:text-[var(--text-secondary)] font-medium"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              tabIndex={-1}
              className="px-3 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </InputGroup>
        </Field>

        {/* Barra de Força */}
        {password.length > 0 && (
          <div className="flex flex-col gap-1.5 -mt-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--text-secondary)]">Força da senha:</span>
              <span className="font-semibold text-[var(--text-primary)]">
                {strengthLabels[strengthScore]}
              </span>
            </div>
            <div className="h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden flex gap-1">
              {[1, 2, 3, 4].map((step) => (
                <div
                  key={step}
                  className={cn(
                    "h-full flex-1 transition-all rounded-full",
                    strengthScore >= step ? strengthColors[strengthScore] : "bg-zinc-200"
                  )}
                />
              ))}
            </div>
          </div>
        )}

        {/* Confirmar Senha */}
        <Field>
          <FieldLabel
            htmlFor="confirmPassword"
            className="text-[length:var(--type-label)] font-bold text-[var(--text-primary)]"
          >
            Confirmar Nova Senha
          </FieldLabel>
          <InputGroup className="h-12 bg-[var(--surface)] border-[var(--border-subtle)] rounded-[12px] focus-within:ring-2 focus-within:ring-[var(--brand-700)] focus-within:border-[var(--brand-700)]">
            <InputGroupAddon className="text-[var(--text-secondary)] pl-3">
              <Lock className="size-5" />
            </InputGroupAddon>
            <InputGroupInput
              id="confirmPassword"
              name="confirmPassword"
              type={showConfirm ? "text" : "password"}
              placeholder="Repita a nova senha"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              disabled={isPending}
              className="text-[length:var(--type-body)] placeholder:text-[var(--text-secondary)] font-medium"
            />
            <button
              type="button"
              onClick={() => setShowConfirm(!showConfirm)}
              tabIndex={-1}
              className="px-3 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            >
              {showConfirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </InputGroup>
        </Field>
      </FieldGroup>

      {/* Checklist de Requisitos */}
      <div className="bg-[var(--canvas)] border border-[var(--border-subtle)] rounded-xl p-3.5 flex flex-col gap-2 text-xs">
        <span className="font-semibold text-[var(--text-primary)] mb-0.5">
          Requisitos de segurança:
        </span>
        <div className="flex items-center gap-2">
          {hasMinLength ? (
            <Check className="size-3.5 text-emerald-600 shrink-0" />
          ) : (
            <X className="size-3.5 text-zinc-400 shrink-0" />
          )}
          <span className={hasMinLength ? "text-emerald-700 font-medium" : "text-[var(--text-secondary)]"}>
            Mínimo de 8 caracteres
          </span>
        </div>
        <div className="flex items-center gap-2">
          {hasUpperLower ? (
            <Check className="size-3.5 text-emerald-600 shrink-0" />
          ) : (
            <X className="size-3.5 text-zinc-400 shrink-0" />
          )}
          <span className={hasUpperLower ? "text-emerald-700 font-medium" : "text-[var(--text-secondary)]"}>
            Letras maiúsculas e minúsculas
          </span>
        </div>
        <div className="flex items-center gap-2">
          {hasNumber ? (
            <Check className="size-3.5 text-emerald-600 shrink-0" />
          ) : (
            <X className="size-3.5 text-zinc-400 shrink-0" />
          )}
          <span className={hasNumber ? "text-emerald-700 font-medium" : "text-[var(--text-secondary)]"}>
            Pelo menos um número
          </span>
        </div>
        {confirmPassword.length > 0 && (
          <div className="flex items-center gap-2">
            {passwordsMatch ? (
              <Check className="size-3.5 text-emerald-600 shrink-0" />
            ) : (
              <X className="size-3.5 text-red-500 shrink-0" />
            )}
            <span className={passwordsMatch ? "text-emerald-700 font-medium" : "text-red-600 font-medium"}>
              As senhas coincidem
            </span>
          </div>
        )}
      </div>

      <Button
        type="submit"
        disabled={isPending || !isFormValid}
        className="mt-2 w-full h-[50px] bg-[var(--brand-900)] hover:bg-[var(--brand-700)] text-white font-semibold text-[16px] rounded-[14px] shadow-none flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
      >
        {isPending ? (
          <>
            <Spinner data-icon="inline-start" />
            <span>Salvando nova senha...</span>
          </>
        ) : (
          <>
            <span>Redefinir e proteger conta</span>
            <ArrowRight data-icon="inline-end" />
          </>
        )}
      </Button>
    </form>
  );
}
