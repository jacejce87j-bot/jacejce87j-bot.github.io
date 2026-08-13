import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const port = process.env.PORT ? Number(process.env.PORT) : undefined;
const basePath = process.env.BASE_PATH || "/";
const tailscaleIp = "100.116.75.63";

export default defineConfig({
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
      // Points HMR WebSocket to your Tailscale IP so live reloads work over the VPN
      host: tailscaleIp,
      protocol: "ws",
    },
    proxy: {
      "/api": {
        // Targets your backend over Tailscale
        target: process.env.EXPO_PUBLIC_API_URL || `http://${tailscaleIp}:5000`,
        changeOrigin: true,
        rewrite: (path) => path,
      },
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
  },
});