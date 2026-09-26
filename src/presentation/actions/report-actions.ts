"use server";

import { z } from "zod";
import { prisma } from "@/infrastructure/database/prisma";
import { getAuthenticatedContext } from "@/application/security/auth-context";
import { Role } from "@/domain/types";
import { revalidatePath } from "next/cache";

export type ActionResult = { success?: boolean; error?: string; data?: any };

const scheduledReportSchema = z.object({
  name: z.string().trim().min(3).max(120),
  frequency: z.enum(["WEEKLY", "MONTHLY"]),
  recipients: z.string().trim().min(5).max(500), // comma separated emails
  format: z.enum(["PDF", "CSV"]).default("PDF"),
  filters: z.record(z.string(), z.any()).optional(),
});

export async function createScheduledReportAction(formData: FormData): Promise<ActionResult> {
  const context = await getAuthenticatedContext();
  if (!context) return { error: "Não autenticado." };

  if (context.role !== Role.OWNER && context.role !== Role.ADMIN) {
    return { error: "Apenas OWNER ou ADMIN podem agendar relatórios automáticos." };
  }

  const raw = {
    name: String(formData.get("name") || formData.get("title") || "").trim(),
    frequency: String(formData.get("frequency") || "WEEKLY"),
    recipients: String(formData.get("recipients") || "").trim(),
    format: String(formData.get("format") || "PDF"),
  };

  const parsed = scheduledReportSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  // Validate recipients emails
  const emails = parsed.data.recipients.split(",").map(e => e.trim()).filter(Boolean);
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emails.length || !emails.every(e => emailRegex.test(e))) {
    return { error: "Informe destinatários válidos separados por vírgula." };
  }

  // Next run: next Monday at 08:00 for WEEKLY, 1st of next month at 08:00 for MONTHLY
  const now = new Date();
  const nextRunAt = new Date(now.getTime() + (parsed.data.frequency === "WEEKLY" ? 7 : 30) * 86400000);

  const report = await prisma.scheduledReport.create({
    data: {
      organizationId: context.organizationId,
      name: parsed.data.name,
      frequency: parsed.data.frequency,
      recipients: emails.join(", "),
      format: parsed.data.format,
      nextRunAt,
      status: "ACTIVE",
    },
  });

  await prisma.activityLog.create({
    data: {
      organizationId: context.organizationId,
      actorId: context.memberId,
      action: "SCHEDULED_REPORT_CREATED",
      entityType: "REPORT",
      entityId: report.id,
      metadata: { name: report.name, frequency: report.frequency, recipients: report.recipients },
    },
  });

  revalidatePath("/management/reports");
  return { success: true, data: { id: report.id } };
}

export async function toggleScheduledReportStatusAction(reportId: string): Promise<ActionResult> {
  const context = await getAuthenticatedContext();
  if (!context) return { error: "Não autenticado." };

  if (context.role !== Role.OWNER && context.role !== Role.ADMIN) {
    return { error: "Apenas OWNER ou ADMIN podem alterar agendamentos de relatórios." };
  }

  const existing = await prisma.scheduledReport.findFirst({
    where: { id: reportId, organizationId: context.organizationId },
  });
  if (!existing) return { error: "Agendamento de relatório não encontrado." };

  const newStatus = existing.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
  await prisma.scheduledReport.update({
    where: { id: existing.id },
    data: { status: newStatus },
  });

  await prisma.activityLog.create({
    data: {
      organizationId: context.organizationId,
      actorId: context.memberId,
      action: newStatus === "ACTIVE" ? "SCHEDULED_REPORT_RESUMED" : "SCHEDULED_REPORT_PAUSED",
      entityType: "REPORT",
      entityId: existing.id,
    },
  });

  revalidatePath("/management/reports");
  return { success: true };
}
