import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/jocam/",
  plugins: [react()],
  build: {
    outDir: "../../jocam",
    emptyOutDir: true,
    sourcemap: false,
    target: "es2022",
  },
});
