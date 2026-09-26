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
  return new SignJWT({ ...payload })
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
    return payload as unknown as SessionData;
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
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return decryptSession(token);
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
