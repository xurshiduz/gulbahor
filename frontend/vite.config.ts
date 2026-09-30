import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";

// Backend manzili - backend/.env dagi PORT bilan bir xil bo'lishi kerak
const API_TARGET = "http://localhost:3002";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    svgr({
      svgrOptions: {
        icon: true,
        // This will transform your SVG to a React component
        exportType: "named",
        namedExport: "ReactComponent",
      },
    }),
  ],
  build: {
    target: ["chrome88", "safari14", "firefox90", "es2020"],
  },
  server: {
    port: 5175,
    strictPort: true,
    proxy: {
      "/api": {
        target: API_TARGET,
        changeOrigin: true,
      },
      // Yuklangan rasmlar backenddan beriladi
      "/uploads": {
        target: API_TARGET,
        changeOrigin: true,
      },
    },
  },
});
