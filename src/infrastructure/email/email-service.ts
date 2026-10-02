import { getResendClient, getDefaultEmailSender, isEmailServiceConfigured } from "./resend-client";
import {
  renderPasswordResetEmail,
  renderMemberInviteEmail,
  renderTwoFactorOtpEmail,
  renderOperationalAlertEmail,
  renderScheduledReportEmail,
  type PasswordResetEmailParams,
  type MemberInviteEmailParams,
  type TwoFactorOtpEmailParams,
  type OperationalAlertEmailParams,
  type ScheduledReportEmailParams,
} from "./email-templates";

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  from?: string;
  replyTo?: string;
  tags?: Array<{ name: string; value: string }>;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Envio centralizado de e-mails transacionais utilizando Resend.
 * Aplica práticas recomendadas da skill email-systems:
 * - Validação de destinatário
 * - Envio obrigatório de Multipart (HTML + Plain Text)
 * - Retentativa exponencial em erros temporários de rede
 * - Modo Dry-Run/Simulação seguro caso RESEND_API_KEY não esteja configurada
 * - Logging transparente de disparos para auditoria operacional
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const recipients = Array.isArray(options.to) ? options.to : [options.to];
  const cleanedRecipients = recipients
    .map((r) => r.trim().toLowerCase())
    .filter(Boolean);

  if (cleanedRecipients.length === 0) {
    return { success: false, error: "Nenhum destinatário válido informado." };
  }

  const resend = getResendClient();
  const from = options.from || getDefaultEmailSender();

  // Se o Resend não estiver configurado (ex: ambiente de desenvolvimento inicial ou sem credencial),
  // simula o envio sem quebrar os fluxos da aplicação.
  if (!resend || !isEmailServiceConfigured()) {
    console.info(
      `[EmailService:Simulação] E-mail simulado para: ${cleanedRecipients.join(", ")} | Assunto: "${options.subject}"`
    );
    return {
      success: true,
      messageId: `simulated-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
  }

  // Executa envio com lógica de retry para falhas de rede transitórias (até 2 tentativas com backoff)
  const maxAttempts = 2;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await resend.emails.send({
        from,
        to: cleanedRecipients,
        subject: options.subject,
        html: options.html,
        text: options.text,
        replyTo: options.replyTo,
        tags: options.tags,
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      console.info(
        `[EmailService:Resend] E-mail enviado com sucesso. ID: ${response.data?.id} | Destinatários: ${cleanedRecipients.join(", ")}`
      );

      return {
        success: true,
        messageId: response.data?.id,
      };
    } catch (err: any) {
      lastError = err;
      console.warn(
        `[EmailService:Resend] Tentativa ${attempt}/${maxAttempts} falhou para ${cleanedRecipients.join(", ")}: ${err?.message}`
      );

      if (attempt < maxAttempts) {
        // Backoff exponencial com jitter (500ms + random)
        const delayMs = 500 * attempt + Math.floor(Math.random() * 200);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  return {
    success: false,
    error: lastError?.message || "Erro desconhecido ao enviar e-mail via Resend.",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Métodos Especializados de Disparo
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dispara e-mail de recuperação e redefinição de senha.
 */
export async function sendPasswordResetEmail(
  to: string,
  params: PasswordResetEmailParams
): Promise<SendEmailResult> {
  const { subject, html, text } = renderPasswordResetEmail(params);
  return sendEmail({
    to,
    subject,
    html,
    text,
    tags: [{ name: "category", value: "password_reset" }],
  });
}

/**
 * Dispara convite de novo membro para uma organização.
 */
export async function sendMemberInviteEmail(
  to: string,
  params: MemberInviteEmailParams
): Promise<SendEmailResult> {
  const { subject, html, text } = renderMemberInviteEmail(params);
  return sendEmail({
    to,
    subject,
    html,
    text,
    tags: [{ name: "category", value: "member_invite" }],
  });
}

/**
 * Dispara código de verificação 2FA (OTP) ou alerta de login.
 */
export async function sendTwoFactorOtpEmail(
  to: string,
  params: TwoFactorOtpEmailParams
): Promise<SendEmailResult> {
  const { subject, html, text } = renderTwoFactorOtpEmail(params);
  return sendEmail({
    to,
    subject,
    html,
    text,
    tags: [{ name: "category", value: "two_factor_auth" }],
  });
}

/**
 * Dispara e-mail de alerta operacional (SLA estourado, aprovação pendente, tarefa atribuída).
 */
export async function sendOperationalAlertEmail(
  to: string | string[],
  params: OperationalAlertEmailParams
): Promise<SendEmailResult> {
  const { subject, html, text } = renderOperationalAlertEmail(params);
  return sendEmail({
    to,
    subject,
    html,
    text,
    tags: [
      { name: "category", value: "operational_alert" },
      { name: "priority", value: params.priority || "MEDIUM" },
    ],
  });
}

/**
 * Dispara e-mail de relatório agendado com indicadores e link de download.
 */
export async function sendScheduledReportEmail(
  to: string | string[],
  params: ScheduledReportEmailParams
): Promise<SendEmailResult> {
  const { subject, html, text } = renderScheduledReportEmail(params);
  return sendEmail({
    to,
    subject,
    html,
    text,
    tags: [
      { name: "category", value: "scheduled_report" },
      { name: "frequency", value: params.frequency },
    ],
  });
}
