import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import fs from "fs";
import crypto from "crypto";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getDefaultVapidPublicKey(): string {
  if (process.env.VAPID_PUBLIC_KEY) return process.env.VAPID_PUBLIC_KEY.trim();
  const ecdh = crypto.createECDH("prime256v1");
  const privKey = crypto.createHash("sha256").update("shristi-student-council-vapid-key-v1").digest();
  ecdh.setPrivateKey(privKey);
  return ecdh.getPublicKey(null, "uncompressed").toString("base64url");
}

function shristiApiPlugin(): Plugin {
  const mountMiddleware = (middlewares: any) => {
    middlewares.use(async (req: any, res: any, next: any) => {
      if (!req.url || !req.url.startsWith("/api/")) return next();
      try {
        const parsedUrl = new URL(req.url, "http://localhost");
        const routePath = parsedUrl.pathname.replace(/^\/api\//, "").replace(/\/+$/, "");
        const fileCandidate = path.join(__dirname, "api", `${routePath}.js`);
        if (!fs.existsSync(fileCandidate)) return next();

        req.query = Object.fromEntries(parsedUrl.searchParams.entries());

        if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH" || req.method === "DELETE") {
          const chunks: Buffer[] = [];
          for await (const chunk of req) {
            chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
          }
          const rawBody = Buffer.concat(chunks).toString("utf8");
          try {
            req.body = rawBody ? JSON.parse(rawBody) : {};
          } catch {
            req.body = {};
          }
        } else {
          req.body = {};
        }

        res.status = (code: number) => {
          res.statusCode = code;
          return res;
        };
        res.json = (payload: unknown) => {
          if (!res.getHeader("Content-Type")) {
            res.setHeader("Content-Type", "application/json; charset=utf-8");
          }
          res.end(JSON.stringify(payload));
          return res;
        };

        const mod = await import(pathToFileURL(fileCandidate).href);
        if (typeof mod.default === "function") {
          await mod.default(req, res);
          return;
        }
        next();
      } catch (err: any) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ error: err?.message || "Internal API error" }));
      }
    });
  };

  return {
    name: "shristi-api-middleware",
    configureServer(server) {
      mountMiddleware(server.middlewares);
    },
    configurePreviewServer(server) {
      mountMiddleware(server.middlewares);
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [shristiApiPlugin(), react(), tailwindcss(), viteSingleFile()],
  define: {
    "import.meta.env.VITE_VAPID_PUBLIC_KEY": JSON.stringify(getDefaultVapidPublicKey()),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 3000,
    allowedHosts: true,
  },
  preview: {
    host: "0.0.0.0",
    port: 3000,
    allowedHosts: true,
  },
});
