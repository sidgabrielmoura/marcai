"use client";
import { clearEmployeeDrafts } from "@/presentation/lib/employee-drafts";

import { useState, useActionState, useEffect } from "react";
import Link from "next/link";
import { Brand } from "@/presentation/components/shared/brand";
import {
  loginWithPasswordAction,
  loginWithPinAction,
  AuthState,
  loginWithMobileSessionAction,
} from "@/presentation/actions/auth-actions";
import {
  generateMobileAuthTokenAction,
  checkMobileAuthTokenAction,
} from "@/presentation/actions/mobile-auth-actions";
import {
  Lock,
  Mail,
  KeyRound,
  Building2,
  UserCircle,
  ArrowRight,
  HelpCircle,
  Fingerprint,
  QrCode,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { startAuthentication } from "@simplewebauthn/browser";
import {
  generateWebAuthnAuthentication,
  verifyWebAuthnAuthentication,
} from "@/presentation/actions/webauthn-actions";
import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
} from "@/components/ui/input-group";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { toast } from "@/components/ui/toast";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

import { QRCodeSVG } from "qrcode.react";

export default function LoginPage() {
  useEffect(() => { void clearEmployeeDrafts().catch(() => { }); }, []);
  const [tab, setTab] = useState<"pin" | "password" | "biometrics">("pin");
  const [isBiometricsPending, setIsBiometricsPending] = useState(false);

  // Mobile & Platform compatibility state
  const [isMobile, setIsMobile] = useState(true);
  const [isPlatformBiometricAvailable, setIsPlatformBiometricAvailable] = useState<boolean | null>(null);
  const [showQrOnDesktop, setShowQrOnDesktop] = useState(false);

  // QR Auth State
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string>("");
  const [isQrLoading, setIsQrLoading] = useState(false);
  const [qrExpiresAt, setQrExpiresAt] = useState(0);
  const [qrExpired, setQrExpired] = useState(false);

  const [passwordState, passwordFormAction, isPasswordPending] = useActionState<
    AuthState,
    FormData
  >(loginWithPasswordAction, {});

  const [pinState, pinFormAction, isPinPending] = useActionState<
    AuthState,
    FormData
  >(loginWithPinAction, {});

  useEffect(() => {
    // Detect mobile device
    const checkIsMobile = () => {
      const userAgent =
        typeof window !== "undefined" ? window.navigator.userAgent : "";
      return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        userAgent
      );
    };
    setIsMobile(checkIsMobile());

    // Check platform biometric support on current device/computer
    if (
      typeof window !== "undefined" &&
      window.PublicKeyCredential &&
      typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === "function"
    ) {
      window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
        .then((available) => setIsPlatformBiometricAvailable(available))
        .catch(() => setIsPlatformBiometricAvailable(false));
    } else {
      setIsPlatformBiometricAvailable(false);
    }
  }, []);

  useEffect(() => {
    if (pinState?.error) {
      toast.add({
        title: "Não foi possível entrar",
        description: pinState.error,
        type: "error",
      });
    }
  }, [pinState]);

  useEffect(() => {
    if (passwordState?.error) {
      toast.add({
        title: "Não foi possível entrar",
        description: passwordState.error,
        type: "error",
      });
    }
  }, [passwordState]);

  // Handle QR code token generation and polling on desktop when applicable
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    let inFlight = false;
    let attempts = 0;

    const shouldShowQR =
      tab === "biometrics" &&
      !isMobile &&
      (isPlatformBiometricAvailable === false || showQrOnDesktop);

    if (shouldShowQR && !qrToken) {
      const initQR = async () => {
        setIsQrLoading(true);
        try {
          const res = await generateMobileAuthTokenAction();
          if (!cancelled && res?.token) {
            setQrToken(res.token);
            setQrExpiresAt(Date.parse(res.expiresAt));
            setQrExpired(false);
            setQrUrl(`${window.location.origin}/login/qr/${res.token}`);
          }
        } catch (err) {
          console.error(err);
        } finally {
          if (!cancelled) setIsQrLoading(false);
        }
      };
      initQR();
    }

    async function checkQR() {
      if (cancelled || document.hidden || inFlight || !qrToken || !shouldShowQR || qrExpired) return;
      if (Date.now() >= qrExpiresAt) { setQrExpired(true); return; }
      inFlight = true;
      let continuePolling = true;
        try {
          const status = await checkMobileAuthTokenAction(qrToken);
          if (cancelled) return;
          if (status === "INVALID") { continuePolling = false; setQrExpired(true); return; }
          if (status === "APPROVED") {
            continuePolling = false;
            // Execute login
            const result = await loginWithMobileSessionAction(qrToken);
            if (result?.error) {
              toast.add({
                title: "Falha na autenticação via QR",
                description: result.error,
                type: "error",
              });
            } else if (result?.redirectUrl) {
              window.location.href = result.redirectUrl;
            }
          }
        } catch (e: any) {
          if (!e?.digest?.startsWith("NEXT_REDIRECT") && e?.message !== "NEXT_REDIRECT") {
            console.error(e);
          }
        } finally {
          inFlight = false;
          if (continuePolling && !cancelled && !document.hidden) timer = setTimeout(checkQR, Math.min(10000, 2000 + ++attempts * 500));
        }
    }

    const onVisibility = () => { if (timer) clearTimeout(timer); if (!document.hidden) void checkQR(); };
    document.addEventListener("visibilitychange", onVisibility);
    if (qrToken && shouldShowQR && !qrExpired) timer = setTimeout(checkQR, 2000);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [tab, isMobile, qrToken, qrExpiresAt, qrExpired, isPlatformBiometricAvailable, showQrOnDesktop]);

  const handleBiometricsLogin = async () => {
    setIsBiometricsPending(true);
    try {
      const options = await generateWebAuthnAuthentication();
      const asseResp = await startAuthentication({ optionsJSON: options });
      const verification = await verifyWebAuthnAuthentication(asseResp);

      if (verification?.error) {
        toast.add({
          title: "Falha na autenticação",
          description: verification.error,
          type: "error",
        });
      } else if (verification?.redirectUrl) {
        window.location.href = verification.redirectUrl;
        return;
      }
    } catch (err: any) {
      if (err?.digest?.startsWith("NEXT_REDIRECT") || err?.message === "NEXT_REDIRECT") {
        return;
      }
      if (err.name === "NotAllowedError") {
        toast.add({
          title: "Autenticação cancelada",
          description: "O processo de biometria foi cancelado.",
          type: "error",
        });
      } else {
        toast.add({
          title: "Erro inesperado",
          description: "Não foi possível iniciar a biometria.",
          type: "error",
        });
      }
    } finally {
      setIsBiometricsPending(false);
    }
  };

  return (
    <div className="auth-frame">
      <aside className="auth-story">
        <div className="bg-[#ffffff] w-fit px-2 py-1 rounded-md">
          <Brand />
        </div>
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
        <div className="w-full max-w-130 mx-auto">
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
              if (
                selected === "pin" ||
                selected === "password" ||
                selected === "biometrics" ||
                selected === "faceid"
              ) {
                setTab(selected === "faceid" ? "biometrics" : selected);
              }
            }}
            className="grid grid-cols-3 p-1 bg-canvas border border-(--border-subtle) rounded-[14px] mb-6 w-full gap-1"
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
              <span>PIN</span>
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
              <Mail className="size-4 text-[var(--brand-700)] hidden sm:block" />
              <span>Senha</span>
            </ToggleGroupItem>
            <ToggleGroupItem
              value="biometrics"
              className={cn(
                "h-[44px] text-[length:var(--type-label)] font-semibold rounded-[10px] transition-all flex items-center justify-center gap-2 cursor-pointer border-0",
                tab === "biometrics"
                  ? "bg-[var(--surface)] text-[var(--brand-900)] shadow-none border border-[var(--border-subtle)] data-[state=on]:bg-[var(--surface)] data-[state=on]:text-[var(--brand-900)] hover:bg-[var(--surface)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--brand-900)]",
              )}
            >
              <Fingerprint className="size-4 text-[var(--brand-700)] hidden sm:block" />
              <span>Biometria</span>
            </ToggleGroupItem>
          </ToggleGroup>

          {tab === "pin" && (
            <form action={pinFormAction} className="flex flex-col gap-4">
              <FieldGroup className="gap-4">
                <Field>
                  <FieldLabel
                    htmlFor="organizationSlug"
                    className="text-[length:var(--type-label)] font-bold text-[var(--text-primary)]"
                  >
                    Identificador da Empresa
                  </FieldLabel>
                  <InputGroup className="h-12 bg-[var(--surface)] border-[var(--border-subtle)] rounded-[12px] focus-within:ring-2 focus-within:ring-[var(--brand-700)] focus-within:border-[var(--brand-700)]">
                    <InputGroupAddon className="text-[var(--text-secondary)] pl-3">
                      <Building2 className="size-5" />
                    </InputGroupAddon>
                    <InputGroupInput
                      id="organizationSlug"
                      name="organizationSlug"
                      type="text"
                      placeholder="Ex: padaria-central"
                      required
                      className="text-[length:var(--type-body)] placeholder:text-[var(--text-secondary)] font-medium"
                    />
                  </InputGroup>
                </Field>

                <Field>
                  <FieldLabel
                    htmlFor="employeeCode"
                    className="text-[length:var(--type-label)] font-bold text-[var(--text-primary)]"
                  >
                    Matrícula
                  </FieldLabel>
                  <InputGroup className="h-12 bg-[var(--surface)] border-[var(--border-subtle)] rounded-[12px] focus-within:ring-2 focus-within:ring-[var(--brand-700)] focus-within:border-[var(--brand-700)]">
                    <InputGroupAddon className="text-[var(--text-secondary)] pl-3">
                      <UserCircle className="size-5" />
                    </InputGroupAddon>
                    <InputGroupInput
                      id="employeeCode"
                      name="employeeCode"
                      type="text"
                      placeholder="Ex: 1001"
                      required
                      className="text-[length:var(--type-body)] placeholder:text-[var(--text-secondary)] font-medium"
                    />
                  </InputGroup>
                </Field>

                <Field>
                  <FieldLabel
                    htmlFor="pin"
                    className="text-[length:var(--type-label)] font-bold text-[var(--text-primary)]"
                  >
                    PIN de Acesso
                  </FieldLabel>
                  <InputGroup className="h-12 bg-[var(--surface)] border-[var(--border-subtle)] rounded-[12px] focus-within:ring-2 focus-within:ring-[var(--brand-700)] focus-within:border-[var(--brand-700)]">
                    <InputGroupAddon className="text-[var(--text-secondary)] pl-3">
                      <Lock className="size-5" />
                    </InputGroupAddon>
                    <InputGroupInput
                      id="pin"
                      name="pin"
                      type="password"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      placeholder="••••••"
                      required
                      className="text-[length:var(--type-body)] placeholder:text-[var(--text-secondary)] tracking-widest font-mono text-center font-bold"
                    />
                  </InputGroup>
                </Field>
              </FieldGroup>

              <Button
                type="submit"
                disabled={isPinPending}
                className="mt-2 w-full h-[50px] bg-[var(--brand-900)] hover:bg-[var(--brand-700)] text-white font-semibold text-[16px] rounded-[14px] shadow-none flex items-center justify-center gap-2 cursor-pointer"
              >
                {isPinPending ? (
                  <>
                    <Spinner data-icon="inline-start" />
                    <span>Entrando...</span>
                  </>
                ) : (
                  <>
                    <span>Entrar no sistema</span>
                    <ArrowRight data-icon="inline-end" />
                  </>
                )}
              </Button>
            </form>
          )}

          {tab === "password" && (
            <form action={passwordFormAction} className="flex flex-col gap-4">
              <FieldGroup className="gap-4">
                <Field>
                  <FieldLabel
                    htmlFor="email"
                    className="text-[length:var(--type-label)] font-bold text-[var(--text-primary)]"
                  >
                    E-mail
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
                      required
                      className="text-[length:var(--type-body)] placeholder:text-[var(--text-secondary)] font-medium"
                    />
                  </InputGroup>
                </Field>

                <Field>
                  <FieldLabel
                    htmlFor="password"
                    className="text-[length:var(--type-label)] font-bold text-[var(--text-primary)]"
                  >
                    Senha
                  </FieldLabel>
                  <InputGroup className="h-12 bg-[var(--surface)] border-[var(--border-subtle)] rounded-[12px] focus-within:ring-2 focus-within:ring-[var(--brand-700)] focus-within:border-[var(--brand-700)]">
                    <InputGroupAddon className="text-[var(--text-secondary)] pl-3">
                      <Lock className="size-5" />
                    </InputGroupAddon>
                    <InputGroupInput
                      id="password"
                      name="password"
                      type="password"
                      placeholder="••••••••"
                      required
                      className="text-[length:var(--type-body)] placeholder:text-[var(--text-secondary)] font-medium"
                    />
                  </InputGroup>
                </Field>

                <Collapsible className="w-full">
                  <CollapsibleTrigger className="text-xs text-[var(--text-secondary)] hover:text-[var(--brand-900)] flex items-center gap-1 font-semibold cursor-pointer select-none">
                    <Building2 className="size-3.5" />
                    <span>Entrar em organização específica (opcional)</span>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2">
                    <Field>
                      <InputGroup className="h-11 bg-[var(--surface)] border-[var(--border-subtle)] rounded-[10px] focus-within:ring-2 focus-within:ring-[var(--brand-700)] focus-within:border-[var(--brand-700)]">
                        <InputGroupAddon className="text-[var(--text-secondary)] pl-3 text-xs">
                          Empresa:
                        </InputGroupAddon>
                        <InputGroupInput
                          id="companySlug"
                          name="organizationSlug"
                          type="text"
                          placeholder="slug-da-empresa"
                          className="text-xs placeholder:text-[var(--text-secondary)] font-medium"
                        />
                      </InputGroup>
                    </Field>
                  </CollapsibleContent>
                </Collapsible>
              </FieldGroup>

              <Button
                type="submit"
                disabled={isPasswordPending}
                className="mt-2 w-full h-[50px] bg-[var(--brand-900)] hover:bg-[var(--brand-700)] text-white font-semibold text-[16px] rounded-[14px] shadow-none flex items-center justify-center gap-2 cursor-pointer"
              >
                {isPasswordPending ? (
                  <>
                    <Spinner data-icon="inline-start" />
                    <span>Autenticando...</span>
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

          {tab === "biometrics" && (
            <div className="flex flex-col items-center gap-4 py-8">
              {isMobile ? (
                <>
                  <div className="size-16 rounded-full bg-brand-50 flex items-center justify-center mb-2">
                    <Fingerprint className="size-8 text-brand-700" />
                  </div>
                  <p className="text-center text-[var(--text-secondary)] text-[length:var(--type-body)] max-w-[280px]">
                    Acesse rapidamente usando a biometria cadastrada no seu aparelho.
                  </p>
                  <Button
                    onClick={handleBiometricsLogin}
                    disabled={isBiometricsPending}
                    className="mt-4 w-full h-[50px] bg-[var(--brand-900)] hover:bg-[var(--brand-700)] text-white font-semibold text-[16px] rounded-[14px] shadow-none flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isBiometricsPending ? (
                      <>
                        <Spinner data-icon="inline-start" />
                        <span>Aguardando biometria...</span>
                      </>
                    ) : (
                      <>
                        <Fingerprint data-icon="inline-start" />
                        <span>Autenticar com biometria</span>
                      </>
                    )}
                  </Button>
                </>
              ) : isPlatformBiometricAvailable ? (
                // Computador com suporte nativo a biometria/digital (ex: Mac Touch ID, Windows Hello)
                <>
                  {!showQrOnDesktop ? (
                    <>
                      <div className="size-16 rounded-full bg-brand-50 flex items-center justify-center mb-2">
                        <Fingerprint className="size-8 text-brand-700" />
                      </div>
                      <div className="text-center">
                        <h2 className="text-lg font-semibold text-gray-900">
                          Biometria neste computador
                        </h2>
                        <p className="text-sm text-gray-500 mt-1 max-w-[320px]">
                          Use o leitor de digital ou reconhecimento do seu computador para entrar em 1 clique.
                        </p>
                      </div>

                      <Button
                        onClick={handleBiometricsLogin}
                        disabled={isBiometricsPending}
                        className="mt-2 w-full h-[50px] bg-[var(--brand-900)] hover:bg-[var(--brand-700)] text-white font-semibold text-[16px] rounded-[14px] shadow-none flex items-center justify-center gap-2 cursor-pointer"
                      >
                        {isBiometricsPending ? (
                          <>
                            <Spinner data-icon="inline-start" />
                            <span>Aguardando biometria...</span>
                          </>
                        ) : (
                          <>
                            <Fingerprint data-icon="inline-start" />
                            <span>Entrar com digital neste computador</span>
                          </>
                        )}
                      </Button>

                      <button
                        type="button"
                        onClick={() => setShowQrOnDesktop(true)}
                        className="mt-2 text-xs text-brand-700 hover:text-brand-900 font-semibold underline underline-offset-4 cursor-pointer"
                      >
                        Prefere entrar escaneando QR Code com o celular?
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="text-center mb-2">
                        <h2 className="text-lg font-semibold text-gray-900">
                          Acesse com a biometria do celular
                        </h2>
                        <p className="text-sm text-gray-500 mt-1 max-w-[280px]">
                          Escaneie o QR code com a câmera do seu celular para fazer login.
                        </p>
                      </div>

                      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center justify-center min-h-[200px]">
                        {qrExpired ? (
                          <div className="flex flex-col items-center gap-3"><p className="text-sm text-gray-500">Este código expirou.</p><Button type="button" onClick={() => { setQrExpired(false); setQrToken(null); setQrUrl(""); }}>Gerar novo código</Button></div>
                        ) : isQrLoading || !qrUrl ? (
                          <div className="flex flex-col items-center gap-2">
                            <Spinner />
                            <span className="text-sm text-gray-500">Gerando QR Code...</span>
                          </div>
                        ) : (
                          <QRCodeSVG value={qrUrl} size={200} />
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => setShowQrOnDesktop(false)}
                        className="mt-2 text-xs text-brand-700 hover:text-brand-900 font-semibold underline underline-offset-4 cursor-pointer"
                      >
                        Voltar para biometria no computador
                      </button>
                    </>
                  )}
                </>
              ) : (
                // Computador sem suporte a leitor biométrico nativo (apenas desktop tradicional)
                <>
                  <div className="text-center mb-2">
                    <h2 className="text-lg font-semibold text-gray-900">
                      Acesse com a biometria do celular
                    </h2>
                    <p className="text-sm text-gray-500 mt-1 max-w-[300px]">
                      Este computador não possui leitor de digital. Escaneie o QR code com a câmera do seu celular para entrar.
                    </p>
                  </div>

                  <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center justify-center min-h-[200px]">
                    {qrExpired ? (
                      <div className="flex flex-col items-center gap-3"><p className="text-sm text-gray-500">Este código expirou.</p><Button type="button" onClick={() => { setQrExpired(false); setQrToken(null); setQrUrl(""); }}>Gerar novo código</Button></div>
                    ) : isQrLoading || !qrUrl ? (
                      <div className="flex flex-col items-center gap-2">
                        <Spinner />
                        <span className="text-sm text-gray-500">Gerando QR Code...</span>
                      </div>
                    ) : (
                      <QRCodeSVG value={qrUrl} size={200} />
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          <div className="mt-6 pt-4 border-t border-[var(--border-subtle)] flex items-start gap-2.5 text-[length:var(--type-label)] text-[var(--text-secondary)]">
            <HelpCircle className="size-4 shrink-0 text-[var(--brand-700)] mt-0.5" />
            <p className="leading-snug">
              Esqueceu seu PIN ou precisa de ajuda? Fale com o responsável pela
              sua unidade.
            </p>
          </div>

          <div className="mt-4 flex items-center justify-center gap-3 text-xs text-[var(--text-secondary)]">
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
