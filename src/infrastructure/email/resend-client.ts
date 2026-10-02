import { Resend } from "resend";

let resendInstance: Resend | null = null;

/**
 * Obtém a instância singleton do cliente Resend.
 * Se a variável de ambiente RESEND_API_KEY não estiver configurada,
 * retorna null e opera em modo simulação (Dry Run/Dev).
 */
export function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();

  if (!apiKey) {
    return null;
  }

  if (!resendInstance) {
    resendInstance = new Resend(apiKey);
  }

  return resendInstance;
}

/**
 * Endereço de remetente padrão para e-mails transacionais do Marcai.
 * Configurável via variável de ambiente EMAIL_FROM.
 */
export function getDefaultEmailSender(): string {
  if (process.env.EMAIL_FROM?.trim()) {
    return process.env.EMAIL_FROM.trim();
  }

  // Em ambiente de teste/desenvolvimento do Resend, onboarding@resend.dev é permitido
  if (process.env.NODE_ENV !== "production") {
    return "Marcai <onboarding@resend.dev>";
  }

  return "Marcai <nao-responder@marcai.com.br>";
}

/**
 * Verifica se o serviço de e-mail está habilitado e configurado com API Key.
 */
export function isEmailServiceConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}
