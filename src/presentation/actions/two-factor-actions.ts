"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/infrastructure/database/prisma";
import { getLoginChallenge, clearLoginChallenge, credentialVersion, refreshLoginChallengeWithNewSecret } from "@/infrastructure/security/login-challenge";
import { openTotp, sealTotp, secondFactorProof, verifyTotp, hashRecoveryCode,generateRecoveryCodes } from "@/infrastructure/security/totp";
import { createSession } from "@/infrastructure/security/session";
import { rate } from "@/application/mobile/security";
import { Role } from "@/domain/types";

export type SecondFactorState={error?:string;recoveryCodes?:string[];redirectUrl?:string};
export async function verifySecondFactorAction(_previous: SecondFactorState, form: FormData): Promise<SecondFactorState> {
  const challenge = await getLoginChallenge();
  if (!challenge) return { error: "Sua verificação expirou. Volte ao login e entre novamente." };
  try{await rate("web-second-factor:"+challenge.userId,5);}catch{return {error:"Muitas tentativas. Aguarde 5 minutos."};}
  const rawCode = String(form.get("code") || "").trim();
  const cleanCode = rawCode.replace(/[\s-]+/g, "").toUpperCase();
  const isTotp = /^\d{6}$/.test(cleanCode);
  const isRecovery = /^[A-Za-z0-9]{4}-?[A-Za-z0-9]{4}$/.test(rawCode.trim()) || /^[A-Za-z0-9]{8}$/.test(cleanCode);
  if (!isTotp && !isRecovery) return { error: "Informe os 6 dígitos do autenticador." };

  const result = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"2fa:" + challenge.userId}))`;
    if(!challenge.challengeId)return {error:"Sua verificação expirou. Entre novamente."};
    const [pending]=await tx.$queryRaw<Array<{id:string;failures:number}>>`SELECT id,failures FROM web_login_challenges WHERE id=${challenge.challengeId}::uuid AND user_id=${challenge.userId} AND consumed_at IS NULL AND expires_at>now() FOR UPDATE`;
    if(!pending||pending.failures>=5)return {error:"Sua verificação expirou ou já foi utilizada."};
    const user = await tx.user.findUnique({
      where: { id: challenge.userId },
      include: {
        memberships: {
          where: { status: "ACTIVE", organization: { status: "ACTIVE" } },
          include: { organization: true },
        },
      },
    });
    if (!user || user.status !== "ACTIVE") return { error: "Acesso inválido. Entre novamente." };
    const member = challenge.memberId ? await tx.organizationMember.findFirst({ where: { id: challenge.memberId, userId: user.id, status: "ACTIVE", organization: { status: "ACTIVE" } } }) : null;
    if (challenge.memberId && !member) return { error: "Seu vínculo mudou. Entre novamente." };
    const credentials = challenge.memberId ? `${user.passwordHash ?? ""}:${member?.pinHash ?? ""}` : user.passwordHash;
    if (credentialVersion(credentials) !== challenge.credentialVersion) return { error: "Seu acesso foi alterado. Entre novamente." };

    if (isRecovery) {
      if (!user.twoFactorRecoveryCodes) return { error: "Nenhum código de recuperação cadastrado para esta conta." };
      let codes: string[] = [];
      try { codes = JSON.parse(user.twoFactorRecoveryCodes); } catch { codes = []; }
      const normalizedRecovery = rawCode.includes("-") ? rawCode.trim() : `${cleanCode.slice(0, 4)}-${cleanCode.slice(4)}`;
      const hashed = hashRecoveryCode(normalizedRecovery);
      const idx = codes.indexOf(hashed);
      if (idx === -1) return { error: "Código de recuperação inválido ou já utilizado." };
      codes.splice(idx, 1);
      await tx.user.update({ where: { id: user.id }, data: { twoFactorRecoveryCodes: JSON.stringify(codes) } });
      await tx.$executeRaw`UPDATE web_login_challenges SET consumed_at=now() WHERE id=${challenge.challengeId}::uuid`;
      return { user, proof: secondFactorProof(user.twoFactorSecret),recoveryCodes:undefined as string[]|undefined };
    }

    const isEnrolling = !!challenge.enrollSecret;
    const previous = user.twoFactorSecret ? openTotp(user.twoFactorSecret) : null;
    if (previous && previous.lockedUntil > Date.now()) return { error: "Muitas tentativas. Aguarde 5 minutos antes de entrar novamente." };
    const secret = challenge.enrollSecret ?? previous?.secret;
    if (!secret) return { error: "A verificação não está configurada. Entre em contato com o administrador." };
    const counter = verifyTotp(secret, cleanCode, isEnrolling ? -1 : previous?.lastCounter);
    if (counter === null) {
      if(isEnrolling){await tx.$executeRaw`UPDATE web_login_challenges SET failures=failures+1 WHERE id=${challenge.challengeId}::uuid`;return {error:pending.failures>=4?"Muitas tentativas. Aguarde 5 minutos e entre novamente.":"Código incorreto. Confira o autenticador."};}
      const failures = (previous?.failures ?? 0) + 1;
      await tx.user.update({
        where: { id: user.id },
        data: {
          twoFactorSecret: sealTotp({
            secret,
            lastCounter: previous?.lastCounter ?? -1,
            failures: failures >= 5 ? 0 : failures,
            lockedUntil: failures >= 5 ? Date.now() + 300000 : 0,
          }),
        },
      });
      return {
        error:
          failures >= 5
            ? "Muitas tentativas. Aguarde 5 minutos e entre novamente."
            : "Código incorreto ou expirado. Confira o código de 6 dígitos no aplicativo.",
      };
    }
    const sealed = sealTotp({ secret, lastCounter: counter, failures: 0, lockedUntil: 0 });
    const recoveryCodes=isEnrolling?generateRecoveryCodes():undefined;
    await tx.user.update({ where: { id: user.id }, data: { twoFactorEnabled: true, twoFactorSecret: sealed,...(recoveryCodes?{twoFactorRecoveryCodes:JSON.stringify(recoveryCodes.map(hashRecoveryCode))}:{}) } });
    await tx.$executeRaw`UPDATE web_login_challenges SET consumed_at=now() WHERE id=${challenge.challengeId}::uuid`;
    return { user, proof: secondFactorProof(sealed),recoveryCodes };
  });
  if (result.error || !result.user) return { error: result.error ?? "Não foi possível verificar." };
  const { user, proof } = result;
  const finish=(destination:string):SecondFactorState=>{if(result.recoveryCodes)return {recoveryCodes:result.recoveryCodes,redirectUrl:destination};redirect(destination);};
  await clearLoginChallenge();
  const userPasskeysCount = await prisma.passkeyAuthenticator.count({ where: { userId: user.id } });

  if (user.platformRole === "SUPERADMIN") {
    await createSession({ userId: user.id, name: user.name, email: user.email, activeOrgId: "", activeMemberId: "", role: Role.SUPERADMIN, secondFactorProof: proof });
    if (userPasskeysCount === 0) {
      return finish(`/setup-biometrics?next=${encodeURIComponent("/superadmin")}`);
    }
    return finish("/superadmin");
  }
  const members = challenge.memberId
    ? await prisma.organizationMember.findMany({ where: { id: challenge.memberId, userId: user.id, status: "ACTIVE", organization: { status: "ACTIVE" } }, include: { organization: true } })
    : (user.memberships || []);
  if (!members.length) return { error: "Você não possui vínculo ativo. Consulte a administração." };
  const member = members[0];
  await createSession({ userId: user.id, name: user.name, email: user.email, activeOrgId: member.organizationId, activeMemberId: member.id, role: member.role as Role, employeeCode: member.employeeCode, secondFactorProof: proof });
  const destination = members.length > 1 ? "/select-org" : member.role === "EMPLOYEE" ? "/tasks" : "/overview";
  if (userPasskeysCount === 0) {
    return finish(`/setup-biometrics?next=${encodeURIComponent(destination)}`);
  }
  return finish(destination);
}

export async function regenerateTwoFactorSecretAction(): Promise<{ error?: string; success?: boolean }> {
  const newSecret = await refreshLoginChallengeWithNewSecret();
  if (!newSecret) return { error: "Sessão expirada. Volte ao login." };
  return { success: true };
}
