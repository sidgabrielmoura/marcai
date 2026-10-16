import { prisma } from "@/infrastructure/database/prisma";
import { randomUUID,createHash } from "node:crypto";
import { mobileSessionContext } from "./mobile-context";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { Role } from "@/domain/types";

const COOKIE_NAME = "gestao_session";
function sessionSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("Configure AUTH_SECRET com pelo menos 32 caracteres.");
  return new TextEncoder().encode(secret);
}

export interface SessionData {
  sessionId?: string;
  userId: string;
  name: string;
  email: string | null;
  activeOrgId: string;
  activeMemberId: string;
  role: Role;
  employeeCode?: string | null;
  secondFactorProof?: string;
}

export async function encryptSession(payload: SessionData): Promise<string> {
  const user=await prisma.user.findUnique({where:{id:payload.userId}});
  const member=payload.activeMemberId?await prisma.organizationMember.findFirst({where:{id:payload.activeMemberId,userId:payload.userId,organizationId:payload.activeOrgId}}):null;
  if(!user||user.status!=="ACTIVE"||(payload.role!=="SUPERADMIN"&&(!member||member.status!=="ACTIVE")))throw new Error("Acesso inválido.");
  const sessionId=randomUUID(),version=createHash("sha256").update((user.passwordHash??"")+":"+(member?.pinHash??"")).digest("hex");
  await prisma.$executeRaw`INSERT INTO web_auth_sessions(id,user_id,member_id,organization_id,credential_version,expires_at) VALUES(${sessionId}::uuid,${payload.userId},${payload.activeMemberId},${payload.activeOrgId},${version},${new Date(Date.now()+7*86400000)})`;
  return new SignJWT({ ...payload,sessionId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(sessionSecret());
}

export async function decryptSession(token: string): Promise<SessionData | null> {
  try {
    const { payload } = await jwtVerify(token, sessionSecret(), {
      algorithms: ["HS256"],
    });
    const data=payload as unknown as SessionData;
    if(typeof data.sessionId!=="string"||!/^[0-9a-f-]{36}$/.test(data.sessionId))return null;
    const [stored]=await prisma.$queryRaw<Array<{credential_version:string}>>`SELECT credential_version FROM web_auth_sessions WHERE id=${data.sessionId}::uuid AND user_id=${data.userId} AND member_id=${data.activeMemberId} AND organization_id=${data.activeOrgId} AND revoked_at IS NULL AND expires_at>now()`;
    if(!stored)return null;
    const user=await prisma.user.findUnique({where:{id:data.userId}});
    const member=data.activeMemberId?await prisma.organizationMember.findFirst({where:{id:data.activeMemberId,userId:data.userId,organizationId:data.activeOrgId},include:{organization:true}}):null;
    if(!user||user.status!=="ACTIVE"||(data.role!=="SUPERADMIN"&&(!member||member.status!=="ACTIVE"||member.organization.status!=="ACTIVE"||member.role!==data.role)))return null;
    const version=createHash("sha256").update((user.passwordHash??"")+":"+(member?.pinHash??"")).digest("hex");
    return version===stored.credential_version?data:null;
  } catch {
    return null;
  }
}

export async function createSession(data: SessionData): Promise<void> {
  const token = await encryptSession(data);
  const cookieStore = await cookies();

  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 dias
  });
}

export async function getSession(): Promise<SessionData | null> {
  const mobile = mobileSessionContext.getStore();
  if (mobile) return mobile;
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return decryptSession(token);
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  const token=cookieStore.get(COOKIE_NAME)?.value;
  cookieStore.delete(COOKIE_NAME);
  if(token){
    try{const {payload}=await jwtVerify(token,sessionSecret(),{algorithms:["HS256"]});
      if(typeof payload.sessionId==="string"&&/^[0-9a-f-]{36}$/.test(payload.sessionId))await prisma.$executeRaw`UPDATE web_auth_sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE id=${payload.sessionId}::uuid`;
    }catch(error){if(error instanceof Error&&error.name.startsWith("JWT"))return;throw error;}
  }
}
