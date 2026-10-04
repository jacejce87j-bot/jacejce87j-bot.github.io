import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const port = env.PORT ? Number(env.PORT) : undefined;
  const basePath = env.BASE_PATH || "/";
  const apiTarget = env.EXPO_PUBLIC_API_URL || env.VITE_API_URL || "http://localhost:5000";

  return {
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
  },
  server: {
    port,
    host: "0.0.0.0",
    hmr: {
      protocol: "ws",
      ...(env.VITE_HMR_HOST ? { host: env.VITE_HMR_HOST } : {}),
    },
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
        rewrite: (path) => path,
      },
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
  },
  };
});