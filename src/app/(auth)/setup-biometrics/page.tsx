import { redirect } from "next/navigation";
import { getSession } from "@/infrastructure/security/session";
import { prisma } from "@/infrastructure/database/prisma";
import { SetupBiometricsClient } from "./setup-biometrics-client";

interface SetupBiometricsPageProps {
  searchParams: Promise<{ next?: string }>;
}

export default async function SetupBiometricsPage({
  searchParams,
}: SetupBiometricsPageProps) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const { next } = await searchParams;
  const fallbackDestination =
    session.role === "SUPERADMIN"
      ? "/superadmin"
      : session.role === "EMPLOYEE"
        ? "/tasks"
        : "/overview";
  const isSafeNext =
    Boolean(next) &&
    next!.startsWith("/") &&
    !next!.startsWith("//") &&
    !next!.includes("\\");
  const nextUrl = isSafeNext ? (next as string) : fallbackDestination;

  // Busca se o usuário já possui alguma chave biométrica
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      name: true,
      passkeys: { select: { id: true } },
    },
  });

  // Se o usuário já possui biometria cadastrada, redireciona diretamente
  if (!user || user.passkeys.length > 0) {
    redirect(nextUrl);
  }

  return (
    <SetupBiometricsClient
      userName={user.name || session.name || "colaborador"}
      nextUrl={nextUrl}
    />
  );
}
