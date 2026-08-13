import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const backendUrl = process.env.VITE_BACKEND_URL ?? "http://127.0.0.1:3001";
const dockerWatch = process.env.CHOKIDAR_USEPOLLING === "true";
const frontendPort = Number(process.env.FRONTEND_PORT ?? 5173);
const hmrHost = process.env.VITE_HMR_HOST;

export default defineConfig({
    plugins: [react(), tailwindcss()],
    resolve: {
        alias: {
            "@": fileURLToPath(new URL("./src", import.meta.url)),
        },
    },
    server: {
        host: true,
        port: 5173,
        strictPort: true,
        open: hmrHost ? false : "/",
        watch: dockerWatch
            ? {
                  usePolling: true,
                  interval: 1000,
              }
            : undefined,
        hmr: hmrHost
            ? {
                  host: hmrHost,
                  port: frontendPort,
                  clientPort: frontendPort,
              }
            : undefined,
        proxy: {
            "/auth": { target: backendUrl, changeOrigin: true },
            "/api": { target: backendUrl, changeOrigin: true },
        },
    },
});
