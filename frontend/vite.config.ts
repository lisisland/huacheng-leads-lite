import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        focus: fileURLToPath(new URL("./focus.html", import.meta.url))
      }
    }
  },
  server: {
    proxy: {
      "/whatsapp-plugin/api": {
        target: "http://127.0.0.1:13100",
        rewrite: (path) => path.replace(/^\/whatsapp-plugin\/api/u, "/api")
      },
      "/whatsapp-plugin/socket.io": {
        target: "http://127.0.0.1:13100",
        ws: true,
        rewrite: (path) => path.replace(/^\/whatsapp-plugin\/socket\.io/u, "/socket.io")
      },
      "/whatsapp-plugin": {
        target: "http://127.0.0.1:15193",
        ws: true
      },
      "/uploads": process.env.VITE_API_TARGET || "http://127.0.0.1:14188",
      "/api": process.env.VITE_API_TARGET || "http://127.0.0.1:14188"
    }
  }
});
