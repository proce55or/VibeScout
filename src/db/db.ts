import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { SCHEMA_SQL, SCHEMA_VERSION } from "./schema.js";
import { newId } from "../util/id.js";
import type {
  AppNotification,
  CheckRunResult,
  Classification,
  Project,
  ProjectInput,
  ProjectStatus,
  RunCounters,
  RunParams,
  RunState,
  RunStatus,
} from "../types.js";
import type { Qualification } from "../classify/qualify.js";
import type { FeedConfig } from "../connectors/types.js";

interface ProjectRow {
  id: string;
  run_id: string | null;
  name: string;
  app_url: string | null;
  announcement_url: string | null;
  source: string;
  external_id: string | null;
  published_at: string | null;
  discovered_at: string;
  host: string | null;
  dedup_key: string | null;
  status: string;
  reject_reason: string | null;
  class_origin: string;
  class_tool: string | null;
  class_confidence: string;
  class_language: string;
  classification_json: string;
  merged_from_json: string;
  last_summary: string | null;
  last_checked_at: string | null;
  last_check_run_id: string | null;
}

export interface ProjectFilters {
  source?: string;
  origin?: string;
  confidence?: string;
  tool?: string;
  status?: string;
  summary?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

export class Db {
  private readonly db: Database.Database;
  /** Bufor przygotowanych zapytań — przygotowujemy raz, używamy wielokrotnie.
   * Unika tworzenia tysięcy obiektów Statement (i awarii w finalizacji przy GC). */
  private readonly stmtCache = new Map<string, Database.Statement>();

  /** Zwraca buforowane (lub nowo przygotowane) zapytanie dla danego SQL. */
  private q(sql: string): Database.Statement {
    let s = this.stmtCache.get(sql);
    if (!s) {
      s = this.db.prepare(sql);
      this.stmtCache.set(sql, s);
    }
    return s;
  }

  constructor(dbPath: string) {
    if (dbPath !== ":memory:") {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    }
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.exec(SCHEMA_SQL);
    this.setMeta("schema_version", String(SCHEMA_VERSION));
  }

  close(): void {
    this.db.close();
  }

