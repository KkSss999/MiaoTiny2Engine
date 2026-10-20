import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { devApi } from "./scripts/dev-api.mjs";

export default defineConfig({
  plugins: [react(), tailwindcss(), devApi()],
  resolve: {
    alias: {
      "#core": fileURLToPath(new URL("./src/core", import.meta.url)),
      "#content": fileURLToPath(new URL("./src/content", import.meta.url)),
    },
  },
  server: { port: 5173, strictPort: false },
  clearScreen: false,
});