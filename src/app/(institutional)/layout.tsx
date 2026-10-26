import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/presentation/components/shared/brand";
import { ArrowLeft, Shield, Lock } from "lucide-react";

export const metadata: Metadata = {
  title: {
    template: "%s | Tarefaí",
    default: "Políticas e Privacidade | Tarefaí",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function InstitutionalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--text-primary)] flex flex-col justify-between selection:bg-[var(--brand-soft)] selection:text-[var(--brand-900)]">
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-[var(--surface)]/90 backdrop-blur-md border-b border-[var(--border-subtle)]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <Link
              href="/"
              className="inline-flex items-center focus-visible:outline-2 focus-visible:outline-[var(--brand-700)] rounded-md transition-opacity hover:opacity-90"
            >
              <Brand />
            </Link>

            {/* Links rápidos entre as políticas */}
            <nav className="hidden sm:flex items-center gap-1 pl-4 border-l border-[var(--border-subtle)] text-xs font-medium">
              <Link
                href="/termos"
                className="px-3 py-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--canvas)] transition-colors"
              >
                Termos de Uso
              </Link>
              <Link
                href="/privacidade"
                className="px-3 py-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--canvas)] transition-colors"
              >
                Privacidade
              </Link>
              <Link
                href="/seguranca"
                className="px-3 py-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--canvas)] transition-colors"
              >
                Segurança
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-xl bg-[var(--brand-900)] text-white hover:bg-[var(--brand-700)] transition-colors"
            >
              <ArrowLeft className="size-3.5" />
              <span>Acessar o sistema</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 py-8 sm:py-12 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          {children}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--border-subtle)] bg-[var(--surface)] py-8 px-4 sm:px-6 mt-12">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[var(--text-secondary)]">
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4 text-center sm:text-left">
            <span className="font-semibold text-[var(--text-primary)]">Tarefaí</span>
            <span className="hidden sm:inline text-[var(--neutral-300)]">•</span>
            <span>Gestão e execução operacional</span>
            <span className="hidden sm:inline text-[var(--neutral-300)]">•</span>
            <span>© {new Date().getFullYear()} Todos os direitos reservados</span>
          </div>

          <div className="flex items-center gap-4 font-medium">
            <Link
              href="/termos"
              className="hover:text-[var(--text-primary)] transition-colors"
            >
              Termos
            </Link>
            <span className="text-[var(--neutral-300)]">•</span>
            <Link
              href="/privacidade"
              className="hover:text-[var(--text-primary)] transition-colors"
            >
              Privacidade
            </Link>
            <span className="text-[var(--neutral-300)]">•</span>
            <Link
              href="/seguranca"
              className="hover:text-[var(--text-primary)] transition-colors"
            >
              Segurança
            </Link>
            <span className="text-[var(--neutral-300)]">•</span>
            <Link
              href="/login"
              className="hover:text-[var(--text-primary)] transition-colors"
            >
              Entrar
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
