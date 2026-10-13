import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { AuthenticatedContext } from "@/application/security/auth-context";
import { eligibleMember, isManagement, processScope } from "@/application/security/operational-scope";
import { processDefinitionSchema, readProcessDefinition } from "@/domain/rules/process-definition";
import { resolvePublishedTemplate, TemplateInputError } from "@/application/templates/template-library";
import { materializeProcessTasks } from "./materialize-tasks";

export async function saveProcessInTransaction(tx: Prisma.TransactionClient, context: AuthenticatedContext,
  input: unknown, options: { processId?: string; requestId?: string; templateReference?: string; routineId?: string }, now = new Date()) {
  if (!isManagement(context)) throw new TemplateInputError("Acesso negado.");
  const parsed = processDefinitionSchema.safeParse(input);
  if (!parsed.success) throw new TemplateInputError(parsed.error.issues[0].message);
  const definition = parsed.data;
  if (options.requestId && !z.uuid().safeParse(options.requestId).success) throw new TemplateInputError("Solicitação inválida.");
  const lock = options.processId || options.requestId;
  if (lock) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${context.organizationId + ":process:" + lock}))`;
  if (!options.processId && options.requestId) {
    const previous = await tx.process.findFirst({ where: { ...processScope(context), creationRequestId: options.requestId } });
    if (previous) return { id: previous.id, routineId: null, notifications: [] };
  }
  const existing = options.processId ? await tx.process.findFirst({ where: { ...processScope(context), id: options.processId }, include: { sourceTemplateVersion: true } }) : null;
  if (options.processId && (!existing || existing.status === "ARCHIVED")) throw new TemplateInputError("Processo indisponível para edição.");
  if (existing && context.role === "MANAGER" && readProcessDefinition(existing.sourceTemplateVersion?.definition)?.tasks.some(t => !context.scope?.teamIds.includes(t.teamId))) throw new TemplateInputError("Este processo contém equipes fora do seu escopo.");
  const location = await tx.location.findFirst({ where: { id: definition.locationId, organizationId: context.organizationId, status: "ACTIVE" } });
  if (!location || context.role === "MANAGER" && !context.scope?.locationIds.includes(location.id)) throw new TemplateInputError("Unidade fora do seu acesso.");
  const teams = await tx.team.findMany({ where: { organizationId: context.organizationId, status: "ACTIVE", id: { in: definition.tasks.map(t => t.teamId) } }, select: { id: true } });
  for (const t of definition.tasks) {
    if (!teams.some(team => team.id === t.teamId) || context.role === "MANAGER" && !context.scope?.teamIds.includes(t.teamId)) throw new TemplateInputError("Escolha uma equipe permitida para “" + t.title + "”.");
    if (t.primaryMemberId && !await eligibleMember(context.organizationId, t.primaryMemberId, location.id, t.teamId, tx, now)) throw new TemplateInputError("Responsável sem acesso à equipe e unidade de “" + t.title + "”.");
    for (const id of t.approverIds) {
      const a = await tx.organizationMember.findFirst({ where: { id, organizationId: context.organizationId, status: "ACTIVE", user: { status: "ACTIVE" }, role: { in: ["OWNER", "ADMIN", "MANAGER"] } } });
      if (!a || a.role === "MANAGER" && !await eligibleMember(context.organizationId, id, location.id, t.teamId, tx, now)) throw new TemplateInputError("Aprovador sem acesso à tarefa “" + t.title + "”.");
    }
  }
  if (!existing && options.templateReference?.startsWith("organization:")) {
    const source = await tx.reusableProcessTemplateVersion.findFirst({ where: { id: options.templateReference.slice(13), template: { organizationId: context.organizationId } }, select: { templateId: true } });
    if (source) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"reusable-template:" + source.templateId}))`;
  }
  const origin = !existing && options.templateReference ? await resolvePublishedTemplate(context, options.templateReference, tx) : null;
  if (!existing && options.templateReference && !origin) throw new TemplateInputError("Este template foi atualizado ou arquivado. Volte à biblioteca e selecione-o novamente.");
  const internalTemplate = existing?.sourceTemplateVersion ? { id: existing.sourceTemplateVersion.templateId } : await tx.processTemplate.create({ data: { organizationId: context.organizationId, name: definition.name } });
  // Older installations may still have several processes sharing one internal
  // definition family; serialize their version counters as well as each process.
  if (existing) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"process-definition:" + internalTemplate.id}))`;
  const latest = await tx.processTemplateVersion.findFirst({ where: { templateId: internalTemplate.id }, orderBy: { version: "desc" } });
  const version = await tx.processTemplateVersion.create({ data: { templateId: internalTemplate.id, version: (latest?.version ?? 0) + 1, definition: definition as unknown as Prisma.InputJsonValue } });
  const data = { name: definition.name, description: definition.description, locationId: location.id, criticality: definition.criticality,
    validFrom: definition.validFrom ? new Date(definition.validFrom) : null, validUntil: definition.validUntil ? new Date(definition.validUntil + "T23:59:59Z") : null, sourceTemplateVersionId: version.id };
  const process = existing ? await tx.process.update({ where: { id: existing.id }, data }) : await tx.process.create({ data: { ...data, organizationId: context.organizationId, createdBy: context.memberId,
    creationRequestId: options.requestId, originReusableTemplateVersionId: origin?.origin === "ORGANIZATION" ? origin.reference.slice(13) : null,
    templateOriginSnapshot: origin ? { reference: origin.reference, name: origin.name, version: origin.version, jobKey: origin.jobKey } : Prisma.JsonNull } });
  let routineId: string | null = null;
  if (definition.schedule) {
    const s = definition.schedule;
    const current = existing ? await tx.routine.findFirst({ where: { processId: existing.id, ...(options.routineId ? { id: options.routineId } : {}) }, orderBy: { createdAt: "asc" } }) : null;
    if (existing && options.routineId && !current) throw new TemplateInputError("A rotina mudou. Reabra a edição do processo.");
    const routineData = { recurrenceRule: JSON.stringify(s), timezone: s.timezone, startsAt: new Date(s.startsAt), endsAt: s.endsAt ? new Date(s.endsAt + "T23:59:59Z") : null, generationLeadTime: s.generationLeadTime, pendingPreviousPolicy: s.pendingPreviousPolicy, status: "ACTIVE" };
    const r = current ? await tx.routine.update({ where: { id: current.id }, data: routineData }) : await tx.routine.create({ data: { ...routineData, processId: process.id } });
    routineId = r.id;
  } else if (existing) await tx.routine.updateMany({ where: { processId: existing.id, status: "ACTIVE" }, data: { status: "PAUSED" } });
  let notifications: Awaited<ReturnType<typeof materializeProcessTasks>> = [];
  if (!existing && !definition.schedule) {
    const execution = await tx.processExecution.create({ data: { organizationId: context.organizationId, processId: process.id, locationId: location.id,
      scheduledAt: now, availableAt: now, startedAt: now, status: "IN_PROGRESS", definitionSnapshot: definition as unknown as Prisma.InputJsonValue } });
    notifications = await materializeProcessTasks(tx, context, execution, definition, now);
    await tx.activityLog.create({ data: { organizationId: context.organizationId, actorId: context.memberId, action: "EXECUTION_GENERATED", entityType: "EXECUTION", entityId: execution.id } });
  }
  await tx.activityLog.create({ data: { organizationId: context.organizationId, actorId: context.memberId, action: existing ? "PROCESS_UPDATED" : "PROCESS_CREATED", entityType: "PROCESS", entityId: process.id, metadata: { version: version.version, taskCount: definition.tasks.length, ...(origin ? { templateReference: origin.reference } : {}) } } });
  if (origin) await tx.activityLog.create({ data: { organizationId: context.organizationId, actorId: context.memberId, action: "PROCESS_CREATED_FROM_TEMPLATE", entityType: "PROCESS", entityId: process.id, metadata: { templateReference: origin.reference, templateVersion: origin.version, processVersionId: version.id } } });
  return { id: process.id, routineId, notifications };
}