  // --- meta ---
  setMeta(key: string, value: string): void {
    this.q("INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key, value);
  }
  getMeta(key: string): string | null {
    const row = this.q("SELECT value FROM meta WHERE key=?").get(key) as { value: string } | undefined;
    return row ? row.value : null;
  }

  // --- runs ---
  createRun(params: RunParams): RunState {
    const now = new Date().toISOString();
    const counters: RunCounters = {
      found: 0,
      rejected: 0,
      queued: 0,
      checked: 0,
      needsReview: 0,
      errors: 0,
      checkedToday: 0,
      sourceReads: 0,
    };
    const id = newId();
    this.db
      .prepare(
        "INSERT INTO runs(id,status,params_json,started_at,updated_at,finished_at,counters_json,date_from,date_to,note) VALUES(?,?,?,?,?,?,?,?,?,?)",
      )
      .run(id, "running", JSON.stringify(params), now, now, null, JSON.stringify(counters), null, null, null);
    return this.getRun(id)!;
  }

  updateRun(id: string, patch: Partial<Pick<RunState, "status" | "counters" | "finishedAt" | "note" | "dateRange">>): void {
    const run = this.getRun(id);
    if (!run) return;
    const status = patch.status ?? run.status;
    const counters = patch.counters ?? run.counters;
    const finishedAt = patch.finishedAt !== undefined ? patch.finishedAt : run.finishedAt;
    const note = patch.note !== undefined ? patch.note : run.note;
    const dateRange = patch.dateRange ?? run.dateRange;
    this.db
      .prepare(
        "UPDATE runs SET status=?, counters_json=?, finished_at=?, note=?, date_from=?, date_to=?, updated_at=? WHERE id=?",
      )
      .run(status, JSON.stringify(counters), finishedAt, note, dateRange.from, dateRange.to, new Date().toISOString(), id);
  }

  getRun(id: string): RunState | null {
    const r = this.q("SELECT * FROM runs WHERE id=?").get(id) as Record<string, unknown> | undefined;
    return r ? this.rowToRun(r) : null;
  }

  getActiveRun(): RunState | null {
    const r = this.db
      .prepare("SELECT * FROM runs WHERE status IN ('running','paused','stopping') ORDER BY started_at DESC LIMIT 1")
      .get() as Record<string, unknown> | undefined;
    return r ? this.rowToRun(r) : null;
  }

  listRuns(limit = 20): RunState[] {
    const rows = this.q("SELECT * FROM runs ORDER BY started_at DESC LIMIT ?").all(limit) as Record<string, unknown>[];
    return rows.map((r) => this.rowToRun(r));
  }

  private rowToRun(r: Record<string, unknown>): RunState {
    return {
      id: r.id as string,
      status: r.status as RunStatus,
      params: JSON.parse(r.params_json as string) as RunParams,
      startedAt: r.started_at as string,
      updatedAt: r.updated_at as string,
      finishedAt: (r.finished_at as string) ?? null,
      counters: JSON.parse(r.counters_json as string) as RunCounters,
      dateRange: { from: (r.date_from as string) ?? null, to: (r.date_to as string) ?? null },
      note: (r.note as string) ?? null,
    };
  }

  // --- projects ---
  insertOrMergeProject(
    runId: string | null,
    input: ProjectInput,
    qual: Qualification,
  ): { project: Project; merged: boolean } {
    if (qual.dedupKey) {
      const existingRow = this.q("SELECT * FROM projects WHERE dedup_key=?").get(qual.dedupKey) as ProjectRow | undefined;
      if (existingRow) {
        const mergedFrom = JSON.parse(existingRow.merged_from_json) as Project["mergedFrom"];
        const already = mergedFrom.some(
          (m) => m.source === input.source && (m.externalId ?? null) === (input.externalId ?? null),
        );
        const sameAsPrimary =
          existingRow.source === input.source && (existingRow.external_id ?? null) === (input.externalId ?? null);
        if (!already && !sameAsPrimary) {
          mergedFrom.push({
            source: input.source,
            announcementUrl: input.announcementUrl,
            externalId: input.externalId ?? null,
          });
          this.q("UPDATE projects SET merged_from_json=? WHERE id=?").run(JSON.stringify(mergedFrom), existingRow.id);
        }
        return { project: this.getProject(existingRow.id)!, merged: true };
      }
    }
    const id = newId();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO projects(id,run_id,name,app_url,announcement_url,source,external_id,published_at,discovered_at,host,dedup_key,status,reject_reason,class_origin,class_tool,class_confidence,class_language,classification_json,merged_from_json)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        runId,
        input.name,
        qual.normalized ?? input.appUrl,
        input.announcementUrl,
        input.source,
        input.externalId ?? null,
        input.publishedAt,
        now,
        qual.host,
        qual.dedupKey,
        qual.status,
        qual.rejectReason,
        qual.classification.origin,
        qual.classification.tool,
        qual.classification.confidence,
        qual.classification.language,
        JSON.stringify(qual.classification),
        "[]",
      );
    return { project: this.getProject(id)!, merged: false };
  }

  getProject(id: string): Project | null {
    const r = this.q("SELECT * FROM projects WHERE id=?").get(id) as ProjectRow | undefined;
    return r ? this.rowToProject(r) : null;
  }

  private rowToProject(r: ProjectRow): Project {
    return {
      id: r.id,
      name: r.name,
      appUrl: r.app_url,
      announcementUrl: r.announcement_url,
      source: r.source,
      externalId: r.external_id,
      publishedAt: r.published_at,
      discoveredAt: r.discovered_at,
      host: r.host,
      dedupKey: r.dedup_key,
      status: r.status as ProjectStatus,
      rejectReason: r.reject_reason,
      classification: JSON.parse(r.classification_json) as Classification,
      mergedFrom: JSON.parse(r.merged_from_json) as Project["mergedFrom"],
    };
  }

  updateProjectStatus(id: string, status: ProjectStatus, rejectReason?: string | null): void {
    this.q("UPDATE projects SET status=?, reject_reason=COALESCE(?, reject_reason) WHERE id=?").run(status, rejectReason ?? null, id);
  }

  /** Pobiera kolejne zadanie z kolejki (status queued) i oznacza jako checking. Atomowo. */
  claimNextQueued(runId: string): Project | null {
    const tx = this.db.transaction((): Project | null => {
      const row = this.db
        .prepare("SELECT * FROM projects WHERE status='queued' ORDER BY discovered_at ASC LIMIT 1")
        .get() as ProjectRow | undefined;
      if (!row) return null;
      this.q("UPDATE projects SET status='checking', run_id=? WHERE id=?").run(runId, row.id);
      return this.rowToProject(row);
    });
    return tx();
  }

