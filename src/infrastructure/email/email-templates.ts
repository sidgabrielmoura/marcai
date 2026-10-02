/**
 * Templates de E-mail Transacionais do Marcai.
 * Em conformidade com a skill de email-systems:
 * - Suporte estrito a Multipart (HTML responsivo + Plain Text alternativo)
 * - Preview Text oculto (preheader) para otimização de taxa de abertura
 * - Identidade visual consistente com o design system do Marcai (#1b382b)
 * - Botões bulletproof com compatibilidade universal (Outlook, Apple Mail, Gmail)
 * - Rodapé com compliance, identificação da organização e contexto de segurança
 */

interface BaseLayoutOptions {
  preheader: string;
  badge?: string;
  badgeColor?: "green" | "amber" | "red" | "zinc";
  title: string;
  paragraphs: string[];
  cta?: {
    label: string;
    url: string;
  };
  detailsBox?: Array<{ label: string; value: string }>;
  footerNote?: string;
}

const BRAND = {
  name: "Marcai",
  colorDark: "#1b382b",
  colorAccent: "#2e5c46",
  colorSage: "#eef4f0",
  bgCanvas: "#f5f7f5",
  surfaceCard: "#ffffff",
  textPrimary: "#18231c",
  textSecondary: "#5a6860",
  borderSubtle: "#e2e8e3",
};

/**
 * Monta o layout HTML base compartilhado.
 */
function renderBaseHtmlLayout(opts: BaseLayoutOptions): string {
  const badgeStyles = {
    green: "background-color: #ecfdf5; color: #047857; border: 1px solid #a7f3d0;",
    amber: "background-color: #fffbeb; color: #b45309; border: 1px solid #fde68a;",
    red: "background-color: #fef2f2; color: #b91c1c; border: 1px solid #fecaca;",
    zinc: "background-color: #f4f4f5; color: #3f3f46; border: 1px solid #e4e4e7;",
  };

  const currentYear = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${opts.title}</title>
  <style>
    body { margin: 0; padding: 0; background-color: ${BRAND.bgCanvas}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; }
    table { border-collapse: separate; }
    a { color: ${BRAND.colorDark}; text-decoration: underline; }
  </style>
</head>
<body style="margin: 0; padding: 32px 16px; background-color: ${BRAND.bgCanvas};">
  <!-- Preheader oculto para pré-visualização em clientes de e-mail -->
  <div style="display: none; max-height: 0px; overflow: hidden; font-size: 1px; line-height: 1px; color: #ffffff; opacity: 0;">
    ${opts.preheader}
    &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;
  </div>

  <table width="100%" border="0" cellspacing="0" cellpadding="0" align="center">
    <tr>
      <td align="center">
        <!-- Container Principal -->
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 560px; margin: 0 auto;">
          
          <!-- Cabeçalho / Marca -->
          <tr>
            <td align="center" style="padding: 0 0 24px 0;">
              <table border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="background-color: ${BRAND.colorDark}; color: #ffffff; font-weight: 800; font-size: 20px; letter-spacing: -0.5px; padding: 8px 16px; border-radius: 12px; font-family: -apple-system, BlinkMacSystemFont, sans-serif;">
                    marcai
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card do Conteúdo -->
          <tr>
            <td>
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: ${BRAND.surfaceCard}; border-radius: 18px; border: 1px solid ${BRAND.borderSubtle}; padding: 32px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);">
                
                ${
                  opts.badge
                    ? `<tr>
                    <td style="padding-bottom: 16px;">
                      <span style="display: inline-block; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; padding: 4px 10px; border-radius: 9999px; ${badgeStyles[opts.badgeColor || "green"]}">
                        ${opts.badge}
                      </span>
                    </td>
                  </tr>`
                    : ""
                }

                <tr>
                  <td style="padding-bottom: 16px;">
                    <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: ${BRAND.textPrimary}; line-height: 1.3;">
                      ${opts.title}
                    </h1>
                  </td>
                </tr>

                ${opts.paragraphs
                  .map(
                    (p) => `<tr>
                    <td style="padding-bottom: 14px; font-size: 14px; line-height: 1.6; color: ${BRAND.textSecondary};">
                      ${p}
                    </td>
                  </tr>`
                  )
                  .join("")}

                ${
                  opts.detailsBox && opts.detailsBox.length > 0
                    ? `<tr>
                    <td style="padding: 12px 0 20px 0;">
                      <table width="100%" border="0" cellspacing="0" cellpadding="10" style="background-color: ${BRAND.colorSage}; border-radius: 12px; border: 1px solid ${BRAND.borderSubtle};">
                        ${opts.detailsBox
                          .map(
                            (row) => `<tr>
                            <td width="40%" style="font-size: 13px; font-weight: 600; color: ${BRAND.colorDark}; border-bottom: 1px solid #dfe7e1; padding: 8px 12px;">${row.label}</td>
                            <td width="60%" style="font-size: 13px; color: ${BRAND.textPrimary}; border-bottom: 1px solid #dfe7e1; padding: 8px 12px; font-family: monospace;">${row.value}</td>
                          </tr>`
                          )
                          .join("")}
                      </table>
                    </td>
                  </tr>`
                    : ""
                }

                ${
                  opts.cta
                    ? `<tr>
                    <td align="center" style="padding: 16px 0 8px 0;">
                      <table border="0" cellspacing="0" cellpadding="0">
                        <tr>
                          <td align="center" style="border-radius: 12px; background-color: ${BRAND.colorDark};">
                            <a href="${opts.cta.url}" target="_blank" style="font-size: 14px; font-family: sans-serif; font-weight: 600; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 12px; display: inline-block;">
                              ${opts.cta.label}
                            </a>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>`
                    : ""
                }

                ${
                  opts.footerNote
                    ? `<tr>
                    <td style="padding-top: 20px; font-size: 12px; line-height: 1.5; color: #8a968f; text-align: center; border-top: 1px solid #f0f3f1;">
                      ${opts.footerNote}
                    </td>
                  </tr>`
                    : ""
                }
              </table>
            </td>
          </tr>

          <!-- Rodapé Institucional -->
          <tr>
            <td align="center" style="padding: 24px 16px 0 16px;">
              <p style="margin: 0; font-size: 12px; color: #8a968f; line-height: 1.5;">
                &copy; ${currentYear} Marcai Gestão Operacional. Todos os direitos reservados.<br>
                Este é um e-mail transacional automático. Por favor, não responda diretamente a esta mensagem.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Recuperação de Senha (Password Reset)
