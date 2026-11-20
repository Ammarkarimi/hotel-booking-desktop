import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

// The screens (renderer). Built to dist/ and loaded by Electron from disk, so paths are relative.
export default defineConfig({
  base: "./",
  plugins: [tailwindcss()],
  esbuild: { jsx: "automatic" },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      // Libraries mark files "use client" for server rendering; it means nothing in a desktop app.
      onwarn(warning, warn) {
        if (warning.code !== "MODULE_LEVEL_DIRECTIVE") warn(warning);
      },
    },
  },
  server: { port: 5183, strictPort: true },
});
