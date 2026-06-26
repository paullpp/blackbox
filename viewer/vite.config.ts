import { defineConfig } from "vite";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  resolve: {
    alias: {
      "@shared": resolve(__dirname, "../shared"),
    },
  },
  plugins: [react()],
  server: { port: 5173 },
});
