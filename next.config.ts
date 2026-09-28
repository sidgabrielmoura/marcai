import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",
      allowedOrigins: [
        "localhost:3000",
        "127.0.0.1:3000",
        "192.168.0.110:3000",
        "*.local",
      ],
    },
  },
};

export default nextConfig;
