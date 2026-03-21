import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  envPrefix: ["VITE_"],
  plugins: [react()],
  server: {
    port: 5175,
    allowedHosts: ["opencom.online"],
  },
});
