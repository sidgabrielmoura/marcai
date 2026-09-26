import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
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
  title: "Marcai — Tarefas, processos e equipes",
  description:
    "Organize tarefas, conecte equipes e acompanhe os processos da sua operação.",
  manifest: "/manifest.json",
  icons: { icon: "/brand-icon.svg", apple: "/brand-icon.svg" },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "MarcAI",
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
      <body className="min-h-full flex flex-col font-sans text-[var(--text-primary)]">
        {children}
      </body>
    </html>
  );
}
