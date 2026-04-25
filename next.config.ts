import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "10.31.112.128"],
  experimental: {
    serverActions: {
      allowedOrigins: ["10.31.112.128:12531"],
    },
  },
};

export default nextConfig;
