import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { AuthenticatedContext } from "@/application/security/auth-context";
import { isManagement, processScope } from "@/application/security/operational-scope";
import { readProcessDefinition } from "@/domain/rules/process-definition";
import { readSchedule } from "@/domain/rules/schedule";
import {
  processToReusableTemplate, reusableTemplateDefinitionSchema, reusableTemplateDraftSchema,
  templateJobSchema, type TemplateItem,
} from "@/domain/rules/reusable-template-definition";
import { prisma } from "@/infrastructure/database/prisma";
import { templateCatalog } from "@/infrastructure/templates/catalog";

export const canManageTemplates = (context: Pick<AuthenticatedContext, "role">) => ["OWNER", "ADMIN"].includes(context.role);
export const templateReferenceSchema = z.string().max(160).regex(/^(catalog:[VALEM][0-9]{2}|organization:[a-zA-Z0-9_-]+)$/);
type TemplateDb = Pick<Prisma.TransactionClient, "reusableProcessTemplate" | "reusableProcessTemplateVersion">;
const json = (value: unknown) => value as Prisma.InputJsonValue;
export class TemplateInputError extends Error {}

export async function listTemplateLibrary(context: AuthenticatedContext, includeArchived = false, publishedOnly = false): Promise<TemplateItem[]> {
  if (!isManagement(context)) return [];
  const admin = canManageTemplates(context) && !publishedOnly;
  const rows = await prisma.reusableProcessTemplate.findMany({
    where: { organizationId: context.organizationId, ...(admin
      ? includeArchived ? {} : { status: { not: "ARCHIVED" } }
      : { status: "PUBLISHED", publishedVersionId: { not: null } }) },
    include: { publishedVersion: true }, orderBy: { updatedAt: "desc" },
  });
  const privateItems: TemplateItem[] = rows.flatMap(row => {
    const parsed = (admin ? reusableTemplateDraftSchema : reusableTemplateDefinitionSchema).safeParse(admin ? row.draftDefinition : row.publishedVersion?.definition);
    if (!parsed.success) return [];
    return [{ id: row.id, reference: row.publishedVersionId ? "organization:" + row.publishedVersionId : "",
      name: parsed.data.name, description: parsed.data.description, jobKey: parsed.data.jobKey, origin: "ORGANIZATION" as const,
      status: row.status, revision: row.draftRevision, version: row.publishedVersion?.version ?? 0,
      hasDraft: !!row.publishedVersion && JSON.stringify(row.draftDefinition) !== JSON.stringify(row.publishedVersion.definition),
      updatedAt: row.updatedAt.toISOString(), definition: parsed.data }];
  });
  return [...templateCatalog, ...privateItems];
}

export async function resolvePublishedTemplate(context: AuthenticatedContext, reference: string, db: TemplateDb = prisma): Promise<TemplateItem | null> {
  if (!isManagement(context) || !templateReferenceSchema.safeParse(reference).success) return null;
  if (reference.startsWith("catalog:")) return templateCatalog.find(t => t.reference === reference) ?? null;
  const version = await db.reusableProcessTemplateVersion.findFirst({
    where: { id: reference.slice("organization:".length), template: { organizationId: context.organizationId, status: "PUBLISHED" } },
    include: { template: true },
  });
  // A stale picker cannot silently use a new or un-published revision.
  if (!version || version.template.publishedVersionId !== version.id) return null;
  const parsed = reusableTemplateDefinitionSchema.safeParse(version.definition);
  if (!parsed.success) return null;
  return { id: version.templateId, reference, name: parsed.data.name, description: parsed.data.description,
    jobKey: parsed.data.jobKey, definition: parsed.data, origin: "ORGANIZATION", status: "PUBLISHED", version: version.version };
}

export async function templateForEditor(context: AuthenticatedContext, id: string) {
  if (!canManageTemplates(context)) return null;
  const row = await prisma.reusableProcessTemplate.findFirst({ where: { id, organizationId: context.organizationId } });
  if (!row) return null;
  const parsed = reusableTemplateDraftSchema.safeParse(row.draftDefinition);
  if (!parsed.success) return null;
  return { id: row.id, revision: row.draftRevision, status: row.status, definition: parsed.data };
}

const saveSchema = z.object({
  id: z.string().min(1).max(100).optional(), revision: z.number().int().positive().optional(),
  definition: z.unknown(), publish: z.boolean(),
}).strict();

