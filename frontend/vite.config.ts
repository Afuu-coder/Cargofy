import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { fileURLToPath, URL } from "url";

// Cesium assets must be served statically
const cesiumSource = "node_modules/cesium/Build/Cesium";

export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        { src: `${cesiumSource}/Workers`,            dest: "cesium" },
        { src: `${cesiumSource}/ThirdParty`,         dest: "cesium" },
        { src: `${cesiumSource}/Assets`,             dest: "cesium" },
        { src: `${cesiumSource}/Widgets`,            dest: "cesium" },
      ],
    }),
  ],
  define: {
    CESIUM_BASE_URL: JSON.stringify("/cesium"),
  },
  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  optimizeDeps: {
    include: ["cesium"],
  },
  build: {
    chunkSizeWarningLimit: 5000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('cesium')) {
            return 'cesium';
          }
        },
      },
    },
  },
});
