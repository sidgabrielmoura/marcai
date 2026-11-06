"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { sendCurrentSessionPushTestAction } from "@/presentation/actions/push-notification-actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";

export function NotificationStatus({ sessionId }: { sessionId: string }) {
  const push = usePushNotifications(sessionId);
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  useEffect(() => {
    push.refresh();
    window.addEventListener("focus", push.refresh);
    return () => window.removeEventListener("focus", push.refresh);
  }, [push.refresh]);
  const health = !push.isSupported ? { badge: "Indisponível", title: "Este navegador não oferece notificações", description: "Use um navegador compatível para receber avisos. No iPhone, adicione o Tarefaí à Tela de Início e abra por esse atalho." }
    : push.permission === "denied" ? { badge: "Bloqueados", title: "Os avisos estão desativados", description: "As notificações do Tarefaí foram desligadas nas permissões deste site. Ative-as para saber quando uma tarefa chegar." }
    : push.permission === "default" ? { badge: "Falta permitir", title: "Permita os avisos", description: "Autorize as notificações para saber na hora quando uma tarefa chegar, for liberada ou precisar de correção." }
    : !push.isSubscribed ? { badge: "Conectando", title: "Quase pronto", description: "A permissão foi concedida, mas este navegador ainda não foi conectado aos avisos. Verifique a internet e tente de novo." }
    : { badge: "Tudo certo", title: "Você vai receber os avisos", description: "Este navegador está pronto para receber novas tarefas, liberações e pedidos de correção." };
  const sendTest = async () => {
    setBusy(true); setTestError(null);
    try {
      const result = await sendCurrentSessionPushTestAction(sessionId);
      if (result.error) setTestError(result.error);
      else toast.add({ type: "success", title: "Teste enviado", description: "O aviso deve chegar em alguns segundos. Se não chegar, confira o modo Foco e os ajustes do aparelho." });
    } catch { setTestError("Não foi possível enviar o teste. Tente novamente."); }
    finally { setBusy(false); }
  };
  return <div className="page-stack employee-notification-status">
    <header><Button variant="ghost" size="icon" aria-label="Voltar aos avisos" render={<Link href="/notifications" />}><ArrowLeft /></Button><h1>Estado dos avisos</h1></header>
    <Card><CardHeader><CardTitle>Avisos neste aparelho</CardTitle></CardHeader><CardContent>
      <Badge variant={push.permission === "denied" ? "destructive" : "secondary"}>{health.badge}</Badge>
      <strong>{health.title}</strong><p>{health.description}</p>
      {push.lastSyncAt && <p>Última verificação: {new Date(push.lastSyncAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>}
      {push.error && <p role="alert">{push.error}</p>}
      {push.isSupported && push.permission === "default" && <Button disabled={push.isSubscribing} onClick={() => { void push.subscribe(); }}>{push.isSubscribing && <Spinner data-icon="inline-start" />}Permitir notificações</Button>}
      {push.permission === "denied" && <Button onClick={() => setSettings(!settings)}>Como ativar no navegador</Button>}
      {push.permission === "granted" && <Button variant="outline" disabled={push.isSubscribing} onClick={() => { void push.subscribe(); }}>{push.isSubscribing && <Spinner data-icon="inline-start" />}{push.isSubscribed ? "Verificar novamente" : "Tentar conectar de novo"}</Button>}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Testar os avisos</CardTitle></CardHeader><CardContent>
      <p>Envie um aviso de teste para confirmar que as notificações aparecem neste aparelho.</p>
      <Button variant="outline" disabled={busy || !push.isSubscribed} onClick={() => { void sendTest(); }}>{busy && <Spinner data-icon="inline-start" />}Enviar teste para este aparelho</Button>
      {!push.isSubscribed && <p>O teste fica disponível quando o aparelho estiver pronto para receber avisos.</p>}
      {testError && <p role="alert">{testError}</p>}
    </CardContent></Card>
    {push.isSupported && push.permission !== "denied" && <Card><CardHeader><CardTitle>Preferências</CardTitle></CardHeader><CardContent><p>Escolha som, banners e exibição na tela bloqueada nos ajustes do aparelho.</p><Button variant="outline" onClick={() => setSettings(!settings)}>Como ajustar as notificações</Button></CardContent></Card>}
    {settings && <p role="status">Abra as permissões deste site pelo ícone ao lado do endereço e permita “Notificações”. No aparelho, confira também as notificações do navegador ou do Tarefaí instalado na Tela de Início.</p>}
    <p>Modo Foco, economia de bateria e falta de conexão podem atrasar um aviso. Todos eles continuam salvos na central de avisos.</p>
  </div>;
}