export async function saveReusableTemplate(context: AuthenticatedContext, input: unknown) {
  if (!canManageTemplates(context)) throw new TemplateInputError("Somente proprietários e administradores podem salvar templates.");
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) throw new TemplateInputError("Revise os dados do template.");
  const { id, revision, publish } = parsed.data;
  if (JSON.stringify(parsed.data.definition)?.length > 500_000) throw new TemplateInputError("O template excede o tamanho permitido.");
  const definition = (publish ? reusableTemplateDefinitionSchema : reusableTemplateDraftSchema).safeParse(parsed.data.definition);
  if (!definition.success) throw new TemplateInputError(definition.error.issues[0].message);
  const d = definition.data;
  return prisma.$transaction(async tx => {
    if (id) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"reusable-template:" + id}))`;
    const existing = id ? await tx.reusableProcessTemplate.findFirst({ where: { id, organizationId: context.organizationId } }) : null;
    if (id && (!existing || existing.status === "ARCHIVED")) throw new TemplateInputError("Template indisponível. Restaure-o antes de editar.");
    if (existing && existing.draftRevision !== revision) throw new TemplateInputError("Este template foi alterado por outra pessoa. Reabra a edição para comparar; seu conteúdo permanece nesta tela.");
    const data = { name: d.name || "Template sem nome", description: d.description, jobKey: d.jobKey, draftDefinition: json(d), updatedBy: context.memberId };
    const row = existing
      ? await tx.reusableProcessTemplate.update({ where: { id: existing.id }, data: { ...data, draftRevision: { increment: 1 } } })
      : await tx.reusableProcessTemplate.create({ data: { ...data, organizationId: context.organizationId, createdBy: context.memberId } });
    if (publish) {
      const latest = await tx.reusableProcessTemplateVersion.findFirst({ where: { templateId: row.id }, orderBy: { version: "desc" } });
      const version = await tx.reusableProcessTemplateVersion.create({
        data: { templateId: row.id, version: (latest?.version ?? 0) + 1, schemaVersion: 1, definition: json(d), createdBy: context.memberId },
      });
      await tx.reusableProcessTemplate.update({ where: { id: row.id }, data: { status: "PUBLISHED", publishedVersionId: version.id } });
    }
    await tx.activityLog.create({ data: { organizationId: context.organizationId, actorId: context.memberId,
      action: publish ? "TEMPLATE_PUBLISHED" : existing ? "TEMPLATE_DRAFT_UPDATED" : "TEMPLATE_CREATED",
      entityType: "TEMPLATE", entityId: row.id, metadata: { revision: row.draftRevision, taskCount: d.tasks.length } } });
    return { id: row.id, revision: row.draftRevision };
  });
}

export async function duplicateReusableTemplate(context: AuthenticatedContext, reference: string) {
  if (!canManageTemplates(context)) throw new TemplateInputError("Acesso negado.");
  if (typeof reference !== "string" || reference.length > 160) throw new TemplateInputError("Referência inválida.");
  return prisma.$transaction(async tx => {
    const draft = reference.startsWith("draft:") ? await tx.reusableProcessTemplate.findFirst({ where: { id: reference.slice(6), organizationId: context.organizationId } }) : null;
    const source = draft ? { definition: reusableTemplateDraftSchema.parse(draft.draftDefinition), version: draft.draftRevision } : await resolvePublishedTemplate(context, reference, tx);
    if (!source) throw new TemplateInputError("Template indisponível ou atualizado. Atualize a biblioteca.");
    const definition = { ...source.definition, name: (source.definition.name + " — cópia").slice(0, 150) };
    const row = await tx.reusableProcessTemplate.create({ data: { organizationId: context.organizationId, name: definition.name, description: definition.description,
      jobKey: definition.jobKey, draftDefinition: json(definition), createdBy: context.memberId, updatedBy: context.memberId,
      sourceMetadata: { reference, version: source.version } } });
    await tx.activityLog.create({ data: { organizationId: context.organizationId, actorId: context.memberId, action: "TEMPLATE_DUPLICATED", entityType: "TEMPLATE", entityId: row.id, metadata: { reference, version: source.version } } });
    return { id: row.id, revision: row.draftRevision };
  });
}

export async function changeTemplateArchive(context: AuthenticatedContext, id: string, revision: number, archive: boolean) {
  if (!canManageTemplates(context)) throw new TemplateInputError("Acesso negado.");
  if (!z.object({ id: z.string().min(1).max(100), revision: z.number().int().positive(), archive: z.boolean() }).safeParse({ id, revision, archive }).success) throw new TemplateInputError("Dados inválidos.");
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"reusable-template:" + id}))`;
    const row = await tx.reusableProcessTemplate.findFirst({ where: { id, organizationId: context.organizationId } });
    if (!row || row.draftRevision !== revision) throw new TemplateInputError("O template mudou. Atualize a biblioteca.");
    await tx.reusableProcessTemplate.update({ where: { id: row.id },
      data: { status: archive ? "ARCHIVED" : row.publishedVersionId ? "PUBLISHED" : "DRAFT",
        archivedAt: archive ? new Date() : null, draftRevision: { increment: 1 }, updatedBy: context.memberId } });
    await tx.activityLog.create({ data: { organizationId: context.organizationId, actorId: context.memberId,
      action: archive ? "TEMPLATE_ARCHIVED" : "TEMPLATE_RESTORED", entityType: "TEMPLATE", entityId: row.id } });
    return { id: row.id };
  });
}

