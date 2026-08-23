import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const backendUrl = process.env.VITE_BACKEND_URL ?? "http://127.0.0.1:3001";
const dockerWatch = process.env.CHOKIDAR_USEPOLLING === "true";
const frontendPort = Number(process.env.FRONTEND_PORT ?? 5173);
const hmrHost = process.env.VITE_HMR_HOST;

/**
 * Font Hán Noto Sans TC/SC (fontsource) mặc định `font-display: swap` → khi vào
 * trang detail, hán tự render bằng font fallback hệ thống rồi SWAP sang Noto
 * (đôi khi 2 lần: SC rồi TC cho chữ chung) → bị "đổi font" nhấp nháy.
 * Ép `font-display: block` cho 2 họ này → chờ font load rồi render 1 lần đúng font,
 * không fallback-flash. (2026-08-20)
 */
const hanFontDisplayBlock = {
    postcssPlugin: "han-font-display-block",
    AtRule(atRule) {
        if (atRule.name !== "font-face") return;
        let isHan = false;
        atRule.walkDecls("font-family", (d) => {
            if (/Noto Sans T[CS] Variable/.test(d.value)) isHan = true;
        });
        if (!isHan) return;
        atRule.walkDecls("font-display", (decl) => {
            if (decl.value === "swap") decl.value = "block";
        });
    },
};

export default defineConfig({
    plugins: [react(), tailwindcss()],
    css: {
        postcss: {
            plugins: [hanFontDisplayBlock],
        },
    },
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
