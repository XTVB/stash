import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import viteCompression from "vite-plugin-compression";

const sourcemap = process.env.VITE_APP_SOURCEMAPS === "true";

// https://vitejs.dev/config/
export default defineConfig(() => {
  let plugins = [
    react({
      babel: {
        compact: true,
      },
    }),
    tsconfigPaths(),
    viteCompression({
      algorithm: "gzip",
      deleteOriginFile: true,
      threshold: 0,
      filter: /\.(js|json|css|svg|md)$/i,
    }),
  ];

  return {
    base: "",
    build: {
      outDir: "build",
      sourcemap: sourcemap,
      reportCompressedSize: false,
    },
    optimizeDeps: {
      entries: "src/index.tsx",
    },
    server: {
      port: 3000,
      cors: false,
      proxy: {
        "/graphql": "http://localhost:9999",
        "/playground": "http://localhost:9999",
        "/login": "http://localhost:9999",
        "/logout": "http://localhost:9999",
        "/performer": "http://localhost:9999",
        "/scene": "http://localhost:9999",
        "/image": "http://localhost:9999",
        "/gallery": "http://localhost:9999",
        "/tag": "http://localhost:9999",
        "/studio": "http://localhost:9999",
        "/group": "http://localhost:9999",
        "/downloads": "http://localhost:9999",
        "/plugin": "http://localhost:9999",
        "/css": "http://localhost:9999",
        "/custom": "http://localhost:9999",
        "/customlocales": "http://localhost:9999",
        "/javascript": "http://localhost:9999",
        "/favicon.ico": "http://localhost:9999",
        "/healthz": "http://localhost:9999",
      },
    },
    publicDir: "public",
    assetsInclude: ["**/*.md"],
    plugins,
  };
});
