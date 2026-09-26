import { EncryptJWT, jwtDecrypt } from "jose";
import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { securityKey, generateTotpSecret } from "./totp";
import { prisma } from "@/infrastructure/database/prisma";

const cookie = "marcai_login_challenge";
export type LoginChallenge = { userId: string; memberId: string | null; enrollSecret: string | null; credentialVersion: string };
export function credentialVersion(hash: string | null) { return createHash("sha256").update(hash ?? "").digest("hex"); }
export async function beginLoginChallenge(user: { id: string; twoFactorEnabled: boolean; twoFactorSecret: string | null; passwordHash: string | null }, memberId: string | null) {
  const member = memberId ? await prisma.organizationMember.findFirst({ where: { id: memberId, userId: user.id, status: "ACTIVE" }, select: { pinHash: true } }) : null;
  const payload: LoginChallenge = { userId: user.id, memberId, enrollSecret: user.twoFactorEnabled && user.twoFactorSecret ? null : generateTotpSecret(), credentialVersion: credentialVersion(memberId ? `${user.passwordHash ?? ""}:${member?.pinHash ?? ""}` : user.passwordHash) };
  const token = await new EncryptJWT({ ...payload }).setProtectedHeader({ alg: "dir", enc: "A256GCM" }).setIssuedAt().setExpirationTime("5m").setAudience("marcai-login").encrypt(securityKey());
  (await cookies()).set(cookie, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 300 });
}
export async function getLoginChallenge(): Promise<LoginChallenge | null> {
  const token = (await cookies()).get(cookie)?.value;
  if (!token) return null;
  try { const { payload } = await jwtDecrypt(token, securityKey(), { audience: "marcai-login" }); return payload as unknown as LoginChallenge; }
  catch { return null; }
}
export async function clearLoginChallenge() { (await cookies()).delete(cookie); }
