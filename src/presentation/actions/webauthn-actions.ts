"use server";

import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { prisma } from "@/infrastructure/database/prisma";
import { getSession, createSession, clearSession } from "@/infrastructure/security/session";
import { Role } from "@/domain/types";
import { redirect } from "next/navigation";
import { beginLoginChallenge } from "@/infrastructure/security/login-challenge";

// Configuration for WebAuthn
const rpName = "Marcai";
const rpID = process.env.NODE_ENV === "development" ? "localhost" : "marcai.com"; // TODO: Configure prod domain
const origin = process.env.NODE_ENV === "development" ? "http://localhost:3000" : `https://${rpID}`;

export async function generateWebAuthnRegistration() {
  const session = await getSession();
  if (!session) {
    throw new Error("Não autenticado");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: { passkeys: true },
  });

  if (!user) throw new Error("Usuário não encontrado");

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID: new Uint8Array(Buffer.from(user.id)),
    userName: user.email || user.name,
    // Require user verification for biometric
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
    // Prevent re-registration of existing credentials
    excludeCredentials: user.passkeys.map((passkey: any) => ({
      id: passkey.credentialID,
      type: "public-key",
      transports: passkey.transports ? (passkey.transports.split(",") as any[]) : undefined,
    })),
  });

  // Save the challenge in the DB to verify later
  await prisma.user.update({
    where: { id: user.id },
    data: { webauthnChallenge: options.challenge },
  });

  return options;
}

export async function verifyWebAuthnRegistration(response: any) {
  const session = await getSession();
  if (!session) {
    throw new Error("Não autenticado");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
  });

  if (!user || !user.webauthnChallenge) throw new Error("Desafio não encontrado");

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: user.webauthnChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });
  } catch (error: any) {
    console.error("Verification failed", error);
    return { error: error.message };
  }

  const { verified, registrationInfo } = verification;

  if (verified && registrationInfo) {
    const { credential, credentialDeviceType, credentialBackedUp } = registrationInfo;
    const credentialID = credential.id;
    const credentialPublicKey = Buffer.from(credential.publicKey);
    const counter = BigInt(credential.counter);

    await prisma.passkeyAuthenticator.create({
      data: {
        userId: user.id,
        credentialID: credentialID,
        credentialPublicKey: Buffer.from(credentialPublicKey),
        counter: BigInt(counter),
        credentialDeviceType,
        credentialBackedUp,
        transports: response.response.transports ? response.response.transports.join(",") : null,
      },
    });

    // Clear challenge
    await prisma.user.update({
      where: { id: user.id },
      data: { webauthnChallenge: null },
    });

    return { success: true };
  }

  return { error: "A verificação falhou." };
}

// ========================
// Authentication / Login
// ========================

// Generate options for login (No specific user since it's a passkey discoverable credential)
export async function generateWebAuthnAuthentication() {
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "preferred",
  });

  // We need to store this challenge somewhere, but the user is not logged in.
  // We can't store it in the user's DB record because we don't know the user yet.
  // Storing it in an anonymous session or a separate "LoginChallenge" table/cookie.
  // For simplicity, we can set a cookie with the challenge.
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  cookieStore.set("webauthn_challenge", options.challenge, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 5, // 5 minutes
    path: "/",
  });

  return options;
}

export async function verifyWebAuthnAuthentication(response: any, mobileAuthToken?: string) {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const expectedChallenge = cookieStore.get("webauthn_challenge")?.value;

  if (!expectedChallenge) {
    return { error: "Desafio de login expirado ou não encontrado." };
  }

  // Find the authenticator
  const authenticator = await prisma.passkeyAuthenticator.findUnique({
    where: { credentialID: response.id },
    include: {
      user: {
        include: {
          memberships: {
            where: { status: "ACTIVE", organization: { status: "ACTIVE" } },
            include: { organization: true },
          },
        },
      },
    },
  });

  if (!authenticator) {
    return { error: "Credencial não encontrada ou inválida." };
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: authenticator.credentialID,
        publicKey: new Uint8Array(authenticator.credentialPublicKey),
        counter: Number(authenticator.counter),
        transports: authenticator.transports ? (authenticator.transports.split(",") as any[]) : undefined,
      },
      requireUserVerification: false,
    });
  } catch (error: any) {
    console.error("Authentication failed", error);
    return { error: error.message };
  }

  if (!verification.verified) {
    return { error: "Verificação falhou." };
  }

  // Update counter
  await prisma.passkeyAuthenticator.update({
    where: { id: authenticator.id },
    data: {
      counter: BigInt(verification.authenticationInfo.newCounter),
      lastUsedAt: new Date(),
    },
  });

  cookieStore.delete("webauthn_challenge");

  const user = authenticator.user;

  if (user.status !== "ACTIVE") {
    return { error: "Usuário inativo." };
  }

  if (mobileAuthToken) {
    // If it's a mobile auth verification, update the token instead of setting cookies
    // Find member to associate with this session
    const activeMembers = user.memberships.filter((m) => m.status === "ACTIVE");
    if (activeMembers.length === 0) {
      return { error: "Usuário não possui vínculos ativos." };
    }
    
    // Choose the first active member as the logged in identity
    const memberId = activeMembers[0].id;
    
    await prisma.mobileAuthSession.update({
      where: { token: mobileAuthToken },
      data: {
        status: "APPROVED",
        userId: user.id,
        memberId: memberId,
      },
    });

    return { success: true, isMobileAuth: true };
  }

  // Create session just like loginWithPasswordAction
  if (user.platformRole === "SUPERADMIN" || user.twoFactorEnabled) {
    await clearSession();
    await beginLoginChallenge(user, null);
    redirect("/verify-access");
  }

  if (user.memberships.length === 0) {
    return { error: "Usuário não possui vínculos ativos." };
  }

  if (user.memberships.length === 1) {
    const member = user.memberships[0];
    await createSession({
      userId: user.id,
      name: user.name,
      email: user.email,
      activeOrgId: member.organizationId,
      activeMemberId: member.id,
      role: member.role as Role,
      employeeCode: member.employeeCode,
    });
    if (member.role === "EMPLOYEE") redirect("/tasks");
    else redirect("/overview");
  }

  const primaryMember = user.memberships[0];
  await createSession({
    userId: user.id,
    name: user.name,
    email: user.email,
    activeOrgId: primaryMember.organizationId,
    activeMemberId: primaryMember.id,
    role: primaryMember.role as Role,
    employeeCode: primaryMember.employeeCode,
  });

  redirect("/select-org");
}
