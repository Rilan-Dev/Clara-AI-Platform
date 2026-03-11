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
    },
  },
  server: {
    port: 5175,
    proxy: {
      "/api": {
        target: "http://localhost:3002",
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 3002,
  },
});
