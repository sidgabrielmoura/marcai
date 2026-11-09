import Link from "next/link";
import { Brand } from "@/presentation/components/shared/brand";
import { validatePasswordResetTokenAction } from "@/presentation/actions/recovery-actions";
import { ResetPasswordForm } from "@/presentation/components/auth/reset-password-form";
import { AlertTriangle, ArrowLeft, ArrowRight, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RedefinirSenhaPageProps {
  searchParams: Promise<{
    token?: string;
  }>;
}

export default async function RedefinirSenhaPage({ searchParams }: RedefinirSenhaPageProps) {
  const { token } = await searchParams;
  const validation = token ? await validatePasswordResetTokenAction(token) : { valid: false };

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
            Crie uma nova senha para manter seus processos, tarefas e dados operacionais protegidos.
            Ao redefinir sua senha, todas as sessões anteriores são desconectadas automaticamente.
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

          {validation.valid && token ? (
            <>
              <div className="mb-6">
                <h1 className="text-[var(--text-primary)] text-[length:var(--type-page-title)] font-extrabold tracking-tight">
                  Criar nova senha
                </h1>
                <p className="text-[length:var(--type-label)] sm:text-[length:var(--type-body)] text-[var(--text-secondary)] mt-1.5 leading-relaxed">
                  Defina uma senha segura para acessar sua conta no Tarefaí.
                </p>
              </div>

              <ResetPasswordForm
                token={token}
                name={validation.name}
                emailMasked={validation.emailMasked}
              />
            </>
          ) : (
            <div className="flex flex-col items-center text-center py-4">
              <div className="size-16 rounded-full bg-amber-50 text-amber-700 flex items-center justify-center mb-4 ring-8 ring-amber-50/50">
                <ShieldAlert className="size-8" />
              </div>

              <h2 className="text-xl font-extrabold text-[var(--text-primary)] tracking-tight">
                Link inválido ou expirado
              </h2>

              <p className="text-sm text-[var(--text-secondary)] mt-2 leading-relaxed max-w-sm">
                Por motivos de segurança, os links de recuperação de senha só podem ser acessados <strong>uma única vez</strong> e expiram após <strong>30 minutos</strong>.
              </p>

              <div className="w-full bg-[var(--canvas)] border border-[var(--border-subtle)] rounded-xl p-4 mt-6 text-left flex items-start gap-3">
                <AlertTriangle className="size-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  <strong className="text-[var(--text-primary)] font-semibold block mb-0.5">
                    O que fazer agora?
                  </strong>
                  Solicite um novo link de recuperação informando seu e-mail cadastrado na tela de recuperação.
                </div>
              </div>

              <div className="mt-6 flex flex-col sm:flex-row items-center gap-3 w-full">
                <Link
                  href="/esqueci-senha"
                  className="w-full h-[46px] bg-[var(--brand-900)] hover:bg-[var(--brand-700)] text-white font-semibold text-sm rounded-[12px] shadow-none cursor-pointer inline-flex items-center justify-center gap-2 transition-all"
                >
                  <span>Solicitar novo link</span>
                  <ArrowRight data-icon="inline-end" />
                </Link>

                <Link
                  href="/login"
                  className="w-full h-[46px] border border-[var(--border-subtle)] bg-[var(--surface)] hover:bg-zinc-50 text-[var(--text-primary)] font-semibold text-sm rounded-[12px] cursor-pointer inline-flex items-center justify-center transition-all"
                >
                  Ir para o login
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
