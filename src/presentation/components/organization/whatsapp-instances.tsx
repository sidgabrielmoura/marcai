"use client";

import { useEffect, useRef, useState } from "react";
import { useWhatsAppRealtime } from "@/hooks/use-whatsapp-realtime";
import type { ConnectionDTO } from "@/domain/whatsapp/contracts";
import { WhatsAppQrCache } from "@/presentation/realtime/whatsapp-qr-cache";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { WhatsAppConnectionDialog } from "./whatsapp-connection-dialog";
import { toast } from "@/components/ui/toast";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  createWhatsAppInstanceAction,
  getWhatsAppSettingsAction,
  getWhatsAppQrAction,
  manageWhatsAppInstanceAction,
  saveWhatsAppRecipientsAction,
  sendWhatsAppTestMessageAction,
} from "@/presentation/actions/whatsapp-actions";

type Data = Awaited<ReturnType<typeof getWhatsAppSettingsAction>>;

const statuses: Record<string, string> = {
  PENDING: "Aguardando primeira configuração",
  STARTING: "Iniciando conexão",
  SCAN_QR_CODE: "Aguardando leitura do QR code",
  WORKING: "Conectada",
  STOPPED: "Desconectada",
  FAILED: "Falha na conexão",
};

export function WhatsAppInstances() {
  const [data, setData] = useState<Data | null>(null);
  const [contacts, setContacts] = useState<Array<{ name: string; phone: string }>>([]);
  const [create, setCreate] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<ConnectionDTO | null>(null);
  const version = useRef(0);
  const latestConnection = useRef<{ id: string; status: string; revision: number } | null>(null);
  const qrCache = useRef(new WhatsAppQrCache());
  const openedInstances = useRef(new Set<string>());
  const qrRequests = useRef(new Map<string, ReturnType<typeof getWhatsAppQrAction>>());
  const snapshotRequest = useRef<AbortController | null>(null);
  const [realtimeUnavailable, setRealtimeUnavailable] = useState(false);
  function connectionWon(id: string, revision: number, code?: string) {
    const latest = latestConnection.current;
    return latest?.id === id && latest.status === "WORKING" && latest.revision > revision &&
      (code === undefined || code.startsWith("PROVIDER_") || code === "INVALID_RESPONSE");
  }
  function applyConnection(id: string, value: ConnectionDTO): boolean {
    if (latestConnection.current?.id === id && latestConnection.current.revision > value.revision) return false;
    // A status snapshot or duplicate hint must not replace a still-valid image.
    const saved = qrCache.current.read(id, value.status, value.revision);
    value = value.qr ? value : { ...value, qr: saved?.qr ?? null, qrExpiresAt: saved?.qrExpiresAt ?? null };
    qrCache.current.remember(id, value);
    latestConnection.current = { id, status: value.status, revision: value.revision };
    setConnection(previous => previous && previous.revision > value.revision ? previous : value);
    setData(previous => previous ? {
      ...previous, instances: previous.instances.map((row: any) =>
        row.id === id && row.revision <= value.revision ? { ...row, status: value.status, revision: value.revision } : row)
    } : previous);
    return true;
  }
  const visible = useWhatsAppRealtime(selected, {
    onReady: async resumed => {
      if (!selected) return;
      if (openedInstances.current.has(selected) && ["SCAN_QR_CODE", "STARTING", "WORKING"].includes(latestConnection.current?.status ?? "")) {
        await reconcileSnapshot(selected);
      } else await manage(selected, resumed ? "refresh" : "connect", true);
    },
    onStatus: hint => {
      setRealtimeUnavailable(false);
      if (latestConnection.current?.id !== hint.instanceId || hint.revision < latestConnection.current.revision) return;
      setError(null);
      applyConnection(hint.instanceId, { status: hint.status, revision: hint.revision, qr: null, qrExpiresAt: null });
    },
    onUnavailable: () => setRealtimeUnavailable(true),
    onAvailable: () => setRealtimeUnavailable(false),
  });
  useEffect(() => {
    if (!visible) {
      ++version.current;
      snapshotRequest.current?.abort();
      setBusy(false);
      setConnection(previous => previous ? { ...previous, qr: null } : previous);
    }
  }, [visible]);
  useEffect(() => () => {
    ++version.current;
    snapshotRequest.current?.abort();
    qrCache.current.clear();
  }, []);
  // Expire the displayed image even if another operation is still pending.
  useEffect(() => {
    if (!selected || !connection?.qr || !connection.qrExpiresAt) return;
    const expiresAt = connection.qrExpiresAt;
    const timer = setTimeout(() => setConnection(previous => previous?.qrExpiresAt === expiresAt ? { ...previous, qr: null } : previous), Math.max(0, expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [selected, connection?.qr, connection?.qrExpiresAt]);
  useEffect(() => {
    if (!selected || !visible || busy || error || connection?.status !== "SCAN_QR_CODE") return;
    const request = version.current;
    const timer = setTimeout(async () => {
      const revision = latestConnection.current?.revision ?? 0;
      if (latestConnection.current?.status !== "SCAN_QR_CODE") return;
      setBusy(true);
      setConnection(previous => previous ? { ...previous, qr: null, qrExpiresAt: null } : previous);
      try {
        let work = qrRequests.current.get(selected);
        if (!work) {
          work = getWhatsAppQrAction(selected).finally(() => { qrRequests.current.delete(selected); });
          qrRequests.current.set(selected, work);
        }
        const result = await work;
        if (request !== version.current) return;
        if (result.error) { if (!connectionWon(selected, revision, result.code)) { qrCache.current.forget(selected); setError(result.error); } }
        else if (result.data) {
          if (!applyConnection(selected, result.data)) return;
          if (!result.data.qr && result.data.status === "SCAN_QR_CODE" && !connectionWon(selected, revision)) setError("QR code indisponível. Atualize a conexão para tentar novamente.");
        }
      } catch { if (request === version.current && !connectionWon(selected, revision)) setError("Não foi possível renovar o QR code. Atualize a conexão."); }
      finally { if (request === version.current) setBusy(false); }
    }, connection.qrExpiresAt ? Math.max(0, connection.qrExpiresAt - Date.now()) : 0);
    return () => clearTimeout(timer);
  }, [selected, visible, busy, error, connection?.status, connection?.qrExpiresAt]);

  const hasUnsavedContacts =
    !!data &&
    (contacts.length !== data.recipients.length ||
      contacts.some(
        (contact, index) =>
          contact.name.trim() !== data.recipients[index]?.name ||
          contact.phone.trim() !== data.recipients[index]?.phone,
      ));

  function reportError(message: string) {
    setError(message);
    toast.add({
      title: "Não foi possível concluir a ação",
      description: message,
      type: "error",
    });
  }

  useEffect(() => {
    let active = true;

    getWhatsAppSettingsAction()
      .then(value => {
        if (active) {
          setData(value);
          setContacts(value.recipients);
        }
      })
      .catch(() => {
        if (active) reportError("Não foi possível carregar as instâncias.");
      });

    return () => {
      active = false;
    };
  }, []);

  async function reconcileSnapshot(id: string) {
    const request = ++version.current;
    snapshotRequest.current?.abort();
    const abort = new AbortController();
    snapshotRequest.current = abort;
    setBusy(true);
    setError(null);
    try {
      // Subscribe first, then recover events missed while closed. This endpoint
      // authorizes each request and reads local state only; it never calls WAHA.
      const response = await fetch(`/api/whatsapp/instances/${encodeURIComponent(id)}`, { credentials: "same-origin", cache: "no-store", signal: AbortSignal.any([abort.signal, AbortSignal.timeout(15000)]) });
      if (!response.ok) throw new Error("snapshot-unavailable");
      const result = await response.json() as { data?: { id?: string; status?: string; revision?: number } };
      if (request !== version.current) return;
      const value = result.data;
      if (value?.id !== id || !value.status || !Object.hasOwn(statuses, value.status) || !Number.isSafeInteger(value.revision) || value.revision! < 0) throw new Error("invalid-snapshot");
      applyConnection(id, { status: value.status, revision: value.revision!, qr: null, qrExpiresAt: null });
    } catch {
      if (request !== version.current || abort.signal.aborted) return;
      qrCache.current.forget(id);
      setConnection(previous => previous ? { ...previous, qr: null, qrExpiresAt: null } : previous);
      setError("Não foi possível conferir a conexão. Atualize para tentar novamente.");
    } finally {
      if (request === version.current) setBusy(false);
      if (snapshotRequest.current === abort) snapshotRequest.current = null;
    }
  }

  async function manage(id: string, operation: "connect" | "refresh" | "disconnect", quiet = false) {
    const request = ++version.current;
    snapshotRequest.current?.abort();
    if (operation === "disconnect") {
      qrCache.current.forget(id);
      setConnection(previous => previous ? { ...previous, qr: null, qrExpiresAt: null } : previous);
    }
    const revision = latestConnection.current?.revision ?? 0;
    setBusy(true);
    setError(null);

    try {
      const result = await manageWhatsAppInstanceAction(id, operation);
      if (request !== version.current) return;

      if (result.error) {
        if (operation !== "disconnect" && connectionWon(id, revision, result.code)) return;
        qrCache.current.forget(id);
        setConnection(previous => previous ? { ...previous, qr: null, qrExpiresAt: null } : previous);
        if (quiet) setError(result.error); else reportError(result.error);
      } else if (result.data) {
        if (!applyConnection(id, result.data)) return;
        openedInstances.current.add(id);

        if (result.data.status === "FAILED") {
          if (quiet) setError("A conexão falhou. Clique em Conectar para tentar novamente.");
          else reportError("A conexão falhou. Clique em Conectar para tentar novamente.");
        } else if (!quiet) {
          toast.add({
            title:
              operation === "disconnect"
                ? "WhatsApp desconectado"
                : result.data.status === "WORKING"
                  ? "WhatsApp conectado"
                  : result.data.qr
                    ? "QR code atualizado"
                    : "Status atualizado",
            description: statuses[result.data.status] || "Confira o status da conexão.",
            type: "success",
          });
        }
      }
    } catch {
      if (request === version.current && !(operation !== "disconnect" && connectionWon(id, revision))) { if (quiet) setError("Não foi possível atualizar a conexão."); else reportError("Não foi possível atualizar a conexão."); }
    } finally {
      if (request === version.current) setBusy(false);
    }
  }

  async function saveContacts() {
    if (!hasUnsavedContacts || busy) return;

    setBusy(true);
    setError(null);

    try {
      const result = await saveWhatsAppRecipientsAction(contacts);

      if (result.error) {
        reportError(result.error);
      } else if (result.data) {
        setData(result.data);
        setContacts(result.data.recipients);
        toast.add({
          title: "Destinatários salvos",
          description: "A lista de destinatários foi atualizada com sucesso.",
          type: "success",
        });
      }
    } catch {
      reportError("Não foi possível salvar os destinatários.");
    } finally {
      setBusy(false);
    }
  }

  const hasInstances = Boolean(data?.instances && data.instances.length > 0);
  const hasRecipients = contacts.some(c => c.phone.trim().length >= 8);
  const canTest = hasInstances && hasRecipients && !busy && !testing;

  async function testMessage() {
    if (!canTest) return;

    setTesting(true);
    setError(null);

    try {
      if (hasUnsavedContacts) {
        const saveResult = await saveWhatsAppRecipientsAction(contacts);
        if (saveResult.error) {
          reportError(saveResult.error);
          setTesting(false);
          return;
        }
        if (saveResult.data) {
          setData(saveResult.data);
          setContacts(saveResult.data.recipients);
        }
      }

      const result = await sendWhatsAppTestMessageAction();
      if (result.error) {
        reportError(result.error);
      } else {
        toast.add({
          title: "Mensagem de teste enviada",
          description: `Disparo realizado com sucesso para ${result.data?.sentCount ?? "os"} destinatário(s).`,
          type: "success",
        });
      }
    } catch {
      reportError("Não foi possível enviar a mensagem de teste.");
    } finally {
      setTesting(false);
    }
  }

  async function createInstance() {
    setBusy(true);
    setError(null);

    try {
      const result = await createWhatsAppInstanceAction({ name, locationId: location });

      if (result.error) {
        reportError(result.error);
      } else if (result.data) {
        setData(result.data);
        setName("");
        setLocation("");
        setCreate(false);
        toast.add({
          title: "Instância criada",
          description: "Abra a instância para configurar a conexão com o WhatsApp.",
          type: "success",
        });
      }
    } catch {
      reportError("Não foi possível criar a instância.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="mt-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5 sm:p-7"
      aria-labelledby="whatsapp-instances-title"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 id="whatsapp-instances-title" className="text-base font-semibold">
            Instâncias
          </h3>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Conecte uma conta do WhatsApp para cada unidade.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setError(null);
            setCreate(true);
          }}
          disabled={!data || busy}
        >
          Criar instância
        </Button>
      </div>

      {error && !create && !selected && (
        <p role="alert" className="mt-4 text-sm text-red-700">
          {error}
        </p>
      )}

      {!data ? (
        <p className="mt-5 text-sm text-[var(--text-secondary)]">Carregando instâncias…</p>
      ) : (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {data.instances.map((row: any) => (
              <button
                key={row.id}
                type="button"
                className="rounded-lg border border-[var(--border-subtle)] p-4 text-left transition-colors hover:bg-[var(--canvas)] focus-visible:outline-2 focus-visible:outline-[var(--brand-700)]"
                onClick={() => {
                  ++version.current;
                  snapshotRequest.current?.abort();
                  setSelected(row.id);
                  latestConnection.current = { id: row.id, status: row.status, revision: row.revision };
                  setConnection(qrCache.current.read(row.id, row.status, row.revision) ?? { status: row.status, qr: null, qrExpiresAt: null, revision: row.revision });
                  setError(null);
                  setRealtimeUnavailable(false);
                  setBusy(true);
                }}
              >
                <span className="block text-sm font-semibold">{row.name}</span>
                <span className="mt-1 block text-xs text-[var(--text-secondary)]">
                  {row.location.name}
                </span>
                <span className="mt-3 block text-xs">
                  {statuses[row.status] || "Verificar conexão"}
                </span>
              </button>
            ))}
          </div>

          {!data.instances.length && (
            <p className="py-6 text-sm text-[var(--text-secondary)]">
              Nenhuma instância criada. Escolha uma unidade para começar.
            </p>
          )}

          <div className="mt-6 border-t border-[var(--border-subtle)] pt-6">
            <h4 className="text-sm font-semibold">
              Destinatários dos alertas{" "}
              <span className="font-normal text-[var(--text-secondary)]">
                ({contacts.length}/{data.recipientLimit})
              </span>
            </h4>
            <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
              Estes números recebem os alertas das unidades conectadas. Inclua país e DDD.
            </p>

            <div className="mt-4 flex flex-col gap-3">
              {contacts.map((contact, index) => (
                <div key={index} className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    aria-label={`Nome do destinatário ${index + 1}`}
                    placeholder="Nome (opcional)"
                    value={contact.name}
                    onChange={e =>
                      setContacts(rows =>
                        rows.map((row, i) => (i === index ? { ...row, name: e.target.value } : row)),
                      )
                    }
                  />
                  <PhoneInput
                    aria-label={`Número do destinatário ${index + 1}`}
                    placeholder="+55 (85) 99999-9999"
                    value={contact.phone}
                    disabled={busy}
                    onValueChange={phone =>
                      setContacts(rows =>
                        rows.map((row, i) => (i === index ? { ...row, phone } : row)),
                      )
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => setContacts(rows => rows.filter((_, i) => i !== index))}
                  >
                    Remover
                  </Button>
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={busy || testing || contacts.length >= data.recipientLimit}
                onClick={() => setContacts(rows => [...rows, { name: "", phone: "" }])}
              >
                Adicionar número
              </Button>
              {hasUnsavedContacts && (
                <Button type="button" disabled={busy || testing} onClick={saveContacts}>
                  {busy ? "Salvando…" : "Salvar destinatários"}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                disabled={!canTest}
                onClick={testMessage}
                title={
                  !hasInstances
                    ? "Crie uma instância primeiro para habilitar o teste."
                    : !hasRecipients
                      ? "Cadastre ao menos um destinatário para habilitar o teste."
                      : "Enviar mensagem simples de teste para os destinatários"
                }
              >
                {testing ? "Enviando teste…" : "Enviar mensagem de teste"}
              </Button>
            </div>
          </div>
        </>
      )}

      <Dialog
        open={create}
        onOpenChange={value => {
          if (!busy) setCreate(value);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar instância</DialogTitle>
            <DialogDescription>
              Vincule o WhatsApp a uma unidade. A conexão será feita na próxima etapa.
            </DialogDescription>
          </DialogHeader>

          <label className="flex flex-col gap-2 text-sm">
            Nome da instância
            <Input
              value={name}
              maxLength={80}
              onChange={e => setName(e.target.value)}
              placeholder="Ex.: WhatsApp da unidade Centro"
              className="text-sm! h-11!"
            />
          </label>

          <label className="flex flex-col gap-2 text-sm">
            Unidade
            <NativeSelect
              aria-label="Unidade da instância"
              value={location}
              onChange={e => setLocation(e.target.value)}
            >
              <NativeSelectOption value="">Selecione uma unidade</NativeSelectOption>
              {data?.locations
                .filter((row: any) => !data.instances.some((instance: any) => instance.locationId === row.id))
                .map((row: any) => (
                  <NativeSelectOption key={row.id} value={row.id}>
                    {row.name}
                  </NativeSelectOption>
                ))}
            </NativeSelect>
          </label>

          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}

          <Button
            type="button"
            disabled={busy || name.trim().length < 2 || !location}
            onClick={createInstance}
          >
            {busy ? "Criando…" : "Criar instância"}
          </Button>
        </DialogContent>
      </Dialog>

      <WhatsAppConnectionDialog
        open={!!selected}
        instance={data?.instances.find((row: any) => row.id === selected)}
        connection={connection}
        busy={busy}
        error={error}
        realtimeUnavailable={realtimeUnavailable}
        onOpenChange={open => {
          if (!open) {
            ++version.current;
            snapshotRequest.current?.abort();
            latestConnection.current = null;
            setSelected(null);
            setConnection(null);
            setBusy(false);
          }
        }}
        onConnect={() => { if (selected) void manage(selected, "connect"); }}
        onRefresh={() => { if (selected) void manage(selected, "refresh"); }}
        onDisconnect={() => { if (selected) void manage(selected, "disconnect"); }}
      />
    </section>
  );
}
