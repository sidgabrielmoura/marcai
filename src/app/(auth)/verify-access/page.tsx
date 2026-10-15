import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { getLoginChallenge } from "@/infrastructure/security/login-challenge";
import { Brand } from "@/presentation/components/shared/brand";
import { TwoFactorForm } from "@/presentation/components/auth/two-factor-form";
import { prisma } from "@/infrastructure/database/prisma";
import { buildTotpUri } from "@/infrastructure/security/totp";

export default async function VerifyAccessPage() {
  const challenge = await getLoginChallenge();
  if (!challenge) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: challenge.userId },
    select: { email: true, name: true, twoFactorSecret: true, twoFactorEnabled: true },
  });

  let activeSecret: string | null = challenge.enrollSecret;
  let qrCodeDataUrl: string | null = null;
  if (activeSecret) {
    const account = user?.email || user?.name || "usuario";
    const otpauthUrl = buildTotpUri({
      secret: activeSecret,
      accountName: account,
      issuer: "Marcai",
    });
    qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, {
      margin: 1,
      width: 280,
      errorCorrectionLevel: "M",
      color: {
        dark: "#0f172a",
        light: "#ffffff",
      },
    });
  }

  return (
    <main className="min-h-dvh flex items-center justify-center bg-[var(--canvas)] p-4 sm:p-6">
      <div className="w-full max-w-sm flex flex-col items-center">
        <div className="mb-6">
          <Brand />
        </div>
        <div className="w-full bg-[var(--surface)] border border-[var(--border-subtle)] rounded-3xl p-6 sm:p-7 shadow-xl shadow-black/5 flex flex-col">
          <TwoFactorForm
            secret={activeSecret}
            qrCodeDataUrl={qrCodeDataUrl}
            userEmail={user?.email}
          />
        </div>
      </div>
    </main>
  );
}
