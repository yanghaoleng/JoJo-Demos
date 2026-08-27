import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createReadStream, statSync } from "node:fs";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectDir = fileURLToPath(new URL(".", import.meta.url));
const builtStaticDir = resolve(projectDir, "../../intermotion");
const devStaticPrefixes = ["media/", "models/", "wasm/"];
const contentTypes = {
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".mp4": "video/mp4",
  ".tflite": "application/octet-stream",
  ".wasm": "application/wasm",
};

function serveBuiltStaticDuringDevelopment() {
  return {
    name: "serve-intermotion-static-during-development",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = decodeURIComponent(
          new URL(request.url, "http://localhost").pathname,
        );
        const relativePath = pathname.replace(/^\/intermotion\//, "");
        if (
          !devStaticPrefixes.some((prefix) => relativePath.startsWith(prefix))
        ) {
          next();
          return;
        }

        const filePath = resolve(builtStaticDir, relativePath);
        if (!filePath.startsWith(`${builtStaticDir}/`)) {
          response.statusCode = 403;
          response.end("Forbidden");
          return;
        }

        try {
          if (!statSync(filePath).isFile()) {
            next();
            return;
          }
          response.statusCode = 200;
          response.setHeader(
            "Content-Type",
            contentTypes[extname(filePath)] || "application/octet-stream",
          );
          createReadStream(filePath).pipe(response);
        } catch {
          next();
        }
      });
    },
  };
}

export default defineConfig({
  base: "/intermotion/",
  plugins: [react(), serveBuiltStaticDuringDevelopment()],
  build: {
    outDir: "../../intermotion",
    emptyOutDir: false,
    sourcemap: true,
    rollupOptions: {
      output: {
        entryFileNames: "assets/intermotion-[hash].js",
        chunkFileNames: "assets/intermotion-[name]-[hash].js",
        assetFileNames: "assets/intermotion-[hash][extname]",
      },
    },
  },
});
