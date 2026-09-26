"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/infrastructure/database/prisma";
import { getLoginChallenge, clearLoginChallenge, credentialVersion } from "@/infrastructure/security/login-challenge";
import { openTotp, sealTotp, secondFactorProof, verifyTotp, hashRecoveryCode } from "@/infrastructure/security/totp";
import { createSession } from "@/infrastructure/security/session";
import { Role } from "@/domain/types";

export async function verifySecondFactorAction(_previous: { error?: string }, form: FormData): Promise<{ error?: string }> {
  const challenge = await getLoginChallenge();
  if (!challenge) return { error: "Sua verificação expirou. Volte ao login e entre novamente." };
  const rawCode = String(form.get("code") || "").trim();
  const isTotp = /^\d{6}$/.test(rawCode);
  const isRecovery = /^[A-Za-z0-9]{4}-?[A-Za-z0-9]{4}$/.test(rawCode);
  if (!isTotp && !isRecovery) return { error: "Informe os seis dígitos do autenticador ou um código de recuperação." };

  const result = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"2fa:" + challenge.userId}))`;
    const user = await tx.user.findUnique({ where: { id: challenge.userId } });
    if (!user || user.status !== "ACTIVE") return { error: "Acesso inválido. Entre novamente." };
    const member = challenge.memberId ? await tx.organizationMember.findFirst({ where: { id: challenge.memberId, userId: user.id, status: "ACTIVE", organization: { status: "ACTIVE" } } }) : null;
    if (challenge.memberId && !member) return { error: "Seu vínculo mudou. Entre novamente." };
    const credentials = challenge.memberId ? `${user.passwordHash ?? ""}:${member?.pinHash ?? ""}` : user.passwordHash;
    if (credentialVersion(credentials) !== challenge.credentialVersion) return { error: "Seu acesso foi alterado. Entre novamente." };

    if (isRecovery) {
      if (!user.twoFactorRecoveryCodes) return { error: "Nenhum código de recuperação cadastrado para esta conta." };
      let codes: string[] = [];
      try { codes = JSON.parse(user.twoFactorRecoveryCodes); } catch { codes = []; }
      const hashed = hashRecoveryCode(rawCode);
      const idx = codes.indexOf(hashed);
      if (idx === -1) return { error: "Código de recuperação inválido ou já utilizado." };
      codes.splice(idx, 1);
      await tx.user.update({ where: { id: user.id }, data: { twoFactorRecoveryCodes: JSON.stringify(codes) } });
      return { user, proof: secondFactorProof(user.twoFactorSecret) };
    }

    if (challenge.enrollSecret && user.twoFactorEnabled && user.twoFactorSecret) return { error: "A autenticação já foi configurada. Entre novamente." };
    const previous = user.twoFactorSecret ? openTotp(user.twoFactorSecret) : null;
    if (previous && previous.lockedUntil > Date.now()) return { error: "Muitas tentativas. Aguarde 5 minutos antes de entrar novamente." };
    const secret = challenge.enrollSecret ?? previous?.secret;
    if (!secret) return { error: "A verificação não está configurada. Entre em contato com o administrador." };
    const counter = verifyTotp(secret, rawCode, challenge.enrollSecret ? -1 : previous?.lastCounter);
    if (counter === null) {
      const failures = (previous?.failures ?? 0) + 1;
      await tx.user.update({ where: { id: user.id }, data: { ...(challenge.enrollSecret ? { twoFactorEnabled: false } : {}), twoFactorSecret: sealTotp({ secret, lastCounter: previous?.lastCounter ?? -1, failures: failures >= 5 ? 0 : failures, lockedUntil: failures >= 5 ? Date.now() + 300000 : 0 }) } });
      return { error: failures >= 5 ? "Muitas tentativas. Aguarde 5 minutos e entre novamente." : "Código inválido ou já utilizado. Confira o aplicativo autenticador." };
    }
    const sealed = sealTotp({ secret, lastCounter: counter, failures: 0, lockedUntil: 0 });
    await tx.user.update({ where: { id: user.id }, data: { twoFactorEnabled: true, twoFactorSecret: sealed } });
    return { user, proof: secondFactorProof(sealed) };
  });
  if (result.error || !result.user) return { error: result.error ?? "Não foi possível verificar." };
  const { user, proof } = result;
  await clearLoginChallenge();
  if (user.platformRole === "SUPERADMIN") {
    await createSession({ userId: user.id, name: user.name, email: user.email, activeOrgId: "", activeMemberId: "", role: Role.SUPERADMIN, secondFactorProof: proof });
    redirect("/superadmin");
  }
  const members = await prisma.organizationMember.findMany({ where: { userId: user.id, status: "ACTIVE", organization: { status: "ACTIVE" }, ...(challenge.memberId ? { id: challenge.memberId } : {}) } });
  if (!members.length) return { error: "Você não possui vínculo ativo. Consulte a administração." };
  const member = members[0];
  await createSession({ userId: user.id, name: user.name, email: user.email, activeOrgId: member.organizationId, activeMemberId: member.id, role: member.role as Role, employeeCode: member.employeeCode, secondFactorProof: proof });
  redirect(members.length > 1 ? "/select-org" : member.role === "EMPLOYEE" ? "/tasks" : "/overview");
}
