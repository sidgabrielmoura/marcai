import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://tarefai.com.br";

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/login", "/register", "/termos", "/privacidade", "/seguranca"],
        disallow: [
          "/api/",
          "/management/",
          "/superadmin/",
          "/worker/",
          "/select-org",
          "/setup-biometrics",
          "/verify-access",
        ],
      },
      {
        userAgent: "Googlebot",
        allow: ["/", "/login", "/termos", "/privacidade", "/seguranca"],
        disallow: [
          "/api/",
          "/management/",
          "/superadmin/",
          "/worker/",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
