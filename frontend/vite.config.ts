import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "../public",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/auth": "http://localhost:8787",
      "/admin": "http://localhost:8787",
      "/user": "http://localhost:8787",
      "/setup": "http://localhost:8787",
      "/inbox": "http://localhost:8787",
      "/api": "http://localhost:8787",
    },
  },
});
