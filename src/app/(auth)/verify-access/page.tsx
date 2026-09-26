import { redirect } from "next/navigation";
import { getLoginChallenge } from "@/infrastructure/security/login-challenge";
import { Brand } from "@/presentation/components/shared/brand";
import { TwoFactorForm } from "@/presentation/components/auth/two-factor-form";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

export default async function VerifyAccessPage() {
  const challenge = await getLoginChallenge();
  if (!challenge) redirect("/login");
  return <main className="min-h-dvh flex items-center justify-center bg-[var(--canvas)] p-5">
    <Card className="w-full max-w-md"><CardHeader><Brand /><CardTitle className="mt-5"><h1>{challenge.enrollSecret ? "Proteja seu acesso" : "Confirme seu acesso"}</h1></CardTitle><CardDescription>{challenge.enrollSecret ? "O acesso de superadmin exige autenticação em duas etapas. Configure seu aplicativo autenticador para continuar." : "Digite o código temporário do seu aplicativo autenticador."}</CardDescription></CardHeader><CardContent><TwoFactorForm secret={challenge.enrollSecret} /></CardContent></Card>
  </main>;
}
