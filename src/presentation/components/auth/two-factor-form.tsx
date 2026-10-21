"use client";

import { useActionState, useEffect, useState, useTransition, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  verifySecondFactorAction,
  regenerateTwoFactorSecretAction,
} from "@/presentation/actions/two-factor-actions";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  InputOTPSeparator,
} from "@/components/ui/input-otp";
import { toast } from "@/components/ui/toast";
import {
  Check,
  Copy,
  RefreshCw,
  ArrowLeft,
  ShieldCheck,
  Smartphone,
  KeyRound,
} from "lucide-react";

interface TwoFactorFormProps {
  secret: string | null;
  qrCodeDataUrl: string | null;
  userEmail?: string | null;
}

export function TwoFactorForm({ secret, qrCodeDataUrl, userEmail }: TwoFactorFormProps) {
  const [state, action, pending] = useActionState(verifySecondFactorAction, {});
  const [code, setCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [showRecovery, setShowRecovery] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isRegenerating, startRegenerate] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (state.error) {
      toast.add({
        title: "Erro de autenticação",
        description: state.error,
        type: "error",
      });
      setCode("");
    }
  }, [state.error]);

  async function handleCopyKey() {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      toast.add({
        title: "Chave copiada",
        description: "Chave copiada para a área de transferência.",
        type: "success",
      });
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  }

  function handleRegenerate() {
    startRegenerate(async () => {
      const res = await regenerateTwoFactorSecretAction();
      if (res?.error) {
        toast.add({ title: "Erro", description: res.error, type: "error" });
      } else {
        toast.add({
          title: "Novo QR Code gerado",
          description: "Escaneie o novo código no Google Authenticator.",
          type: "success",
        });
        setCode("");
        router.refresh();
      }
    });
  }

  function handleOtpChange(val: string) {
    const clean = val.replace(/\D/g, "").slice(0, 6);
    setCode(clean);
    if (clean.length === 6 && formRef.current) {
      setTimeout(() => {
        formRef.current?.requestSubmit();
      }, 60);
    }
  }

  const formattedSecret = secret
    ? secret.match(/.{1,4}/g)?.join(" ") ?? secret
    : "";

  if(state.recoveryCodes?.length)return <div className="flex flex-col gap-4"><h1>Guarde os códigos de recuperação</h1><p>Cada código funciona uma vez. Guarde-os em um local seguro antes de continuar.</p><ul>{state.recoveryCodes.map(code=><li key={code}><code>{code}</code></li>)}</ul><Button onClick={()=>router.replace(state.redirectUrl??"/tasks")}>Guardei os códigos. Continuar</Button></div>;
  return (
    <div className="flex flex-col items-center w-full">
      {/* Header Compacto */}
      <div className="flex flex-col items-center text-center gap-1.5 mb-5">
        <div className="size-11 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 flex items-center justify-center mb-1">
          <ShieldCheck className="size-6" />
        </div>
        <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
          Google Authenticator
        </h1>
        <p className="text-xs text-[var(--text-muted)]">
          {showRecovery
            ? "Digite o código de recuperação"
            : secret ? "Cadastre no autenticador e digite os 6 dígitos" : "Digite os 6 dígitos do seu autenticador"}
        </p>
      </div>

      {/* QR Code Container */}
      {secret && qrCodeDataUrl && !showRecovery && (
        <div className="flex flex-col items-center gap-3 mb-5 w-full">
          <div className="p-3 bg-white rounded-2xl border border-slate-200/90 shadow-sm relative group transition-transform hover:scale-[1.01]">
            <img
              src={qrCodeDataUrl}
              alt="QR Code do Google Authenticator"
              width={180}
              height={180}
              className="size-44 sm:size-48 object-contain rounded-xl block"
            />
          </div>

          {/* Chave manual compacta com botão copiar e regenerar */}
          <div className="flex items-center gap-1.5 max-w-full">
            <button
              type="button"
              onClick={handleCopyKey}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-mono font-medium text-[var(--text-muted)] bg-[var(--surface-muted)] hover:bg-[var(--surface-hover)] border border-[var(--border-subtle)] transition-colors cursor-pointer"
              title="Clique para copiar a chave manual"
            >
              {copied ? (
                <>
                  <Check className="size-3 text-emerald-600" />
                  <span className="text-emerald-600 font-sans font-semibold">Copiada!</span>
                </>
              ) : (
                <>
                  <Copy className="size-3 text-[var(--text-muted)]" />
                  <span className="truncate max-w-[180px]">{formattedSecret}</span>
                </>
              )}
            </button>

            <button
              type="button"
              disabled={isRegenerating}
              onClick={handleRegenerate}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-[var(--surface-muted)] hover:bg-[var(--surface-hover)] border border-[var(--border-subtle)] transition-colors cursor-pointer"
              title="Gerar novo QR Code"
            >
              {isRegenerating ? <Spinner className="size-3" aria-hidden="true" /> : <RefreshCw className="size-3" />}
              <span>Novo QR</span>
            </button>
          </div>
        </div>
      )}

      {/* Formulário com Slots OTP */}
      <form
        ref={formRef}
        action={action}
        className="flex flex-col items-center gap-4 w-full"
      >
        <input
          type="hidden"
          name="code"
          value={showRecovery ? recoveryCode : code}
        />

        {!showRecovery ? (
          <div className="flex justify-center w-full py-1">
            <InputOTP
              maxLength={6}
              value={code}
              onChange={handleOtpChange}
              autoFocus
              inputMode="numeric"
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} className="size-11 sm:size-12 text-lg font-bold" />
                <InputOTPSlot index={1} className="size-11 sm:size-12 text-lg font-bold" />
                <InputOTPSlot index={2} className="size-11 sm:size-12 text-lg font-bold" />
              </InputOTPGroup>
              <InputOTPSeparator />
              <InputOTPGroup>
                <InputOTPSlot index={3} className="size-11 sm:size-12 text-lg font-bold" />
                <InputOTPSlot index={4} className="size-11 sm:size-12 text-lg font-bold" />
                <InputOTPSlot index={5} className="size-11 sm:size-12 text-lg font-bold" />
              </InputOTPGroup>
            </InputOTP>
          </div>
        ) : (
          <div className="w-full">
            <input
              placeholder="XXXX-XXXX"
              value={recoveryCode}
              onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
              className="w-full h-11 px-3 text-center font-mono text-base font-bold tracking-widest rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] text-[var(--text-primary)] uppercase focus:outline-none focus:ring-2 focus:ring-[var(--brand-900)]"
              autoFocus
            />
          </div>
        )}

        <Button
          type="submit"
          className="w-full h-11 text-sm font-semibold rounded-xl bg-[var(--brand-900)] text-white hover:bg-[var(--brand-700)] shadow-sm cursor-pointer mt-1"
          disabled={pending || (showRecovery ? recoveryCode.trim().length < 8 : code.length < 6)}
        >
          {pending ? (
            <span className="inline-flex items-center gap-2">
              <Spinner aria-hidden="true" /> Verificando...
            </span>
          ) : (
            "Confirmar e acessar"
          )}
        </Button>

        {/* Rodapé de navegação */}
        <div className="flex items-center justify-between w-full text-xs text-[var(--text-muted)] pt-1 px-1">
          <Link
            href="/login"
            className="inline-flex items-center gap-1 hover:text-[var(--text-primary)] transition-colors"
          >
            <ArrowLeft className="size-3.5" />
            Voltar ao login
          </Link>

          <button
            type="button"
            onClick={() => {
              setShowRecovery(!showRecovery);
              setCode("");
              setRecoveryCode("");
            }}
            className="hover:text-[var(--text-primary)] transition-colors cursor-pointer"
          >
            {showRecovery ? "Usar código do app" : "Código de recuperação"}
          </button>
        </div>
      </form>
    </div>
  );
}
