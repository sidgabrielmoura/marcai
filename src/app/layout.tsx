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

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://tarefai.com.br";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Tarefaí — Tarefas, processos e equipes",
    template: "%s | Tarefaí",
  },
  description:
    "Organize tarefas, conecte equipes e acompanhe os processos da sua operação em tempo real com o Tarefaí.",
  applicationName: "Tarefaí",
  keywords: [
    "tarefai",
    "tarefas",
    "gestão de tarefas",
    "processos operacionais",
    "rotinas operacionais",
    "gestão de equipes",
    "produtividade",
    "operações",
    "checklist",
  ],
  authors: [{ name: "Tarefaí", url: siteUrl }],
  creator: "Tarefaí",
  publisher: "Tarefaí",
  alternates: {
    canonical: "/",
  },
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/brand-icon.svg", type: "image/svg+xml" },
      { url: "/web-app-manifest-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/web-app-manifest-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
      { url: "/brand-icon.svg", type: "image/svg+xml" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Tarefaí",
  },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    url: "/",
    siteName: "Tarefaí",
    title: "Tarefaí — Tarefas, processos e equipes",
    description:
      "Organize tarefas, conecte equipes e acompanhe os processos da sua operação em tempo real com o Tarefaí.",
    images: [
      {
        url: "/web-app-manifest-512x512.png",
        width: 512,
        height: 512,
        alt: "Tarefaí — Gestão Operacional",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Tarefaí — Tarefas, processos e equipes",
    description:
      "Organize tarefas, conecte equipes e acompanhe os processos da sua operação em tempo real com o Tarefaí.",
    images: ["/web-app-manifest-512x512.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#164d36",
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${siteUrl}/#organization`,
      name: "Tarefaí",
      url: siteUrl,
      logo: {
        "@type": "ImageObject",
        url: `${siteUrl}/web-app-manifest-512x512.png`,
      },
      description:
        "Plataforma de gestão e execução operacional de tarefas, processos, rotinas e equipes.",
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${siteUrl}/#software`,
      name: "Tarefaí",
      applicationCategory: "BusinessApplication",
      operatingSystem: "All",
      url: siteUrl,
      description:
        "Organize tarefas, conecte equipes e acompanhe os processos da sua operação em tempo real com o Tarefaí.",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "BRL",
      },
    },
  ],
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
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
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
