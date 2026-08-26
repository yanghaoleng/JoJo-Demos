import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command }) => ({
  base: command === "build"
    ? process.env.JOCAM_ASSET_BASE || "https://rive.mikeywa.site/jocam/"
    : "/jocam/",
  plugins: [react()],
  build: {
    outDir: "../../jocam",
    emptyOutDir: true,
    sourcemap: false,
    target: "es2022",
  },
}));
