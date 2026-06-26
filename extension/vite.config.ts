import { defineConfig } from "vite";
import { resolve } from "node:path";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.config";

export default defineConfig({
  resolve: {
    alias: {
      "@shared": resolve(__dirname, "../shared"),
    },
  },
  plugins: [crx({ manifest })],
  build: {
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "popup.html"),
        offscreen: resolve(__dirname, "offscreen.html"),
      },
    },
  },
  // CRXJS serves over a fixed port during dev for stable HMR.
  server: {
    port: 5174,
    strictPort: true,
    hmr: { port: 5174 },
  },
});
