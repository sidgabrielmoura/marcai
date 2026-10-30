"use server";

import { after } from "next/server";
import { createWhatsAppInstance, manageWhatsAppInstance, readWhatsAppQr, saveWhatsAppRecipients, sendWhatsAppTestMessage, whatsAppSettings } from "@/application/whatsapp/instances";
import { publicWhatsAppError, type WhatsAppOperation } from "@/domain/whatsapp/contracts";
import { publishWhatsAppPending } from "@/infrastructure/whatsapp/realtime";

export async function getWhatsAppSettingsAction() {
  try { return await whatsAppSettings(); }
  catch (error) { throw new Error(publicWhatsAppError(error).error); }
}
export async function createWhatsAppInstanceAction(input: unknown) {
  try { return { data: await createWhatsAppInstance(input) }; }
  catch (error) { return { error: publicWhatsAppError(error).error }; }
}
export async function saveWhatsAppRecipientsAction(input: unknown) {
  try { return { data: await saveWhatsAppRecipients(input) }; }
  catch (error) { return { error: publicWhatsAppError(error).error }; }
}
export async function sendWhatsAppTestMessageAction() {
  try { return { data: await sendWhatsAppTestMessage() }; }
  catch (error) { const failure = publicWhatsAppError(error); return { error: failure.error, code: failure.code }; }
}
export async function manageWhatsAppInstanceAction(id: string, operation: WhatsAppOperation) {
  try {
    const data = await manageWhatsAppInstance(id, operation);
    if (!data.deleted) after(() => publishWhatsAppPending(id));
    return { data };
  } catch (error) { const failure = publicWhatsAppError(error); return { error: failure.error, code: failure.code }; }
}
export async function getWhatsAppQrAction(id: string) {
  try {
    const data = await readWhatsAppQr(id);
    if (data.status !== "SCAN_QR_CODE") after(() => publishWhatsAppPending(id));
    return { data };
  }
  catch (error) { const failure = publicWhatsAppError(error); return { error: failure.error, code: failure.code }; }
}

