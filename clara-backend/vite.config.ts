import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "next/server":     path.resolve(__dirname, "./src/server/next-shim.ts"),
      "next/link":       path.resolve(__dirname, "./src/vite/shims/next-link.tsx"),
      "next/navigation": path.resolve(__dirname, "./src/vite/shims/next-navigation.ts"),
      "next/dynamic":    path.resolve(__dirname, "./src/vite/shims/next-dynamic.tsx"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Forward all /api/* requests from the Vite HMR dev server → Express on :3000
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 3000,
  },
});
