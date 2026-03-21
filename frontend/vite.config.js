import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const htmlEntries = [
  "index.html",
  "server-admin.html",
  "theme-catalog.html",
  "theme-creator.html"
].map((entry) => fileURLToPath(new URL(entry, import.meta.url)));

export default defineConfig({
  envPrefix: ["VITE_", "OFFICIAL_"],
  plugins: [react()],
  build: {
    rollupOptions: {
      input: htmlEntries
    }
  },
  optimizeDeps: {
    include: ["mediasoup-client"]
  },
  server: {
    port: 5173,
    allowedHosts: ["opencom.online"]
  }
});
