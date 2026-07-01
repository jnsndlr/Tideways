import { defineConfig } from "vite";

export default defineConfig({
  server: { port: Number(process.env.PORT) || 5181, host: true },
  // Static-friendly defaults; outputs to dist/ for Vercel (Vite preset).
  build: { outDir: "dist" },
});