// ─────────────────────────────────────────────────────────────────────────────

export interface PasswordResetEmailParams {
  name: string;
  resetUrl: string;
  expiresMinutes?: number;
}

export function renderPasswordResetEmail(params: PasswordResetEmailParams) {
  const expires = params.expiresMinutes || 60;
  const preheader = `Instruções para redefinir sua senha no Marcai. Válido por ${expires} minutos.`;
  const title = "Redefinição de Senha";

  const paragraphs = [
    `Olá, <strong>${params.name}</strong>.`,
    `Recebemos uma solicitação para redefinir a senha de acesso da sua conta no Marcai.`,
    `Clique no botão abaixo para escolher uma nova senha. Por segurança, este link é válido por <strong>${expires} minutos</strong>.`,
  ];

  const html = renderBaseHtmlLayout({
    preheader,
    badge: "Segurança da Conta",
    badgeColor: "amber",
    title,
    paragraphs,
    cta: {
      label: "Redefinir Minha Senha",
      url: params.resetUrl,
    },
    footerNote:
      "Se você não solicitou a alteração da sua senha, desconsidere este e-mail. Sua conta continua segura.",
  });

  const text = `Olá, ${params.name}.

Recebemos uma solicitação para redefinir a senha da sua conta no Marcai.

Para criar uma nova senha, acesse o link abaixo (válido por ${expires} minutos):
${params.resetUrl}

Se você não fez essa solicitação, ignore este e-mail. Sua conta continua segura.

---
Marcai Gestão Operacional
Este é um e-mail transacional de segurança.`;

  return { subject: "Redefinição de senha da sua conta no Marcai", html, text };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Convite para Organização (Member Invite)
// ─────────────────────────────────────────────────────────────────────────────

export interface MemberInviteEmailParams {
  orgName: string;
  inviterName?: string | null;
  role: string;
  inviteUrl: string;
  expiresDays?: number;
}

export function renderMemberInviteEmail(params: MemberInviteEmailParams) {
  const expires = params.expiresDays || 7;
  const preheader = `Você foi convidado para participar da organização ${params.orgName} no Marcai.`;
  const title = "Você recebeu um convite no Marcai";

  const inviterText = params.inviterName
    ? `<strong>${params.inviterName}</strong> convidou você para fazer parte da equipe de <strong>${params.orgName}</strong>.`
    : `Você foi convidado para fazer parte da organização <strong>${params.orgName}</strong>.`;

  const paragraphs = [
    inviterText,
    `No Marcai, você terá acesso à gestão de tarefas operacionais, rotinas e processos da sua unidade de forma simples e transparente.`,
    `Clique no botão abaixo para aceitar o convite e configurar seu acesso. Este convite é válido por <strong>${expires} dias</strong>.`,
  ];

  const html = renderBaseHtmlLayout({
    preheader,
    badge: "Novo Convite",
    badgeColor: "green",
    title,
    paragraphs,
    detailsBox: [
      { label: "Organização", value: params.orgName },
      { label: "Nível de Acesso", value: params.role },
      { label: "Validade", value: `${expires} dias` },
    ],
    cta: {
      label: "Aceitar Convite e Acessar",
      url: params.inviteUrl,
    },
    footerNote: "Caso não reconheça esta organização, nenhuma ação adicional é necessária.",
  });

  const text = `Você recebeu um convite para ingressar em ${params.orgName} no Marcai.

${params.inviterName ? `Convidado por: ${params.inviterName}` : ""}
Organização: ${params.orgName}
Nível de acesso: ${params.role}
Validade: ${expires} dias

Para aceitar o convite e configurar seu acesso, utilize o link:
${params.inviteUrl}

---
Marcai Gestão Operacional`;

  return { subject: `Convite para ingressar em ${params.orgName} no Marcai`, html, text };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Código de Verificação 2FA / Login OTP
// ─────────────────────────────────────────────────────────────────────────────

export interface TwoFactorOtpEmailParams {
  name: string;
  code: string;
  expiresMinutes?: number;
  ipAddress?: string;
  userAgent?: string;
}

export function renderTwoFactorOtpEmail(params: TwoFactorOtpEmailParams) {
  const expires = params.expiresMinutes || 10;
  const preheader = `Seu código de verificação é ${params.code}. Válido por ${expires} minutos.`;
  const title = "Código de Verificação de Acesso";

  const paragraphs = [
    `Olá, <strong>${params.name}</strong>.`,
    `Utilize o código de 6 dígitos abaixo para concluir sua autenticação em duas etapas no Marcai:`,
    `<div style="text-align: center; margin: 16px 0;">
      <span style="display: inline-block; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: ${BRAND.colorDark}; background-color: ${BRAND.colorSage}; padding: 12px 24px; border-radius: 12px; border: 1px dashed ${BRAND.borderSubtle}; font-family: monospace;">
        ${params.code}
      </span>
    </div>`,
    `Este código é pessoal, intransferível e expira em <strong>${expires} minutos</strong>.`,
  ];

  const details: Array<{ label: string; value: string }> = [];
  if (params.ipAddress) details.push({ label: "Endereço IP", value: params.ipAddress });
  if (params.userAgent) details.push({ label: "Dispositivo", value: params.userAgent.slice(0, 40) + "..." });

  const html = renderBaseHtmlLayout({
    preheader,
    badge: "Autenticação em 2 Etapas",
    badgeColor: "amber",
    title,
    paragraphs,
    detailsBox: details.length ? details : undefined,
    footerNote: "Nunca compartilhe este código com ninguém. O Marcai nunca solicitará seu código por WhatsApp ou telefone.",
  });

  const text = `Olá, ${params.name}.

Seu código de verificação do Marcai é: ${params.code}

Este código expira em ${expires} minutos.
${params.ipAddress ? `IP do solicitante: ${params.ipAddress}\n` : ""}${params.userAgent ? `Dispositivo: ${params.userAgent}\n` : ""}
Se você não tentou acessar o Marcai, altere sua senha imediatamente.

---
Marcai Gestão Operacional`;

  return { subject: `${params.code} é seu código de verificação do Marcai`, html, text };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Notificação Operacional Crítica (SLA, Aprovação, Atribuição)
// ─────────────────────────────────────────────────────────────────────────────

export interface OperationalAlertEmailParams {
  orgName: string;
  title: string;
  message: string;
  priority?: string;
  actionUrl?: string;
  actionLabel?: string;
  details?: Array<{ label: string; value: string }>;
}

export function renderOperationalAlertEmail(params: OperationalAlertEmailParams) {
  const priorityColor =
    params.priority === "CRITICAL" ? "red" : params.priority === "HIGH" ? "amber" : "zinc";

  const preheader = `[${params.orgName}] ${params.title}: ${params.message}`;

  const paragraphs = [
    params.message,
    `Esta notificação foi gerada automaticamente pelo motor de regras e rotinas da sua organização.`,
  ];

  const html = renderBaseHtmlLayout({
    preheader,
    badge: params.priority ? `Prioridade ${params.priority}` : "Alerta Operacional",
    badgeColor: priorityColor,
    title: params.title,
    paragraphs,
    detailsBox: params.details,
    cta: params.actionUrl
      ? {
          label: params.actionLabel || "Visualizar no Sistema",
          url: params.actionUrl,
        }
      : undefined,
    footerNote: `Organização: ${params.orgName} · Acompanhe suas tarefas em tempo real na plataforma.`,
  });

  const text = `[${params.orgName}] ${params.title}
Prioridade: ${params.priority || "NORMAL"}

${params.message}

${params.details ? params.details.map((d) => `${d.label}: ${d.value}`).join("\n") : ""}

${params.actionUrl ? `Acesse pelo link: ${params.actionUrl}` : ""}

---
Marcai Gestão Operacional`;

  return {
    subject: `[${params.orgName}] ${params.priority === "CRITICAL" ? "🔴 " : ""}${params.title}`,
    html,
    text,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Envio de Relatório Agendado (Scheduled Report)
// ─────────────────────────────────────────────────────────────────────────────

export interface ScheduledReportEmailParams {
  orgName: string;
  reportName: string;
  frequency: string;
  format: string;
  periodLabel?: string;
  downloadUrl?: string;
  summaryStats?: Array<{ label: string; value: string }>;
}

export function renderScheduledReportEmail(params: ScheduledReportEmailParams) {
  const frequencyLabel =
    params.frequency === "WEEKLY"
      ? "Semanal"
      : params.frequency === "MONTHLY"
      ? "Mensal"
      : params.frequency;

  const preheader = `Seu relatório ${frequencyLabel} "${params.reportName}" da ${params.orgName} está disponível.`;
  const title = `Relatório Operacional: ${params.reportName}`;

  const paragraphs = [
    `O relatório automático programado para a organização <strong>${params.orgName}</strong> foi gerado com sucesso.`,
    `Abaixo você confere o resumo dos indicadores consolidados para o período ${
      params.periodLabel ? `(<strong>${params.periodLabel}</strong>)` : ""
    }:`,
  ];

  const details: Array<{ label: string; value: string }> = [
    { label: "Frequência", value: frequencyLabel },
    { label: "Formato", value: params.format },
    ...(params.summaryStats || []),
  ];

  const html = renderBaseHtmlLayout({
    preheader,
    badge: `Relatório ${frequencyLabel}`,
    badgeColor: "green",
    title,
    paragraphs,
    detailsBox: details,
    cta: params.downloadUrl
      ? {
          label: "Acessar Relatório Completo",
          url: params.downloadUrl,
        }
      : undefined,
    footerNote:
      "Você recebe este e-mail porque está cadastrado como destinatário nos relatórios agendados da sua organização.",
  });

  const text = `Relatório Operacional: ${params.reportName} (${frequencyLabel})
Organização: ${params.orgName}
Formato: ${params.format}
${params.periodLabel ? `Período: ${params.periodLabel}\n` : ""}
Resumo de Indicadores:
${details.map((d) => `- ${d.label}: ${d.value}`).join("\n")}

${params.downloadUrl ? `Para visualizar ou baixar o relatório: ${params.downloadUrl}` : ""}

---
Marcai Gestão Operacional`;

  return {
    subject: `[${params.orgName}] Relatório ${frequencyLabel}: ${params.reportName}`,
    html,
    text,
  };
}
