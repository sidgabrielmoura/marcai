"use server";

import { prisma } from "@/infrastructure/database/prisma";
import {bindQr,ownsQr} from "@/infrastructure/security/qr-binding";
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
  return { token };
}

export async function checkMobileAuthTokenAction(token: string) {
  if(!await ownsQr(token))return "INVALID";
  const session = await prisma.mobileAuthSession.findUnique({
    where: { token },
  });

  if (!session||session.createdAt.getTime()<Date.now()-300000) {
    return "INVALID";
  }

  return session.status;
}
