import { z } from "zod";

export const memberAccessSchema = z.object({
  memberId: z.string().min(1).max(128),
  role: z.enum(["ADMIN", "MANAGER", "EMPLOYEE"]),
  teamIds: z.array(z.string().min(1).max(128)).max(100),
  primaryTeamId: z.string().max(128),
  locations: z.array(z.object({
    locationId: z.string().min(1).max(128),
    type: z.enum(["PRIMARY", "SECONDARY", "TEMPORARY"]),
    startsAt: z.iso.datetime().nullable(),
    expiresAt: z.iso.datetime().nullable(),
  }).strict()).max(100),
}).strict().superRefine((value, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  if (new Set(value.teamIds).size !== value.teamIds.length) fail("Uma equipe foi selecionada mais de uma vez.");
  if (value.teamIds.length && !value.teamIds.includes(value.primaryTeamId)) fail("Escolha uma equipe principal entre as selecionadas.");
  if (!value.teamIds.length && value.primaryTeamId) fail("A equipe principal precisa estar selecionada.");
  if (new Set(value.locations.map(location => location.locationId)).size !== value.locations.length) fail("Uma unidade foi selecionada mais de uma vez.");
  if (value.locations.filter(location => location.type === "PRIMARY").length > 1) fail("Escolha apenas uma unidade principal.");
  for (const location of value.locations) {
    if (location.type === "TEMPORARY" && (!location.startsAt || !location.expiresAt)) fail("Informe início e fim de cada acesso temporário.");
    if (location.startsAt && location.expiresAt && location.startsAt >= location.expiresAt) fail("O fim do acesso precisa ser posterior ao início.");
  }
});

export type MemberAccessInput = z.infer<typeof memberAccessSchema>;

export function canManageMember(
  actorRole: string,
  actorId: string,
  target: { id: string; role: string },
  newRole = target.role
) {
  if (actorId === target.id) return false;
  if (["OWNER", "SUPERADMIN"].includes(target.role)) return false;

  if (actorRole === "OWNER") return true;

  if (actorRole === "ADMIN") {
    return target.role !== "ADMIN" && newRole !== "ADMIN";
  }

  if (actorRole === "MANAGER") {
    // Gestores só podem gerenciar quem for EMPLOYEE e não podem promover a ADMIN
    return target.role === "EMPLOYEE" && newRole !== "ADMIN" && newRole !== "OWNER";
  }

  return false;
}

export function canDeleteMember(
  actorRole: string,
  actorId: string,
  target: { id: string; role: string }
) {
  // Apenas OWNER e ADMIN (Gerente Geral) podem excluir permanentemente do banco de dados
  if (!["OWNER", "ADMIN"].includes(actorRole)) return false;
  if (actorId === target.id) return false;
  if (["OWNER", "SUPERADMIN"].includes(target.role)) return false;
  if (actorRole === "ADMIN" && target.role === "ADMIN") return false;
  return true;
}

