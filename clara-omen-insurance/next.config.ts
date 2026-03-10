import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: ".next-app",
  output: "standalone",
  reactStrictMode: true,
};

export default nextConfig;
