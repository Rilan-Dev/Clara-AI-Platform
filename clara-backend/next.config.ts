import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Run src/instrumentation.ts on server startup (runs DB migrations)
  // Enable standalone output for Docker — produces a minimal server.js
  // that includes only the files needed for production
  output: "standalone",

  // Security headers applied to all responses
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-XSS-Protection", value: "1; mode=block" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        {
          key: "Permissions-Policy",
          value: "camera=(), geolocation=(), microphone=(self)",
        },
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains",
        },
      ],
    },
  ],

  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "pdfjs-dist/build/pdf.worker.mjs": false,
      "pdfjs-dist/legacy/build/pdf.worker.mjs": false,
    };
    return config;
  },
};

export default nextConfig;
