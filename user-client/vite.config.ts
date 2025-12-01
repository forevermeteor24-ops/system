// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5175,

    // ⭐ 代理
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },

    // ⭐⭐ 允许 ngrok 访问
    allowedHosts: [
      "associations-madonna-naval-closer.trycloudflare.com"
    ],
  },
});
