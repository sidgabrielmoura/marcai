"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Brand } from "@/presentation/components/shared/brand";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Fingerprint, CheckCircle2 } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { startAuthentication } from "@simplewebauthn/browser";
import {
  generateWebAuthnAuthentication,
  verifyWebAuthnAuthentication,
} from "@/presentation/actions/webauthn-actions";

export default function MobileQRAuthPage() {
  const params = useParams();
  const token = params.token as string;

  const [isPending, setIsPending] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleBiometricsLogin = async () => {
    setIsPending(true);
    setErrorMsg("");
    try {
      const options = await generateWebAuthnAuthentication();
      const asseResp = await startAuthentication({ optionsJSON: options });
      const verification = await verifyWebAuthnAuthentication(asseResp, token);

      if (verification?.error) {
        setErrorMsg(verification.error);
        toast.add({
          title: "Falha na autenticação",
          description: verification.error,
          type: "error",
        });
      } else if (verification?.success) {
        setIsSuccess(true);
        toast.add({
          title: "Sucesso!",
          description: "Login aprovado. Verifique a tela do seu computador.",
          type: "success",
        });
      }
    } catch (err: any) {
      if (err.name === "NotAllowedError") {
        setErrorMsg("Processo de biometria cancelado.");
      } else {
        setErrorMsg("Não foi possível iniciar a biometria. " + err.message);
      }
    } finally {
      setIsPending(false);
    }
  };

  useEffect(() => {
    // Auto-start biometrics if available
    handleBiometricsLogin();
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[var(--canvas)] p-6 text-center">
      <div className="bg-[#ffffff] w-fit px-3 py-1.5 rounded-md mb-8">
        <Brand />
      </div>

      <div className="bg-white rounded-2xl p-6 shadow-sm border border-[var(--border-subtle)] w-full max-w-sm flex flex-col items-center">
        {isSuccess ? (
          <>
            <CheckCircle2 className="size-16 text-emerald-500 mb-4" />
            <h1 className="text-xl font-bold text-gray-900 mb-2">
              Autenticação Concluída
            </h1>
            <p className="text-gray-600">
              Você já pode voltar para a tela do seu computador. Esta janela pode
              ser fechada.
            </p>
          </>
        ) : (
          <>
            <Fingerprint className="size-16 text-[var(--brand-700)] mb-4" />
            <h1 className="text-xl font-bold text-gray-900 mb-2">
              Verificação Necessária
            </h1>
            <p className="text-gray-600 mb-6 text-sm">
              Confirme sua identidade usando a biometria do seu aparelho para acessar o
              painel no computador.
            </p>

            {errorMsg && (
              <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4 w-full">
                {errorMsg}
              </div>
            )}

            <Button
              onClick={handleBiometricsLogin}
              disabled={isPending}
              className="w-full h-[48px] rounded-[14px] font-semibold flex items-center justify-center gap-2"
            >
              {isPending ? (
                <>
                  <Spinner />
                  <span>Verificando...</span>
                </>
              ) : (
                <>
                  <Fingerprint className="size-5" />
                  <span>Tentar Novamente</span>
                </>
              )}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