  countByStatus(): Record<string, number> {
    const rows = this.q("SELECT status, COUNT(*) as c FROM projects GROUP BY status").all() as Array<{ status: string; c: number }>;
    const out: Record<string, number> = {};
    for (const r of rows) out[r.status] = r.c;
    return out;
  }

  queuedCount(): number {
    const r = this.q("SELECT COUNT(*) as c FROM projects WHERE status='queued'").get() as { c: number };
    return r.c;
  }

  listProjects(filters: ProjectFilters): { projects: Project[]; total: number } {
    const where: string[] = [];
    const paramsArr: unknown[] = [];
    if (filters.source) {
      where.push("source=?");
      paramsArr.push(filters.source);
    }
    if (filters.origin) {
      where.push("class_origin=?");
      paramsArr.push(filters.origin);
    }
    if (filters.confidence) {
      where.push("class_confidence=?");
      paramsArr.push(filters.confidence);
    }
    if (filters.tool) {
      where.push("class_tool=?");
      paramsArr.push(filters.tool);
    }
    if (filters.status) {
      where.push("status=?");
      paramsArr.push(filters.status);
    }
    if (filters.summary) {
      where.push("last_summary=?");
      paramsArr.push(filters.summary);
    }
    if (filters.q) {
      where.push("(name LIKE ? OR app_url LIKE ? OR host LIKE ?)");
      const like = `%${filters.q}%`;
      paramsArr.push(like, like, like);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const total = (this.q(`SELECT COUNT(*) as c FROM projects ${whereSql}`).get(...paramsArr) as { c: number }).c;
    const limit = Math.min(filters.limit ?? 100, 500);
    const offset = filters.offset ?? 0;
    const rows = this.db
      .prepare(`SELECT * FROM projects ${whereSql} ORDER BY discovered_at DESC LIMIT ? OFFSET ?`)
      .all(...paramsArr, limit, offset) as ProjectRow[];
    return { projects: rows.map((r) => this.rowToProject(r)), total };
  }

  deleteProject(id: string): void {
    this.q("DELETE FROM projects WHERE id=?").run(id);
  }

  // --- check runs ---
  saveCheckRun(result: CheckRunResult): string {
    const id = newId();
    this.db
      .prepare(
        "INSERT INTO check_runs(id,project_id,started_at,finished_at,entry_url,resolved_ip,summary,budget_json,observations_json,error) VALUES(?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        id,
        result.projectId,
        result.startedAt,
        result.finishedAt,
        result.entryUrl,
        result.resolvedIp,
        result.summary,
        JSON.stringify(result.budget),
        JSON.stringify(result.observations),
        result.error,
      );
    const status: ProjectStatus = result.summary === "needs_review" ? "needs_review" : "checked";
    this.db
      .prepare("UPDATE projects SET status=?, last_summary=?, last_checked_at=?, last_check_run_id=? WHERE id=?")
      .run(status, result.summary, result.finishedAt, id, result.projectId);
    return id;
  }

  getCheckRuns(projectId: string): CheckRunResult[] {
    const rows = this.db
      .prepare("SELECT * FROM check_runs WHERE project_id=? ORDER BY started_at DESC")
      .all(projectId) as Record<string, unknown>[];
    return rows.map((r) => ({
      projectId: r.project_id as string,
      startedAt: r.started_at as string,
      finishedAt: r.finished_at as string,
      entryUrl: r.entry_url as string,
      resolvedIp: (r.resolved_ip as string) ?? null,
      summary: r.summary as CheckRunResult["summary"],
      budget: JSON.parse(r.budget_json as string),
      observations: JSON.parse(r.observations_json as string),
      error: (r.error as string) ?? null,
    }));
  }

  // --- notifications ---
  addNotification(n: Omit<AppNotification, "id" | "createdAt" | "read">): AppNotification {
    const id = newId();
    const createdAt = new Date().toISOString();
    this.db
      .prepare("INSERT INTO notifications(id,created_at,level,title,body,read,project_id,run_id) VALUES(?,?,?,?,?,0,?,?)")
      .run(id, createdAt, n.level, n.title, n.body, n.projectId, n.runId);
    return { id, createdAt, read: false, ...n };
  }

  listNotifications(limit = 50): AppNotification[] {
    const rows = this.q("SELECT * FROM notifications ORDER BY created_at DESC LIMIT ?").all(limit) as Record<string, unknown>[];
    return rows.map((r) => ({
      id: r.id as string,
      createdAt: r.created_at as string,
      level: r.level as AppNotification["level"],
      title: r.title as string,
      body: r.body as string,
      read: (r.read as number) === 1,
      projectId: (r.project_id as string) ?? null,
      runId: (r.run_id as string) ?? null,
    }));
  }

  unreadNotificationCount(): number {
    return (this.q("SELECT COUNT(*) as c FROM notifications WHERE read=0").get() as { c: number }).c;
  }

  markNotificationsRead(ids?: string[]): void {
    if (ids && ids.length) {
      const stmt = this.q("UPDATE notifications SET read=1 WHERE id=?");
      const tx = this.db.transaction((list: string[]) => list.forEach((i) => stmt.run(i)));
      tx(ids);
    } else {
      this.q("UPDATE notifications SET read=1").run();
    }
  }

  // --- feeds ---
  listFeeds(): Array<FeedConfig & { id: string; status: string | null; lastError: string | null }> {
    const rows = this.q("SELECT * FROM feeds ORDER BY name").all() as Record<string, unknown>[];
    return rows.map((r) => ({
      id: r.id as string,
      name: r.name as string,
      url: r.url as string,
      enabled: (r.enabled as number) === 1,
      limit: r.item_limit as number,
      status: (r.status as string) ?? null,
      lastError: (r.last_error as string) ?? null,
    }));
  }

  addFeed(name: string, url: string, limit = 25): string {
    const id = newId();
    this.q("INSERT INTO feeds(id,name,url,enabled,item_limit) VALUES(?,?,?,1,?)").run(id, name, url, limit);
    return id;
  }

  setFeedEnabled(id: string, enabled: boolean): void {
    this.q("UPDATE feeds SET enabled=? WHERE id=?").run(enabled ? 1 : 0, id);
  }

  deleteFeed(id: string): void {
    this.q("DELETE FROM feeds WHERE id=?").run(id);
  }

  // --- exclusions ---
  addExclusion(host: string, note?: string): void {
    this.db
      .prepare("INSERT INTO exclusions(host,added_at,note) VALUES(?,?,?) ON CONFLICT(host) DO NOTHING")
      .run(host.toLowerCase(), new Date().toISOString(), note ?? null);
  }
  removeExclusion(host: string): void {
    this.q("DELETE FROM exclusions WHERE host=?").run(host.toLowerCase());
  }
  listExclusions(): Array<{ host: string; addedAt: string; note: string | null }> {
    const rows = this.q("SELECT * FROM exclusions ORDER BY host").all() as Record<string, unknown>[];
    return rows.map((r) => ({ host: r.host as string, addedAt: r.added_at as string, note: (r.note as string) ?? null }));
  }
  isExcluded(host: string | null): boolean {
    if (!host) return false;
    const h = host.toLowerCase();
    const hosts = this.q("SELECT host FROM exclusions").all() as Array<{ host: string }>;
    return hosts.some((e) => h === e.host || h.endsWith(`.${e.host}`));
  }

  // --- recovery & retention ---
  recoverInterrupted(): { runsCrashed: number; projectsRequeued: number } {
    const requeued = this.db
      .prepare("UPDATE projects SET status='queued' WHERE status='checking'")
      .run().changes;
    const crashed = this.db
      .prepare("UPDATE runs SET status='crashed', finished_at=COALESCE(finished_at, ?) WHERE status IN ('running','paused','stopping')")
      .run(new Date().toISOString()).changes;
    return { runsCrashed: crashed, projectsRequeued: requeued };
  }

  purgeOlderThan(days: number): { projects: number } {
    const cutoff = new Date(Date.now() - days * 86400 * 1000).toISOString();
    const n = this.q("DELETE FROM projects WHERE discovered_at < ?").run(cutoff).changes;
    this.q("DELETE FROM notifications WHERE created_at < ?").run(cutoff);
    return { projects: n };
  }

  /** Ile aplikacji objęto kontrolami w ciągu ostatnich 24h (limit dobowy). */
  checkedInLast24h(): number {
    const cutoff = new Date(Date.now() - 86400 * 1000).toISOString();
    return (this.q("SELECT COUNT(*) as c FROM check_runs WHERE started_at >= ?").get(cutoff) as { c: number }).c;
  }
}
