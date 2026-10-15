import { Router, type Request, type Response } from "express";
import type { Db } from "../db/db.js";
import type { Pipeline } from "../pipeline/pipeline.js";
import type { Config } from "../config.js";
import { Pipeline as PipelineClass } from "../pipeline/pipeline.js";
import { SESSION_TOKEN } from "./security.js";
import { qualify } from "../classify/qualify.js";
import { importRecords } from "../connectors/import.js";
import { buildReport, toMarkdown, toJsonObject, runSummaryMarkdown } from "../report/report.js";
import { toSafeHtml } from "../report/html.js";
import type { ProjectInput, RunParams } from "../types.js";
import { shortId } from "../util/id.js";

export function createRouter(db: Db, pipeline: Pipeline, cfg: Config): Router {
  const r = Router();

  r.get("/session", (_req: Request, res: Response) => {
    res.json({ token: SESSION_TOKEN, demo: cfg.demo, version: "1.0.0" });
  });

  r.get("/status", (_req, res) => {
    const base = pipeline.getStatus();
    res.json({
      ...base,
      lastRun: base.run ?? db.listRuns(1)[0] ?? null,
      connectors: PipelineClass.availableConnectors(),
      limits: cfg.limits,
      defaults: cfg.defaults,
      retentionDays: cfg.retentionDays,
      demo: cfg.demo,
      checkedLast24h: db.checkedInLast24h(),
    });
  });

  r.get("/connectors", (_req, res) => {
    res.json(PipelineClass.availableConnectors());
  });

  // --- sterowanie przebiegiem ---
  r.post("/run/start", (req, res) => {
    const body = req.body ?? {};
    const sources: string[] = Array.isArray(body.sources) && body.sources.length ? body.sources : ["hackernews"];
    const params: RunParams = {
      sources,
      lookbackDays: clampInt(body.lookbackDays, cfg.defaults.lookbackDays, 1, 365),
      maxAppsPerDay: clampInt(body.maxAppsPerDay, cfg.defaults.maxAppsPerDay, 1, 500),
      sourceReadBudget: clampInt(body.sourceReadBudget, cfg.defaults.sourceReadBudget, 1, 5000),
    };
    const result = pipeline.start(params);
    res.status(result.ok ? 200 : 409).json(result);
  });

  r.post("/run/pause", (_req, res) => {
    pipeline.pause();
    res.json({ ok: true });
  });
  r.post("/run/resume", (_req, res) => {
    pipeline.resume();
    res.json({ ok: true });
  });
  r.post("/run/stop", (_req, res) => {
    pipeline.stop();
    res.json({ ok: true });
  });

  r.get("/runs", (_req, res) => {
    res.json(db.listRuns(30));
  });

  r.get("/run-summary/:id", (req, res) => {
    const run = db.getRun(req.params.id);
    if (!run) {
      res.status(404).json({ error: "Nie znaleziono przebiegu." });
      return;
    }
    const md = runSummaryMarkdown({
      runId: run.id,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      counters: run.counters as unknown as Record<string, number>,
      dateRange: run.dateRange,
      note: run.note,
    });
    res.type("text/markdown").send(md);
  });

  // --- projekty ---
  r.get("/projects", (req, res) => {
    const q = req.query;
    const result = db.listProjects({
      source: str(q.source),
      origin: str(q.origin),
      confidence: str(q.confidence),
      tool: str(q.tool),
      status: str(q.status),
      summary: str(q.summary),
      q: str(q.q),
      limit: clampInt(q.limit, 100, 1, 500),
      offset: clampInt(q.offset, 0, 0, 1_000_000),
    });
    res.json(result);
  });

  r.get("/projects/:id", (req, res) => {
    const project = db.getProject(req.params.id);
    if (!project) {
      res.status(404).json({ error: "Nie znaleziono projektu." });
      return;
    }
    res.json({ project, checks: db.getCheckRuns(project.id) });
  });

  r.get("/projects/:id/report", (req, res) => {
    const project = db.getProject(req.params.id);
    if (!project) {
      res.status(404).json({ error: "Nie znaleziono projektu." });
      return;
    }
    const checks = db.getCheckRuns(project.id);
    const model = buildReport(project, checks[0] ?? null);
    const format = str(req.query.format) ?? "html";
    const base = `vibescout-raport-${(project.host ?? "app").replace(/[^a-z0-9.-]/gi, "_")}-${shortId()}`;
    if (format === "md") {
      res.type("text/markdown").set("Content-Disposition", `attachment; filename="${base}.md"`).send(toMarkdown(model));
    } else if (format === "json") {
      res
        .type("application/json")
        .set("Content-Disposition", `attachment; filename="${base}.json"`)
        .send(JSON.stringify(toJsonObject(model), null, 2));
    } else {
      res.type("text/html").send(toSafeHtml(model));
    }
  });

  r.post("/projects/:id/recheck", async (req, res) => {
    const result = await pipeline.recheck(req.params.id);
    res.status(result.ok ? 200 : 400).json(result);
  });

  r.delete("/projects/:id", (req, res) => {
    db.deleteProject(req.params.id);
    res.json({ ok: true });
  });

  // --- ręczne dodawanie ---
  r.post("/projects/manual", (req, res) => {
    const body = req.body ?? {};
    if (!body.appUrl || typeof body.appUrl !== "string") {
      res.status(400).json({ error: "Wymagany adres aplikacji (appUrl)." });
      return;
    }
    const input: ProjectInput = {
      name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : body.appUrl,
      appUrl: body.appUrl,
      announcementUrl: typeof body.announcementUrl === "string" ? body.announcementUrl : null,
      source: "manual",
      publishedAt: typeof body.publishedAt === "string" ? body.publishedAt : null,
      rawText: typeof body.rawText === "string" ? body.rawText : "",
      externalId: null,
    };
    const qual = qualify(input);
    const { project, merged } = db.insertOrMergeProject(null, input, qual);
    res.json({ project, merged, qualification: { status: qual.status, reason: qual.rejectReason } });
  });

  // --- import CSV/JSON (podgląd przed dodaniem) ---
  r.post("/import/preview", (req, res) => {
    const body = req.body ?? {};
    const format = body.format === "json" ? "json" : "csv";
    const content = typeof body.content === "string" ? body.content : "";
    const result = importRecords(content, format);
    res.json(result);
  });

  r.post("/import/commit", (req, res) => {
    const body = req.body ?? {};
    const inputs: ProjectInput[] = Array.isArray(body.rows) ? body.rows : [];
    let added = 0;
    let merged = 0;
    for (const input of inputs) {
      if (!input || typeof input.appUrl !== "string") continue;
      const normalized: ProjectInput = {
        name: input.name || input.appUrl,
        appUrl: input.appUrl,
        announcementUrl: input.announcementUrl ?? null,
        source: input.source || "import",
        publishedAt: input.publishedAt ?? null,
        rawText: input.rawText ?? "",
        externalId: input.externalId ?? input.announcementUrl ?? input.appUrl,
      };
      const qual = qualify(normalized);
      const result = db.insertOrMergeProject(null, normalized, qual);
      if (result.merged) merged += 1;
      else added += 1;
    }
    res.json({ ok: true, added, merged });
  });

  // --- kanały RSS ---
  r.get("/feeds", (_req, res) => {
    res.json(db.listFeeds());
  });
  r.post("/feeds", (req, res) => {
    const { name, url, limit } = req.body ?? {};
    if (!name || !url) {
      res.status(400).json({ error: "Wymagane: name, url." });
      return;
    }
    try {
      const u = new URL(url);
      if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("schemat");
    } catch {
      res.status(400).json({ error: "Nieprawidłowy URL kanału." });
      return;
    }
    const id = db.addFeed(String(name), String(url), clampInt(limit, 25, 1, 200));
    res.json({ ok: true, id });
  });
  r.post("/feeds/:id/toggle", (req, res) => {
    db.setFeedEnabled(req.params.id, Boolean(req.body?.enabled));
    res.json({ ok: true });
  });
  r.delete("/feeds/:id", (req, res) => {
    db.deleteFeed(req.params.id);
    res.json({ ok: true });
  });

  // --- wykluczenia domen ---
  r.get("/exclusions", (_req, res) => {
    res.json(db.listExclusions());
  });
  r.post("/exclusions", (req, res) => {
    const host = String(req.body?.host ?? "").trim().toLowerCase();
    if (!host) {
      res.status(400).json({ error: "Wymagany host." });
      return;
    }
    db.addExclusion(host, typeof req.body?.note === "string" ? req.body.note : undefined);
    res.json({ ok: true });
  });
  r.delete("/exclusions/:host", (req, res) => {
    db.removeExclusion(req.params.host);
    res.json({ ok: true });
  });

  // --- powiadomienia ---
  r.get("/notifications", (_req, res) => {
    res.json({ notifications: db.listNotifications(50), unread: db.unreadNotificationCount() });
  });
  r.post("/notifications/read", (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : undefined;
    db.markNotificationsRead(ids);
    res.json({ ok: true });
  });

  return r;
}

function str(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim() !== "") return v.trim();
  return undefined;
}

function clampInt(v: unknown, def: number, min: number, max: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number.parseInt(v, 10) : NaN;
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}
