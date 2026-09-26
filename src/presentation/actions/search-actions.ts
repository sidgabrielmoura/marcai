"use server";

import { z } from "zod";
import { prisma } from "@/infrastructure/database/prisma";
import { getAuthenticatedContext, getSuperadminContext } from "@/application/security/auth-context";
import { getSession } from "@/infrastructure/security/session";
import { taskScope, processScope, isManagement } from "@/application/security/operational-scope";
import { readProcessDefinition } from "@/domain/rules/process-definition";

export type SearchResult = { id: string; group: string; title: string; detail: string; href: string };

export async function searchWorkspaceAction(query: string): Promise<SearchResult[]> {
  const parsed = z.string().trim().min(2).max(100).safeParse(query);
  if (!parsed.success) return [];
  const contains = { contains: parsed.data, mode: "insensitive" as const };
  const session = await getSession();
  if (!session) return [];
  if (session.role === "SUPERADMIN") {
    if (!await getSuperadminContext(false)) return [];
    const [organizations, users] = await Promise.all([
      prisma.organization.findMany({ where: { name: contains }, select: { id: true, name: true, slug: true }, take: 6, orderBy: { name: "asc" } }),
      prisma.user.findMany({ where: { name: contains }, select: { id: true, name: true }, take: 6, orderBy: { name: "asc" } }),
    ]);
    return [
      ...organizations.map(o => ({ id: o.id, group: "Organizações", title: o.name, detail: o.slug, href: `/superadmin?view=organizations&q=${encodeURIComponent(o.name)}` })),
      ...users.map(u => ({ id: u.id, group: "Usuários", title: u.name, detail: "Usuário da plataforma", href: `/superadmin?view=users&q=${encodeURIComponent(u.name)}` })),
    ];
  }
  const c = await getAuthenticatedContext(false);
  if (!c) return [];
  const tasks = await prisma.task.findMany({ where: { ...taskScope(c), deletedAt: null, title: contains }, select: { id: true, title: true, location: { select: { name: true } } }, orderBy: { updatedAt: "desc" }, take: 8 });
  const results: SearchResult[] = tasks.map(t => ({ id: t.id, group: "Tarefas", title: t.title, detail: t.location?.name ?? "Sem unidade", href: `${isManagement(c) ? "/management" : ""}/tasks/${t.id}` }));
  if (!isManagement(c)) return results;
  const [processes, locations, teams, people, executions, routines, evidences] = await Promise.all([
    prisma.process.findMany({ where: { ...processScope(c), name: contains }, include: { sourceTemplateVersion: { select: { definition: true } }, location: { select: { name: true } } }, take: 8, orderBy: { name: "asc" } }),
    prisma.location.findMany({ where: { organizationId: c.organizationId, name: contains, ...(c.role === "MANAGER" ? { id: { in: c.scope?.locationIds ?? [] } } : {}) }, select: { id: true, name: true }, take: 5, orderBy: { name: "asc" } }),
    prisma.team.findMany({ where: { organizationId: c.organizationId, name: contains, ...(c.role === "MANAGER" ? { id: { in: c.scope?.teamIds ?? [] } } : {}) }, select: { id: true, name: true }, take: 5, orderBy: { name: "asc" } }),
    prisma.organizationMember.findMany({ where: { organizationId: c.organizationId, user: { name: contains }, ...(c.role === "MANAGER" ? { teamMemberships: { some: { teamId: { in: c.scope?.teamIds ?? [] } } }, locationAccesses: { some: { locationId: { in: c.scope?.locationIds ?? [] }, AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }] }, { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }] } } } : {}) }, select: { id: true, user: { select: { name: true } } }, take: 5 }),
    prisma.processExecution.findMany({ where: { organizationId: c.organizationId, process: { name: contains, ...(c.role === "MANAGER" ? processScope(c) : {}) } }, include: { process: { select: { name: true } } }, take: 5, orderBy: { scheduledAt: "desc" } }),
    prisma.routine.findMany({ where: { process: { organizationId: c.organizationId, name: contains, ...(c.role === "MANAGER" ? processScope(c) : {}) } }, include: { process: { select: { name: true } } }, take: 5 }),
    prisma.evidenceSubmission.findMany({ where: { requirement: { task: { ...taskScope(c), deletedAt: null } }, value: contains }, include: { requirement: { include: { task: { select: { id: true, title: true } } } } }, take: 5, orderBy: { createdAt: "desc" } }),
  ]);
  for (const p of processes) {
    const definition = readProcessDefinition(p.sourceTemplateVersion?.definition);
    if (c.role === "MANAGER" && (!definition || definition.tasks.some(t => !c.scope?.teamIds.includes(t.teamId)))) continue;
    results.push({ id: p.id, group: "Processos", title: p.name, detail: p.location?.name ?? "Processo", href: `/management/processes/${p.id}/edit` });
  }
  results.push(...locations.map(l => ({ id: l.id, group: "Unidades", title: l.name, detail: "Unidade operacional", href: `/management/locations#location-${l.id}` })));
  results.push(...teams.map(t => ({ id: t.id, group: "Equipes", title: t.name, detail: "Equipe da organização", href: `/management/teams#team-${t.id}` })));
  results.push(...people.map(m => ({ id: m.id, group: "Pessoas", title: m.user.name, detail: "Membro da organização", href: `/management/people#member-${m.id}` })));
  results.push(...executions.map(e => ({ id: e.id, group: "Execuções", title: `Execução: ${e.process.name}`, detail: `Status: ${e.status}`, href: `/management/executions` })));
  results.push(...routines.map(r => ({ id: r.id, group: "Rotinas", title: `Rotina: ${r.process.name}`, detail: `Frequência configurada`, href: `/management/routines` })));
  results.push(...evidences.map(ev => ({ id: ev.id, group: "Evidências", title: `Evidência em: ${ev.requirement.task.title}`, detail: ev.value?.slice(0, 40) ?? "Arquivo anexado", href: `/management/tasks/${ev.requirement.task.id}` })));
  return results;
}
