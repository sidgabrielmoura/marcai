"use server";

import { prisma } from "@/infrastructure/database/prisma";
import { createId } from "@paralleldrive/cuid2";

export async function generateMobileAuthTokenAction() {
  const token = createId();
  await prisma.mobileAuthSession.create({
    data: {
      token,
      status: "PENDING",
    },
  });
  return { token };
}

export async function checkMobileAuthTokenAction(token: string) {
  const session = await prisma.mobileAuthSession.findUnique({
    where: { token },
  });

  if (!session) {
    return "INVALID";
  }

  return session.status;
}
