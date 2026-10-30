"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import type { ConnectionDTO } from "@/domain/whatsapp/contracts";

interface WhatsAppConnectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instance?: { name: string; location: { name: string } };
  connection: ConnectionDTO | null;
  busy: boolean;
  error: string | null;
  realtimeUnavailable: boolean;
  onConnect: () => void;
  onRefresh: () => void;
  onDisconnect: () => void;
}

const statusLabels: Record<string, string> = {
  PENDING: "Não conectada",
  STARTING: "Conectando",
  SCAN_QR_CODE: "Aguardando leitura",
  WORKING: "Conectada",
  STOPPED: "Desconectada",
  FAILED: "Conexão interrompida",
};

export function WhatsAppConnectionDialog({ open, onOpenChange, instance, connection, busy, error, realtimeUnavailable, onConnect, onRefresh, onDisconnect }: WhatsAppConnectionDialogProps) {
  const status = connection?.status || "PENDING";
  const connected = status === "WORKING";
  const scanning = status === "SCAN_QR_CODE";
  const preparing = busy || status === "STARTING";
  const canDisconnect = connected || scanning || status === "STARTING";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-[480px] [&>[data-slot=dialog-close]]:top-4 [&>[data-slot=dialog-close]]:right-4">
        <DialogHeader className="shrink-0 px-6 pt-6 pr-14 pb-4">
          <DialogTitle>WhatsApp</DialogTitle>
          <DialogDescription className="break-words">
            {instance ? <>{instance.name}<span aria-hidden="true"> · </span>{instance.location.name}</> : "Conexão da unidade"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-col gap-6 overflow-y-auto overscroll-contain px-6 pb-6" aria-busy={busy}>
          <div className="flex items-center justify-between gap-3">
            <div aria-live="polite" aria-atomic="true">
              <Badge variant={status === "FAILED" ? "destructive" : connected ? "secondary" : "outline"}>
                {connected ? statusLabels.WORKING : busy ? "Atualizando…" : statusLabels[status] || "Verificar conexão"}
              </Badge>
            </div>
            <Button type="button" variant="ghost" size="sm" aria-label="Atualizar status e QR code" disabled={busy} onClick={onRefresh}>
              Atualizar
            </Button>
          </div>

          {connected ? (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <div aria-hidden="true" className="flex size-14 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                <svg className="size-7" viewBox="0 0 24 24" fill="currentColor"><path d="M9.2 17.5 3.7 12l2.1-2.1 3.4 3.4 9-9 2.1 2.1-11.1 11.1Z" /></svg>
              </div>
              <div className="flex max-w-xs flex-col gap-2">
                <p className="text-base font-semibold text-foreground">Conexão ativa</p>
                <p className="text-sm leading-relaxed text-muted-foreground">Este WhatsApp está pronto para enviar os alertas da unidade.</p>
              </div>
            </div>
          ) : scanning || preparing ? (
            <div className="flex flex-col items-center gap-5">
              <div className="flex aspect-square w-64 max-w-full items-center justify-center rounded-xl border border-border bg-muted/40 p-3">
                {connection?.qr ? (
                  <img src={connection.qr} alt="QR code para conectar o WhatsApp desta unidade" className="block size-full rounded-md object-contain" />
                ) : (
                  <div className="flex flex-col items-center gap-4 px-2 text-center">
                    <Spinner aria-hidden="true" className="size-8" />
                    <p role="status" className="text-sm text-muted-foreground">Preparando QR code…</p>
                  </div>
                )}
              </div>
              <p className="max-w-xs text-center text-sm leading-relaxed text-muted-foreground">
                No WhatsApp, abra <span className="font-medium text-foreground">Aparelhos conectados</span> e escaneie o código.
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <p className="text-base font-semibold text-foreground">{status === "FAILED" ? "Reconectar WhatsApp" : "Conecte o WhatsApp da unidade"}</p>
              <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">{status === "FAILED" ? "Gere um novo QR code para restabelecer a conexão." : "Gere o QR code e vincule sua conta pelo celular."}</p>
            </div>
          )}

          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          {realtimeUnavailable && !error && <p role="status" className="text-center text-xs leading-relaxed text-muted-foreground">Atualização automática indisponível. Use Atualizar para conferir o status.</p>}
        </div>

        <DialogFooter className="m-0 shrink-0 flex-row items-center justify-between rounded-none px-6 py-4 sm:justify-between">
          {canDisconnect ? <Button type="button" variant="ghost" disabled={busy} onClick={onDisconnect}>Desconectar</Button> : <span />}
          {connected ? (
            <DialogClose render={<Button type="button" size="lg" />}>Concluir</DialogClose>
          ) : canDisconnect || preparing ? (
            <DialogClose render={<Button type="button" variant="outline" size="lg" />}>Fechar</DialogClose>
          ) : (
            <Button type="button" size="lg" disabled={busy} onClick={onConnect}>{status === "FAILED" ? "Tentar novamente" : "Conectar WhatsApp"}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