export async function processTemplateSourceOptions(context: AuthenticatedContext, processId: string) {
  if (!canManageTemplates(context)) throw new TemplateInputError("Acesso negado.");
  const p = await prisma.process.findFirst({ where: { ...processScope(context), id: processId },
    select: { name: true, routines: { where: { status: "ACTIVE" }, select: { id: true, recurrenceRule: true }, orderBy: { createdAt: "asc" } } } });
  if (!p) throw new TemplateInputError("Processo não encontrado.");
  return { name: p.name, routines: p.routines.map(r => ({ id: r.id, schedule: readSchedule(r.recurrenceRule) })) };
}

export async function saveProcessAsReusableTemplate(context: AuthenticatedContext, input: unknown) {
  if (!canManageTemplates(context)) throw new TemplateInputError("Acesso negado.");
  const parsed = z.object({ processId: z.string().min(1).max(100), name: z.string().trim().min(3).max(150),
    jobKey: templateJobSchema, routineId: z.string().max(100).optional() }).strict().safeParse(input);
  if (!parsed.success) throw new TemplateInputError("Preencha nome e área do template.");
  return prisma.$transaction(async tx => {
    const p = await tx.process.findFirst({ where: { ...processScope(context), id: parsed.data.processId },
      include: { sourceTemplateVersion: true, routines: { where: { status: "ACTIVE" } } } });
    const d = readProcessDefinition(p?.sourceTemplateVersion?.definition);
    if (!p || !d) throw new TemplateInputError("Configure as etapas do processo antes de salvar como template.");
    if (p.routines.length > 1 && parsed.data.routineId === undefined) throw new TemplateInputError("Escolha a rotina que servirá de sugestão.");
    const routine = parsed.data.routineId === "" ? null : parsed.data.routineId ? p.routines.find(r => r.id === parsed.data.routineId) : (p.routines.length === 1 ? p.routines[0] : null);
    if (parsed.data.routineId && !routine) throw new TemplateInputError("Rotina indisponível.");
    const teams = await tx.team.findMany({ where: { organizationId: context.organizationId, id: { in: d.tasks.map(t => t.teamId) } }, select: { id: true, name: true } });
    const portable = processToReusableTemplate({ ...d, name: parsed.data.name, schedule: routine ? readSchedule(routine.recurrenceRule) : null }, parsed.data.jobKey, Object.fromEntries(teams.map(t => [t.id, t.name])));
    const row = await tx.reusableProcessTemplate.create({ data: { organizationId: context.organizationId, name: portable.name,
      description: portable.description, jobKey: portable.jobKey, draftDefinition: json(portable), createdBy: context.memberId, updatedBy: context.memberId,
      sourceMetadata: { type: "PROCESS", processId: p.id, processVersionId: p.sourceTemplateVersionId } } });
    await tx.activityLog.create({ data: { organizationId: context.organizationId, actorId: context.memberId,
      action: "TEMPLATE_SAVED_FROM_PROCESS", entityType: "TEMPLATE", entityId: row.id, metadata: { processId: p.id } } });
    return { id: row.id };
  });
}
