export interface OperationalAlertMessageParams {
  organizationName: string;
  title: string;
  message: string;
  type?: string;
  priority?: string | null;
  milestoneStep?: number;
  taskTitle?: string;
  processName?: string;
  locationName?: string;
  teamName?: string;
  actionUrl?: string;
}

/**
 * Formata mensagem operacional para WhatsApp com tipografia rica e emojis
 */
export function formatOperationalAlertMessage(params: OperationalAlertMessageParams): string {
  const isCritical = params.priority === "CRITICAL";
  const priorityBadge = isCritical ? "🚨 *URGENTE / CRÍTICA*" : params.priority ? `⚠️ *${params.priority}*` : "";

  const lines: string[] = [
    `*Tarefaí Alertas* · _${params.organizationName}_`,
    "",
    `🔔 *${params.title}*`,
  ];

  if (priorityBadge) {
    lines.push(priorityBadge);
  }

  if (params.taskTitle) {
    lines.push(`📋 *Tarefa:* ${params.taskTitle}`);
  } else if (params.processName) {
    lines.push(`⚙️ *Processo:* ${params.processName}`);
  }

  if (params.locationName) {
    lines.push(`📍 *Unidade:* ${params.locationName}`);
  }

  if (params.teamName) {
    lines.push(`👥 *Equipe:* ${params.teamName}`);
  }

  if (params.milestoneStep !== undefined && params.milestoneStep > 0) {
    lines.push(`⏱️ *Escalação:* ${params.milestoneStep}º Marco de Atraso`);
  }

  lines.push("");
  lines.push(`📝 *Detalhes:*`);
  lines.push(params.message);

  if (params.actionUrl) {
    lines.push("");
    lines.push(`🔗 *Acessar no sistema:* ${params.actionUrl}`);
  }

  lines.push("");
  lines.push(`_Enviado automaticamente pelo sistema de monitoramento operacional Tarefaí._`);

  return lines.join("\n");
}
