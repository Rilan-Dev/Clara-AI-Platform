// @ts-check
/**
 * @type {import("next").NextConfig}
 */
const nextConfig = {
  deploymentId: process.env.NEXT_DEPLOYMENT_ID,
  output: "standalone",

  serverExternalPackages: [
    "pg",
    "resend",
    "pdfjs-dist",
    "pdf-parse",
    "ws",
    "bufferutil",
    "utf-8-validate",
  ],

  outputFileTracingIncludes: {
    "**/*": ["./node_modules/pdfjs-dist/legacy/build/**"],
  },

  reactStrictMode: true,

  ...(process.env.CLARA_SKIP_TYPECHECK === "1"
    ? {
        typescript: { ignoreBuildErrors: true },
      }
    : {}),

  skipTrailingSlashRedirect: true,

  experimental: {
    externalDir: true,
    webpackMemoryOptimizations: true,
  },

  // The repository root is also the application root. Avoid node:path and
  // import.meta.url here so Next never has to cross its TS-config CJS/ESM
  // compilation boundary.
  outputFileTracingRoot: process.cwd(),

  redirects: async () => [
    { source: "/admin", destination: "/dashboard", permanent: true },
    { source: "/admin/login", destination: "/login", permanent: true },
    { source: "/admin/settings", destination: "/settings", permanent: true },
    { source: "/admin/orgs", destination: "/orgs", permanent: true },
    { source: "/admin/orgs/:orgId", destination: "/orgs/:orgId", permanent: true },
    {
      source: "/admin/orgs/:orgId/agents/:agentId",
      destination: "/orgs/:orgId/agents/:agentId",
      permanent: true,
    },
    { source: "/admin/kbs/:kbId", destination: "/kbs/:kbId", permanent: true },
    { source: "/sandbox", destination: "/", permanent: true },
  ],

  headers: async () => [
    {
      source: "/worklets/:path*",
      headers: [
        { key: "Access-Control-Allow-Origin", value: "*" },
        { key: "Access-Control-Allow-Methods", value: "GET, OPTIONS" },
        { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
        {
          key: "Cache-Control",
          value:
            "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
        },
      ],
    },
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

  webpack: (config, { isServer }) => {
    config.resolve = config.resolve ?? {};
    config.resolve.modules = [
      process.cwd() + "/node_modules",
      ...(config.resolve.modules ?? []),
    ];
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "pdfjs-dist/build/pdf.worker.mjs": false,
      "pdfjs-dist/legacy/build/pdf.worker.mjs": false,
    };

    if (isServer && Array.isArray(config.externals)) {
      config.externals.push({
        pg: "commonjs pg",
        cheerio: "commonjs cheerio",
      });
    }

    return config;
  },
};

export default nextConfig;
