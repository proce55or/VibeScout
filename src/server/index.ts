import fs from "node:fs";
import path from "node:path";
import { loadConfig, ensureDataDir } from "../config.js";
import { Db } from "../db/db.js";
import { Pipeline, type PipelineDeps } from "../pipeline/pipeline.js";
import { createHttpTransport } from "../net/http-transport.js";
import { createApp } from "./app.js";
import { makeDemoDeps, seedDemo } from "../demo/demo.js";

/** Minimalny loader .env (bez zależności). Nie nadpisuje istniejących zmiennych. */
function loadDotEnv(): void {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf-8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function main(): void {
  loadDotEnv();
  const cfg = loadConfig();
  ensureDataDir(cfg);

  const db = new Db(cfg.dbPath);
  const recovered = db.recoverInterrupted();
  if (recovered.runsCrashed > 0 || recovered.projectsRequeued > 0) {
    db.addNotification({
      level: "info",
      title: "Odzyskiwanie po przerwaniu",
      body: `Oznaczono ${recovered.runsCrashed} przerwany(ch) przebieg(ów), przywrócono do kolejki ${recovered.projectsRequeued} zadań. Sam restart nie uruchamia nowego przeszukiwania.`,
      projectId: null,
      runId: null,
    });
  }

  const deps: PipelineDeps = cfg.demo ? makeDemoDeps() : { transport: createHttpTransport() };
  if (cfg.demo) seedDemo(db);

  const pipeline = new Pipeline(db, cfg, deps);
  const app = createApp(db, pipeline, cfg);

  const server = app.listen(cfg.port, cfg.host, () => {
    const url = `http://${cfg.host}:${cfg.port}`;
    // eslint-disable-next-line no-console
    console.log(
      [
        "",
        "  VibeScout działa lokalnie.",
        `  Panel:   ${url}`,
        `  Tryb:    ${cfg.demo ? "DEMO (dane syntetyczne, bez sieci)" : "normalny"}`,
        `  Dane:    ${cfg.dataDir}`,
        "",
        "  Zatrzymanie: Ctrl+C (lub ./stop.command).",
        "",
      ].join("\n"),
    );
  });

  const shutdown = () => {
    // eslint-disable-next-line no-console
    console.log("\n  Zatrzymuję VibeScout…");
    server.close(() => {
      db.close();
      process.exit(0);
    });
    // awaryjne wyjście
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main();
