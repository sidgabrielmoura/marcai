"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Brand } from "@/presentation/components/shared/brand";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Fingerprint,
  ShieldCheck,
  Zap,
  KeyRound,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { toast } from "@/components/ui/toast";
import { startRegistration } from "@simplewebauthn/browser";
import {
  generateWebAuthnRegistration,
  verifyWebAuthnRegistration,
} from "@/presentation/actions/webauthn-actions";

interface SetupBiometricsClientProps {
  userName: string;
  nextUrl: string;
}

export function SetupBiometricsClient({
  userName,
  nextUrl,
}: SetupBiometricsClientProps) {
  const router = useRouter();
  const [isCheckingCompatibility, setIsCheckingCompatibility] = useState(true);
  const [isSupported, setIsSupported] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    async function checkPlatformSupport() {
      try {
        if (
          typeof window !== "undefined" &&
          window.PublicKeyCredential &&
          typeof window.PublicKeyCredential
            .isUserVerifyingPlatformAuthenticatorAvailable === "function"
        ) {
          const available =
            await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
          if (!available) {
            // Dispositivo/computador não possui leitor de digital/biometria.
            // Redireciona imediatamente para o destino sem incomodar o usuário.
            router.replace(nextUrl);
            return;
          }
          setIsSupported(true);
        } else {
          router.replace(nextUrl);
          return;
        }
      } catch {
        router.replace(nextUrl);
        return;
      } finally {
        setIsCheckingCompatibility(false);
      }
    }

    checkPlatformSupport();
  }, [nextUrl, router]);

  const handleRegisterBiometrics = async () => {
    setIsRegistering(true);
    try {
      const options = await generateWebAuthnRegistration();
      const attResp = await startRegistration({ optionsJSON: options });
      const verification = await verifyWebAuthnRegistration(attResp);

      if (verification?.error) {
        toast.add({
          title: "Falha ao registrar biometria",
          description: verification.error,
          type: "error",
        });
      } else if (verification?.success) {
        setIsSuccess(true);
        toast.add({
          title: "Biometria ativada!",
          description: "Você já pode entrar com 1 toque no próximo acesso.",
          type: "success",
        });
        setTimeout(() => {
          router.replace(nextUrl);
        }, 1200);
      }
    } catch (err: any) {
      if (err?.digest?.startsWith("NEXT_REDIRECT") || err?.message === "NEXT_REDIRECT") {
        return;
      }
      if (err.name === "NotAllowedError") {
        toast.add({
          title: "Ativação cancelada",
          description: "O registro da biometria foi cancelado pelo dispositivo.",
          type: "error",
        });
      } else {
        toast.add({
          title: "Não foi possível registrar",
          description: "Verifique se a biometria está configurada no seu aparelho.",
          type: "error",
        });
      }
    } finally {
      setIsRegistering(false);
    }
  };

  const handleSkip = () => {
    router.replace(nextUrl);
  };

  // Enquanto verifica compatibilidade (computador sem digital vs com digital), exibe tela limpa com spinner
  if (isCheckingCompatibility) {
    return (
      <main className="min-h-dvh flex items-center justify-center bg-[var(--canvas)] p-4">
        <div className="flex flex-col items-center gap-3">
          <Spinner className="size-8 text-[var(--brand-900)]" />
          <span className="text-xs font-medium text-[var(--text-secondary)]">
            Iniciando seu acesso...
          </span>
        </div>
      </main>
    );
  }

  // Se o dispositivo não for compatível, não renderiza nada pois já está redirecionando
  if (!isSupported) {
    return null;
  }

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center bg-[var(--canvas)] p-4 sm:p-6 relative overflow-hidden">
      {/* Background radial glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-brand-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md flex flex-col items-center relative z-10">
        <div className="mb-6">
          <Brand />
        </div>

        <div className="w-full bg-[var(--surface)] border border-[var(--border-subtle)] rounded-3xl p-6 sm:p-8 shadow-xl shadow-black/5 flex flex-col items-center text-center">
          {isSuccess ? (
            <div className="flex flex-col items-center py-6 animate-in fade-in zoom-in duration-300">
              <div className="size-20 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center mb-4">
                <CheckCircle2 className="size-10" />
              </div>
              <h2 className="text-xl font-bold text-[var(--text-primary)]">
                Biometria ativada com sucesso!
              </h2>
              <p className="text-xs text-[var(--text-secondary)] mt-2 max-w-xs">
                Seu aparelho agora está configurado para acesso rápido. Entrando na aplicação...
              </p>
              <div className="mt-6 flex items-center gap-2 text-xs font-semibold text-[var(--brand-900)]">
                <Spinner className="size-4" />
                <span>Carregando sua área...</span>
              </div>
            </div>
          ) : (
            <>
              {/* Ícone de biometria com anéis concêntricos modernos */}
              <div className="relative mb-5 flex items-center justify-center">
                <div className="size-20 rounded-2xl bg-brand-50 border border-brand-200 text-brand-900 flex items-center justify-center shadow-inner">
                  <Fingerprint className="size-10 text-[var(--brand-900)]" />
                </div>
                <div className="absolute -bottom-1 -right-1 size-7 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-md">
                  <ShieldCheck className="size-4" />
                </div>
              </div>

              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-50 border border-brand-100 text-brand-900 text-[11px] font-semibold mb-2">
                <span>Acesso Seguro</span>
              </div>

              <h1 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">
                Deseja ativar o acesso por biometria?
              </h1>

              <p className="text-xs text-[var(--text-secondary)] mt-2 leading-relaxed max-w-sm">
                Olá, <strong>{userName || "colaborador"}</strong>! Você pode entrar no Tarefaí em 1 toque usando sua impressão digital ou reconhecimento facial, sem precisar digitar sua senha ou PIN.
              </p>

              {/* Botões de Ação */}
              <div className="w-full flex flex-col gap-2.5 pt-5">
                <Button
                  onClick={handleRegisterBiometrics}
                  disabled={isRegistering}
                  className="w-full h-12 bg-brand-900 hover:bg-brand-700 text-white font-semibold text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
                >
                  {isRegistering ? (
                    <>
                      <Spinner className="size-4" />
                      <span>Toque no sensor biométrico...</span>
                    </>
                  ) : (
                    <>
                      <Fingerprint className="size-4" />
                      <span>Ativar biometria neste aparelho</span>
                    </>
                  )}
                </Button>

                <Button
                  variant="ghost"
                  onClick={handleSkip}
                  disabled={isRegistering}
                  className="w-full h-11 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-xl"
                >
                  <span>Agora não, continuar</span>
                  <ArrowRight className="size-3.5 ml-1" />
                </Button>
              </div>
            </>
          )}
        </div>

        <p className="text-[11px] text-[var(--text-secondary)] text-center mt-4">
          Você pode gerenciar ou desativar a biometria a qualquer momento no seu perfil.
        </p>
      </div>
    </main>
  );
}
