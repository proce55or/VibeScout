import express from "express";
import path from "node:path";
import fs from "node:fs";
import type { Db } from "../db/db.js";
import type { Pipeline } from "../pipeline/pipeline.js";
import type { Config } from "../config.js";
import { hostGuard, csrfGuard } from "./security.js";
import { createRouter } from "./routes.js";

export function createApp(db: Db, pipeline: Pipeline, cfg: Config): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "6mb" }));

  // Ochrona: tylko loopback dla wszystkich żądań.
  app.use(hostGuard);

  // API z ochroną CSRF/token na operacjach zmieniających stan.
  app.use("/api", csrfGuard, createRouter(db, pipeline, cfg));

  // Frontend (zbudowany). W trybie dev serwuje go Vite (proxy /api).
  const webDist = path.resolve(__dirname, "../../web/dist");
  if (fs.existsSync(path.join(webDist, "index.html"))) {
    app.use(express.static(webDist));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api")) return next();
      res.sendFile(path.join(webDist, "index.html"));
    });
  } else {
    app.get("/", (_req, res) => {
      res
        .type("text/plain")
        .send(
          "VibeScout: frontend nie jest zbudowany. Uruchom `npm run build` (lub `npm run dev`). API działa pod /api/status.",
        );
    });
  }

  return app;
}
