"use server";

import { prisma } from "@/infrastructure/database/prisma";
import {bindQr,qrInitiatorHash} from "@/infrastructure/security/qr-binding";
import { createId } from "@paralleldrive/cuid2";

export async function generateMobileAuthTokenAction() {
  const token = createId();
  await prisma.mobileAuthSession.create({
    data: {
      token,
      status: "PENDING",
    },
  });
  await bindQr(token);
  return { token, expiresAt: new Date(Date.now()+300000).toISOString() };
}

export async function checkMobileAuthTokenAction(token: string) {
  const binding=await qrInitiatorHash();
  if(!binding || !/^[a-z0-9]{1,128}$/i.test(token))return "INVALID";
  const [session]=await prisma.$queryRaw<Array<{status:string}>>`
    SELECT s.status FROM mobile_auth_sessions s JOIN web_qr_bindings b ON b.token=s.token
    WHERE s.token=${token} AND b.initiator_hash=${binding} AND b.expires_at>now()
    AND s."createdAt">now()-interval '5 minutes'`;
  return session?.status ?? "INVALID";
}
