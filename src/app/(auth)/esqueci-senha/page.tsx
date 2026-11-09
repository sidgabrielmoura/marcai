"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Brand } from "@/presentation/components/shared/brand";
import { requestPasswordResetAction } from "@/presentation/actions/recovery-actions";
import { Mail, ArrowRight, ArrowLeft, CheckCircle2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
} from "@/components/ui/input-group";
import { toast } from "@/components/ui/toast";

export default function EsqueciSenhaPage() {
  const [email, setEmail] = useState("");
  const [isPending, startTransition] = useTransition();
  const [submitted, setSubmitted] = useState(false);
  const [sentEmail, setSentEmail] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    startTransition(async () => {
      const formData = new FormData();
      formData.append("email", email);
      const res = await requestPasswordResetAction(formData);

      if (res.error) {
        toast.add({
          title: "Não foi possível enviar",
          description: res.error,
          type: "error",
        });
      } else {
        setSentEmail(email.trim());
        setSubmitted(true);
        toast.add({
          title: "Instruções enviadas",
          description: "Verifique sua caixa de entrada para continuar.",
          type: "success",
        });
      }
    });
  };

  return (
    <div className="auth-frame">
      <aside className="auth-story">
        <div className="bg-[#ffffff] w-fit px-2 py-1 rounded-md">
          <Brand />
        </div>
        <div className="auth-story-copy">
          <span>SEGURANÇA & CONTROLE.</span>
          <h2>
            Sua conta protegida,
            <br />
            sua operação sem pausas.
          </h2>
          <p>
            Links seguros de uso único com expiração rápida e criptografia ponta a ponta
            para manter o acesso da sua equipe sempre protegido.
          </p>
        </div>
        <div
          className="auth-preview"
          aria-label="Segurança e recuperação de acesso"
        >
          <div>
            <span>01</span>
            <strong>Link de Uso Único</strong>
            <span>Invalidação automática</span>
          </div>
          <div>
            <span>02</span>
            <strong>Proteção Ativa</strong>
            <span>Revogação de sessões antigas</span>
          </div>
          <div>
            <span>03</span>
            <strong>Retorno Rápido</strong>
            <span>Acesso restaurado em instantes</span>
          </div>
        </div>
        <p className="auth-story-footer">Gestão e segurança operacional</p>
      </aside>

      <div className="auth-form-panel">
        <div className="w-full max-w-[440px] mx-auto">
          <div className="auth-form-brand">
            <Brand />
          </div>

          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--brand-900)] font-semibold mb-6 transition-colors"
          >
            <ArrowLeft className="size-4" />
            <span>Voltar para o login</span>
          </Link>

          {!submitted ? (
            <>
              <div className="mb-7">
                <h1 className="text-[var(--text-primary)] text-[length:var(--type-page-title)] font-extrabold tracking-tight">
                  Recuperar senha
                </h1>
                <p className="text-[length:var(--type-label)] sm:text-[length:var(--type-body)] text-[var(--text-secondary)] mt-1.5 leading-relaxed">
                  Informe o e-mail cadastrado na sua conta. Enviaremos um link seguro de uso único para criar uma nova senha.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <FieldGroup className="gap-4">
                  <Field>
                    <FieldLabel
                      htmlFor="email"
                      className="text-[length:var(--type-label)] font-bold text-[var(--text-primary)]"
                    >
                      E-mail da sua conta
                    </FieldLabel>
                    <InputGroup className="h-12 bg-[var(--surface)] border-[var(--border-subtle)] rounded-[12px] focus-within:ring-2 focus-within:ring-[var(--brand-700)] focus-within:border-[var(--brand-700)]">
                      <InputGroupAddon className="text-[var(--text-secondary)] pl-3">
                        <Mail className="size-5" />
                      </InputGroupAddon>
                      <InputGroupInput
                        id="email"
                        name="email"
                        type="email"
                        placeholder="seu@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoFocus
                        disabled={isPending}
                        className="text-[length:var(--type-body)] placeholder:text-[var(--text-secondary)] font-medium"
                      />
                    </InputGroup>
                  </Field>
                </FieldGroup>

                <Button
                  type="submit"
                  disabled={isPending || !email.trim()}
                  className="mt-2 w-full h-[50px] bg-[var(--brand-900)] hover:bg-[var(--brand-700)] text-white font-semibold text-[16px] rounded-[14px] shadow-none flex items-center justify-center gap-2 cursor-pointer transition-all"
                >
                  {isPending ? (
                    <>
                      <Spinner data-icon="inline-start" />
                      <span>Enviando link seguro...</span>
                    </>
                  ) : (
                    <>
                      <span>Enviar link de recuperação</span>
                      <ArrowRight data-icon="inline-end" />
                    </>
                  )}
                </Button>
              </form>
            </>
          ) : (
            <div className="flex flex-col items-center text-center py-4">
              <div className="size-16 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center mb-4 ring-8 ring-emerald-50/50">
                <CheckCircle2 className="size-8" />
              </div>

              <h2 className="text-xl font-extrabold text-[var(--text-primary)] tracking-tight">
                Verifique sua caixa de entrada
              </h2>

              <p className="text-sm text-[var(--text-secondary)] mt-2 leading-relaxed max-w-sm">
                Se o e-mail <strong className="text-[var(--text-primary)] font-semibold">{sentEmail}</strong> estiver cadastrado no Tarefaí, enviamos um link seguro válido por <strong>30 minutos</strong>.
              </p>

              <div className="w-full bg-[var(--canvas)] border border-[var(--border-subtle)] rounded-xl p-4 mt-6 text-left flex items-start gap-3">
                <ShieldCheck className="size-5 text-[var(--brand-700)] shrink-0 mt-0.5" />
                <div className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  <strong className="text-[var(--text-primary)] font-semibold block mb-0.5">
                    Link de acesso único
                  </strong>
                  Por segurança, o link enviado só pode ser acessado uma vez. Não encontrou? Verifique também a pasta de spam.
                </div>
              </div>

              <div className="mt-6 flex flex-col sm:flex-row items-center gap-3 w-full">
                <Button
                  type="button"
                  onClick={() => {
                    setSubmitted(false);
                  }}
                  variant="outline"
                  className="w-full h-11.5 flex-1 rounded-[12px] font-semibold text-sm cursor-pointer"
                >
                  Enviar para outro e-mail
                </Button>

                <Link
                  href="/login"
                  className="w-10.5! h-10.5 bg-brand-900 hover:bg-brand-700 text-white font-semibold text-sm rounded-[12px] shadow-none cursor-pointer inline-flex items-center justify-center transition-all"
                >
                  <ArrowLeft className="size-3" />
                </Link>
              </div>
            </div>
          )}

          <div className="mt-8 pt-4 border-t border-[var(--border-subtle)] flex items-center justify-center gap-3 text-xs text-[var(--text-secondary)]">
            <Link
              href="/termos"
              className="hover:text-[var(--brand-900)] hover:underline transition-colors"
            >
              Termos
            </Link>
            <span className="text-[var(--neutral-300)]">•</span>
            <Link
              href="/privacidade"
              className="hover:text-[var(--brand-900)] hover:underline transition-colors"
            >
              Privacidade
            </Link>
            <span className="text-[var(--neutral-300)]">•</span>
            <Link
              href="/seguranca"
              className="hover:text-[var(--brand-900)] hover:underline transition-colors"
            >
              Segurança
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
