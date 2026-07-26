import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 3000,
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq, req) => {
            const host = req.headers.host;
            if (host) proxyReq.setHeader("x-forwarded-host", host);
            const proto = req.headers["x-forwarded-proto"];
            if (proto) proxyReq.setHeader("x-forwarded-proto", String(proto));
            else if (host?.includes("trycloudflare.com")) {
              proxyReq.setHeader("x-forwarded-proto", "https");
            }
          });
        },
      },
      "/health": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
      "/download": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
    },
  },
});
