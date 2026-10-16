"use server";

import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import {savePasskeyChallenge,pendingPasskeyChallenge,consumePasskeyChallenge,clearPasskeyChallenge} from "@/infrastructure/security/passkey-challenge";
import {rate} from "@/application/mobile/security";
import { prisma } from "@/infrastructure/database/prisma";
import { getSession, createSession, clearSession } from "@/infrastructure/security/session";
import { Role } from "@/domain/types";
import { redirect } from "next/navigation";
import { beginLoginChallenge } from "@/infrastructure/security/login-challenge";

// Helper to dynamically resolve WebAuthn RP configuration & allowed origins
async function getWebAuthnConfig(){
 const canonical='https://marcai-coral.vercel.app';
 if(process.env.NODE_ENV==='production'){
  const url=new URL(process.env.NEXT_PUBLIC_APP_URL||process.env.APP_URL||canonical);
  if(url.origin!==canonical)throw new Error('Origem de produção inválida.');
  return {rpName:'Marcaí',rpID:url.hostname,origins:[url.origin]};
 }
 const {headers}=await import('next/headers'),h=await headers();
 const host=h.get('host')||'localhost:3000';
 const url=new URL('http://'+host);
 if(!['localhost','127.0.0.1'].includes(url.hostname))throw new Error('Configure uma origem de desenvolvimento autorizada.');
 return {rpName:'Marcaí',rpID:url.hostname,origins:[url.origin]};
}

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

  const { rpName, rpID } = await getWebAuthnConfig();

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID: new Uint8Array(Buffer.from(user.id)),
    userName: user.email || user.name,
    // Require user verification for biometric
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "required",
    },
    // Prevent re-registration of existing credentials
    excludeCredentials: user.passkeys.map((passkey: any) => ({
      id: passkey.credentialID,
      type: "public-key",
      transports: passkey.transports ? (passkey.transports.split(",") as any[]) : undefined,
    })),
  });

  await savePasskeyChallenge(options.challenge,'registration',user.id);

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

  const expectedChallenge=await pendingPasskeyChallenge('registration');
  if (!user || !expectedChallenge) throw new Error('Desafio não encontrado');
  await rate('web-passkey-register:'+user.id,10);

  const { rpID, origins } = await getWebAuthnConfig();

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origins,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
  } catch (error: any) {
    console.error("Verification failed", error);
    return { error: "Não foi possível verificar a chave de acesso. Tente novamente." };
  }

  const { verified, registrationInfo } = verification;

  if (verified && registrationInfo) {
    const { credential, credentialDeviceType, credentialBackedUp } = registrationInfo;
    const credentialID = credential.id;
    const credentialPublicKey = Buffer.from(credential.publicKey);
    const counter = BigInt(credential.counter);

    await prisma.$transaction(async tx=>{
    await consumePasskeyChallenge(tx,expectedChallenge,'registration',user.id);
    await tx.passkeyAuthenticator.create({
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

    });
    await clearPasskeyChallenge('registration');

    return { success: true };
  }

  return { error: "A verificação falhou." };
}

// ========================
// Authentication / Login
// ========================

// Generate options for login (No specific user since it's a passkey discoverable credential)
export async function generateWebAuthnAuthentication() {
  const { rpID } = await getWebAuthnConfig();
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "required",
  });

  await savePasskeyChallenge(options.challenge,'authentication');

  return options;
}

export async function verifyWebAuthnAuthentication(response: any, mobileAuthToken?: string) {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const expectedChallenge=await pendingPasskeyChallenge('authentication');
  if(expectedChallenge)await rate('web-passkey-auth:'+expectedChallenge,10);

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

  const { rpID, origins } = await getWebAuthnConfig();

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origins,
      expectedRPID: rpID,
      credential: {
        id: authenticator.credentialID,
        publicKey: new Uint8Array(authenticator.credentialPublicKey),
        counter: Number(authenticator.counter),
        transports: authenticator.transports ? (authenticator.transports.split(",") as any[]) : undefined,
      },
      requireUserVerification: true,
    });
  } catch (error: any) {
    console.error("Authentication failed", error);
    return { error: "Não foi possível verificar a chave de acesso. Tente novamente." };
  }

  if (!verification.verified) {
    return { error: "Verificação falhou." };
  }

  await prisma.$transaction(async tx=>{
    await consumePasskeyChallenge(tx,expectedChallenge,'authentication');
    const updated=await tx.passkeyAuthenticator.updateMany({where:{id:authenticator.id,counter:authenticator.counter},data:{counter:BigInt(verification.authenticationInfo.newCounter),lastUsedAt:new Date()}});
    if(updated.count!==1)throw new Error('A chave foi utilizada em outra tentativa. Tente novamente.');
  });
  await clearPasskeyChallenge('authentication');

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

    const approved=await prisma.mobileAuthSession.updateMany({
      where: { token: mobileAuthToken,status:"PENDING",createdAt:{gt:new Date(Date.now()-300000)} },
      data: {
        status: "APPROVED",
        userId: user.id,
        memberId: memberId,
      },
    });

    if(approved.count!==1)return {error:"QR expirado ou já utilizado."};
    return { success: true, isMobileAuth: true };
  }

  // Create session just like loginWithPasswordAction
  if (user.platformRole === "SUPERADMIN" || user.twoFactorEnabled) {
    await clearSession();
    await beginLoginChallenge(user, null);
    return { success: true, redirectUrl: "/verify-access" };
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
    return {
      success: true,
      redirectUrl: member.role === "EMPLOYEE" ? "/tasks" : "/overview",
    };
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

  return { success: true, redirectUrl: "/select-org" };
}
