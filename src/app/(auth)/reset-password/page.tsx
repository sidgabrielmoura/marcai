import { redirect } from "next/navigation";

interface ResetPasswordRedirectProps {
  searchParams: Promise<{
    token?: string;
  }>;
}

export default async function ResetPasswordPage({ searchParams }: ResetPasswordRedirectProps) {
  const { token } = await searchParams;
  if (token) {
    redirect(`/redefinir-senha?token=${encodeURIComponent(token)}`);
  }
  redirect("/esqueci-senha");
}
