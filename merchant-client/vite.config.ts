// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // 强制排除这两个包，不让 Vite 对它们进行预构建分析
    exclude: ['react-leaflet-draw', 'leaflet-draw'],
  },
  server: {
    host: true,
    port: 5174,

    // ⭐ 代理
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },

    // ⭐⭐ 允许 ngrok 访问
    allowedHosts: [
      "merchant-client.zeabur.app"
    ],
  },
});
