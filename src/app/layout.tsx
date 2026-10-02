import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { FirebaseAnalytics } from "@/presentation/components/shared/firebase-analytics";
import { PushNotificationRegistrar } from "@/presentation/components/shared/push-notification-registrar";
import { Toaster } from "@/components/ui/toast";
import { AppReloadLoader } from "@/components/loader/logo-loader";
import "./globals.css";
import "./workspace.css";

const geist = localFont({
  src: "./fonts/Geist-Variable.woff2",
  variable: "--font-geist-sans",
  display: "swap",
  weight: "100 900",
  style: "normal",
});

export const metadata: Metadata = {
  title: "Marcaí — Tarefas, processos e equipes",
  description:
    "Organize tarefas, conecte equipes e acompanhe os processos da sua operação.",
  manifest: "/manifest.json",
  icons: { icon: "/brand-icon.svg", apple: "/brand-icon.svg" },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Marcaí",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#164d36",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="pt-BR"
      data-scroll-behavior="smooth"
      className={`${geist.variable} h-full antialiased font-sans`}
    >
      <body className="min-h-full flex flex-col font-sans text-(--text-primary)">
        <AppReloadLoader size={128} />
        <FirebaseAnalytics />
        <PushNotificationRegistrar />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
