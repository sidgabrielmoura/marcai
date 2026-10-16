"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Fingerprint, CheckCircle2 } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { startRegistration } from "@simplewebauthn/browser";
import {
  generateWebAuthnRegistration,
  verifyWebAuthnRegistration,
} from "@/presentation/actions/webauthn-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface BiometricSetupProps {
  hasBiometricsEnabled: boolean;
}

export function BiometricSetup({ hasBiometricsEnabled }: BiometricSetupProps) {
  const [isPending, setIsPending] = useState(false);
  const [isEnabled, setIsEnabled] = useState(hasBiometricsEnabled);

  const handleRegister = async () => {
    setIsPending(true);
    try {
      const options = await generateWebAuthnRegistration();
      const attResp = await startRegistration({ optionsJSON: options });
      const verification = await verifyWebAuthnRegistration(attResp);

      if (verification?.error) {
        toast.add({
          title: "Falha ao registrar",
          description: verification.error,
          type: "error",
        });
      } else if (verification?.success) {
        setIsEnabled(true);
        toast.add({
          title: "Biometria ativada",
          description: "Você já pode usar a biometria no próximo acesso.",
          type: "success",
        });
      }
    } catch (err: any) {
      if (err?.digest?.startsWith("NEXT_REDIRECT") || err?.message === "NEXT_REDIRECT") {
        return;
      }
      if (err.name === "NotAllowedError") {
        toast.add({
          title: "Operação cancelada",
          description: "O registro da biometria foi cancelado.",
          type: "error",
        });
      } else {
        toast.add({
          title: "Erro inesperado",
          description: "Não foi possível registrar a biometria no seu dispositivo.",
          type: "error",
        });
      }
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Card className="bg-[var(--surface)] rounded-[18px] p-5 shadow-none border border-[var(--border-subtle)] ring-0">
      <CardHeader className="p-0 mb-2">
        <CardTitle className="text-[length:var(--type-body)] font-bold text-[var(--text-secondary)] flex items-center gap-1.5">
          <Fingerprint className="size-4 text-[var(--brand-700)]" />
          <span>Acesso Biométrico</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 mt-3">
        {isEnabled ? (
          <div className="flex items-center gap-3 p-3 bg-brand-50 border border-brand-200 rounded-[14px]">
            <CheckCircle2 className="size-5 text-brand-700" />
            <span className="text-brand-900 font-semibold text-[length:var(--type-label)]">
              Existe uma chave de acesso cadastrada na sua conta. A disponibilidade neste aparelho depende do autenticador.
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-[length:var(--type-label)] text-[var(--text-secondary)]">
              Ative a biometria do seu aparelho para acessar sua conta de forma mais rápida e segura.
            </p>
            <Button
              onClick={handleRegister}
              disabled={isPending}
              variant="outline"
              className="w-full h-[44px] rounded-[12px] font-semibold flex items-center justify-center gap-2 cursor-pointer"
            >
              {isPending ? (
                <>
                  <Spinner />
                  <span>Configurando...</span>
                </>
              ) : (
                <>
                  <Fingerprint className="size-4" />
                  <span>Habilitar Biometria</span>
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Alias for backward compatibility
export const FaceIdSetup = ({ hasFaceIdEnabled }: { hasFaceIdEnabled: boolean }) => (
  <BiometricSetup hasBiometricsEnabled={hasFaceIdEnabled} />
);
