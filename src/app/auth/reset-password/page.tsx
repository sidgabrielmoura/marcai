import { redirect } from "next/navigation";

interface LegacyResetPasswordRedirectProps {
  searchParams: Promise<{
    token?: string;
  }>;
}

export default async function LegacyResetPasswordPage({ searchParams }: LegacyResetPasswordRedirectProps) {
  const { token } = await searchParams;
  if (token) {
    redirect(`/redefinir-senha?token=${encodeURIComponent(token)}`);
  }
  redirect("/esqueci-senha");
}
