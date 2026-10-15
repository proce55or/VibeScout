import type { Config } from "../config.js";
import type { Db } from "../db/db.js";
import type { Transport } from "../net/transport.js";
import type { DnsLookup } from "../net/ssrf.js";
import { RateLimiter } from "../net/ratelimit.js";
import { runWebChecks } from "../checks/run-checks.js";
import { CONNECTORS, getConnector } from "../connectors/registry.js";
import { qualify } from "../classify/qualify.js";
import type { ConnectorContext } from "../connectors/types.js";
import type { RunParams, RunState, RunCounters, Project } from "../types.js";

/**
 * Orkiestracja przebiegu: pobranie ogłoszeń → kwalifikacja/dedup → kolejka →
 * ograniczone kontrole WWW → raport/powiadomienia.
 *
 * Sterowanie: Start / Pauza / Wznów / Stop. Brak podwójnego Startu. Stan kolejki
 * trwały w SQLite (status projektów). Po awarii przerwane zadania są wznawialne
 * (recoverInterrupted w Db). Limit dobowy kontroli i budżet odczytów respektowane.
 */

export interface PipelineDeps {
  transport: Transport;
  lookup?: DnsLookup;
  now?: () => number;
}

export interface PipelineEvent {
  seq: number;
  ts: string;
  level: "info" | "ok" | "warn" | "error";
  msg: string;
}

export class Pipeline {
  private paused = false;
  private stopRequested = false;
  private activeRunId: string | null = null;
  private loop: Promise<void> | null = null;
  private readonly now: () => number;

  /** Dziennik zdarzeń na żywo (w pamięci; do podglądu w panelu). */
  private events: PipelineEvent[] = [];
  private seq = 0;
  private readonly maxEvents = 400;

  private log(level: PipelineEvent["level"], msg: string): void {
    this.seq += 1;
    this.events.push({ seq: this.seq, ts: new Date(this.now()).toISOString(), level, msg });
    if (this.events.length > this.maxEvents) this.events.splice(0, this.events.length - this.maxEvents);
  }

  /** Zwraca zdarzenia nowsze niż `since` (dla podglądu na żywo). */
  getEvents(since = 0): { events: PipelineEvent[]; lastSeq: number } {
    const events = this.events.filter((e) => e.seq > since);
    return { events, lastSeq: this.seq };
  }

  /** Limiter kontroli: globalnie max 2 równolegle, 1 żądanie / 5 s na host. */
  private readonly checkLimiter: RateLimiter;
  /** Limiter źródeł: osobne, łagodniejsze limity. */
  private readonly sourceLimiter: RateLimiter;

  constructor(
    private readonly db: Db,
    private readonly cfg: Config,
    private readonly deps: PipelineDeps,
  ) {
    this.now = deps.now ?? Date.now;
    this.checkLimiter = new RateLimiter({
      maxConcurrent: cfg.limits.maxConcurrentApps,
      minHostIntervalMs: cfg.limits.minHostIntervalMs,
      now: this.now,
    });
    this.sourceLimiter = new RateLimiter({ maxConcurrent: 4, minHostIntervalMs: 500, now: this.now });
  }

  /** Transport z globalnym limitem współbieżności i odstępem per host (dla kontroli). */
  private rateLimitedTransport(): Transport {
    return (req) => this.checkLimiter.run(req.hostname, () => this.deps.transport(req));
  }

  getStatus(): { run: RunState | null; live: { paused: boolean; stopRequested: boolean }; queued: number; unread: number } {
    const run = this.activeRunId ? this.db.getRun(this.activeRunId) : this.db.getActiveRun();
    return {
      run,
      live: { paused: this.paused, stopRequested: this.stopRequested },
      queued: this.db.queuedCount(),
      unread: this.db.unreadNotificationCount(),
    };
  }

  isRunning(): boolean {
    return this.activeRunId !== null;
  }

  start(params: RunParams): { ok: boolean; error?: string; runId?: string } {
    if (this.activeRunId) {
      return { ok: false, error: "Przebieg już trwa — nie uruchamiam drugiego." };
    }
    const existing = this.db.getActiveRun();
    if (existing) {
      // Z poprzedniej sesji pozostał aktywny wpis — oznacz jako crashed, nie dubluj.
      this.db.updateRun(existing.id, { status: "crashed", note: "Wykryto przerwany przebieg przy starcie nowego." });
    }
    this.paused = false;
    this.stopRequested = false;
    const run = this.db.createRun(params);
    this.activeRunId = run.id;
    this.loop = this.execute(run.id, params).catch((err) => {
      this.db.updateRun(run.id, { status: "crashed", finishedAt: new Date(this.now()).toISOString(), note: String(err) });
      this.db.addNotification({
        level: "attention",
        title: "Przebieg zakończony błędem",
        body: String(err instanceof Error ? err.message : err),
        projectId: null,
        runId: run.id,
      });
    }).finally(() => {
      this.activeRunId = null;
      this.loop = null;
    });
    return { ok: true, runId: run.id };
  }

  pause(): void {
    if (this.activeRunId) {
      this.paused = true;
      this.db.updateRun(this.activeRunId, { status: "paused" });
      this.log("warn", "⏸ Pauza — kończę bieżące zadanie i wstrzymuję kolejne.");
    }
  }

  resume(): void {
    if (this.activeRunId && this.paused) {
      this.paused = false;
      this.db.updateRun(this.activeRunId, { status: "running" });
      this.log("info", "⏵ Wznowiono.");
    }
  }

  stop(): void {
    if (this.activeRunId) {
      this.stopRequested = true;
      this.paused = false;
      this.db.updateRun(this.activeRunId, { status: "stopping" });
      this.log("warn", "⏹ Zatrzymywanie — dokończę bieżące zadanie i zapiszę wyniki.");
    }
  }

  private async waitWhilePaused(): Promise<void> {
    while (this.paused && !this.stopRequested) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  private async execute(runId: string, params: RunParams): Promise<void> {
    const counters: RunCounters = this.db.getRun(runId)!.counters;
    this.log("info", `▶ Start przebiegu. Źródła: ${params.sources.join(", ")}; zakres ${params.lookbackDays} dni; limit ${params.maxAppsPerDay}/dobę.`);

    // --- Faza 1: pobranie ogłoszeń i kwalifikacja ---
    const budget = { reads: 0, max: params.sourceReadBudget };
    const ctx: ConnectorContext = {
      transport: this.deps.transport,
      lookup: this.deps.lookup,
      rateLimiter: this.sourceLimiter,
      now: this.now,
      budget,
      demo: this.cfg.demo,
      githubToken: this.cfg.githubToken,
    };
    const feeds = this.db.listFeeds().map((f) => ({ name: f.name, url: f.url, enabled: f.enabled, limit: f.limit }));

    let minDate: string | null = null;
    let maxDate: string | null = null;

    for (const sourceId of params.sources) {
      if (this.stopRequested) break;
      await this.waitWhilePaused();
      const connector = getConnector(sourceId);
      if (!connector || !connector.implemented) continue;
      this.log("info", `Źródło „${connector.name}": pobieram ogłoszenia…`);
      let result;
      try {
        result = await connector.collect({ lookbackDays: params.lookbackDays, limit: 100, feeds }, ctx);
      } catch (err) {
        this.log("error", `Źródło „${connector.name}": błąd — ${String(err instanceof Error ? err.message : err)}`);
        this.db.addNotification({
          level: "attention",
          title: `Błąd konektora: ${connector.name}`,
          body: String(err instanceof Error ? err.message : err),
          projectId: null,
          runId,
        });
        continue;
      }
      counters.sourceReads = budget.reads;
      if (result.error) {
        this.log("error", `Źródło „${connector.name}": ${result.error}`);
        this.db.addNotification({
          level: "attention",
          title: `Konektor ${connector.name}: problem`,
          body: result.error,
          projectId: null,
          runId,
        });
      }
      this.log("ok", `Źródło „${connector.name}": zebrano ${result.items.length} kandydatów (${result.note}).`);
      let processed = 0;
      for (const item of result.items) {
        counters.found += 1;
        // Wykluczenia domen.
        let host: string | null = null;
        try {
          if (item.appUrl) host = new URL(item.appUrl).hostname;
        } catch {
          /* ignore */
        }
        if (this.db.isExcluded(host)) {
          counters.rejected += 1;
          continue;
        }
        const qual = qualify(item);
        const { merged } = this.db.insertOrMergeProject(runId, item, qual);
        if (!merged) {
          if (qual.status === "rejected") counters.rejected += 1;
          else if (qual.status === "queued") counters.queued += 1;
          else if (qual.status === "needs_review") counters.needsReview += 1;
        }
        if (item.publishedAt) {
          if (!minDate || item.publishedAt < minDate) minDate = item.publishedAt;
          if (!maxDate || item.publishedAt > maxDate) maxDate = item.publishedAt;
        }
        // Liczniki na bieżąco (co kilka pozycji), żeby panel pokazywał postęp.
        processed += 1;
        if (processed % 5 === 0) this.db.updateRun(runId, { counters, dateRange: { from: minDate, to: maxDate } });
      }
      this.db.updateRun(runId, { counters, dateRange: { from: minDate, to: maxDate } });
      this.log(
        "info",
        `Po kwalifikacji: do kontroli ${counters.queued}, do przeglądu ${counters.needsReview}, odrzucone ${counters.rejected}.`,
      );
    }

    // --- Faza 2: kontrole WWW (limit dobowy + współbieżność) ---
    const alreadyToday = this.db.checkedInLast24h();
    let dailyRemaining = Math.max(0, params.maxAppsPerDay - alreadyToday);
    const toCheck = this.db.queuedCount();
    this.log("info", `Kontrole WWW: w kolejce ${toCheck}, dziś dostępny limit ${dailyRemaining}.`);
    const checkTransport = this.rateLimitedTransport();
    const checkDeps = { transport: checkTransport, lookup: this.deps.lookup, now: this.now };

    const worker = async (): Promise<void> => {
      while (!this.stopRequested) {
        await this.waitWhilePaused();
        if (this.stopRequested) break;
        if (dailyRemaining <= 0) break;
        const project = this.db.claimNextQueued(runId);
        if (!project) break;
        dailyRemaining -= 1;
        await this.checkOne(project, checkDeps, counters, runId);
        this.db.updateRun(runId, { counters });
      }
    };

    const workers: Promise<void>[] = [];
    for (let i = 0; i < this.cfg.limits.maxConcurrentApps; i += 1) workers.push(worker());
    await Promise.all(workers);

    // --- Faza 3: zakończenie ---
    const stillQueued = this.db.queuedCount();
    const finalStatus = this.stopRequested ? "stopped" : "done";
    const limitedNote =
      dailyRemaining <= 0 && stillQueued > 0
        ? `Osiągnięto dobowy limit kontroli (${params.maxAppsPerDay}). W kolejce pozostało ${stillQueued} — dokończy kolejny przebieg.`
        : stillQueued > 0 && this.stopRequested
          ? `Przebieg zatrzymany. W kolejce pozostało ${stillQueued}.`
          : null;
    this.db.updateRun(runId, {
      status: finalStatus,
      finishedAt: new Date(this.now()).toISOString(),
      counters,
      note: limitedNote,
    });

    this.log(
      this.stopRequested ? "warn" : "ok",
      `■ ${this.stopRequested ? "Przebieg zatrzymany" : "Przebieg zakończony"}: znalezione ${counters.found}, sprawdzone ${counters.checked}, do przeglądu ${counters.needsReview}, odrzucone ${counters.rejected}, błędy ${counters.errors}.${limitedNote ? " " + limitedNote : ""}`,
    );

    // Retencja.
    this.db.purgeOlderThan(this.cfg.retentionDays);

    // Powiadomienie podsumowujące (trwałe).
    this.db.addNotification({
      level: counters.needsReview > 0 ? "attention" : "info",
      title: this.stopRequested ? "Przebieg zatrzymany" : "Przebieg zakończony",
      body: `Znaleziono ${counters.found}, zakwalifikowano do kontroli ${counters.queued}, sprawdzono ${counters.checked}, do przeglądu ${counters.needsReview}, odrzucono ${counters.rejected}, błędy ${counters.errors}.${limitedNote ? " " + limitedNote : ""}`,
      projectId: null,
      runId,
    });
  }

  private async checkOne(
    project: Project,
    checkDeps: { transport: Transport; lookup?: DnsLookup; now: () => number },
    counters: RunCounters,
    runId: string,
  ): Promise<void> {
    if (!project.appUrl) {
      this.db.updateProjectStatus(project.id, "rejected", "brak adresu aplikacji");
      counters.rejected += 1;
      return;
    }
    // Ponowne sprawdzenie wykluczeń (mogły dojść po dodaniu do kolejki).
    if (this.db.isExcluded(project.host)) {
      this.db.updateProjectStatus(project.id, "rejected", "host na liście wykluczeń");
      counters.rejected += 1;
      return;
    }
    this.log("info", `Sprawdzam: ${project.name} (${project.host ?? project.appUrl})…`);
    try {
      const result = await runWebChecks(project.appUrl, checkDeps, { now: this.now });
      result.projectId = project.id;
      this.db.saveCheckRun(result);
      counters.checked += 1;
      counters.checkedToday += 1;
      const summaryLabel =
        result.summary === "needs_review" ? "wymaga przeglądu" : result.summary === "incomplete" ? "wynik niepełny" : "bez uwag";
      this.log(result.summary === "needs_review" ? "warn" : "ok", `${result.summary === "needs_review" ? "⚠" : "✓"} ${project.name}: ${summaryLabel}.`);
      if (result.summary === "needs_review") {
        counters.needsReview += 1;
        this.db.addNotification({
          level: "attention",
          title: `Wymaga przeglądu: ${project.name}`,
          body: `Obserwacja wymagająca sprawdzenia dla ${project.appUrl}.`,
          projectId: project.id,
          runId,
        });
      }
    } catch (err) {
      counters.errors += 1;
      this.log("error", `✕ ${project.name}: błąd — ${String(err instanceof Error ? err.message : err)}`);
      this.db.updateProjectStatus(project.id, "error", String(err instanceof Error ? err.message : err));
    }
  }

  /** Ręczne ponowienie kontroli jednego projektu (w granicach limitów). */
  async recheck(projectId: string): Promise<{ ok: boolean; error?: string }> {
    const project = this.db.getProject(projectId);
    if (!project) return { ok: false, error: "Nie znaleziono projektu." };
    if (!project.appUrl) return { ok: false, error: "Projekt nie ma adresu aplikacji." };
    if (this.db.isExcluded(project.host)) return { ok: false, error: "Host jest na liście wykluczeń." };
    const checkDeps = { transport: this.rateLimitedTransport(), lookup: this.deps.lookup, now: this.now };
    const result = await runWebChecks(project.appUrl, checkDeps, { now: this.now });
    result.projectId = project.id;
    this.db.saveCheckRun(result);
    return { ok: true };
  }

  static availableConnectors() {
    return CONNECTORS.map((c) => ({ id: c.id, name: c.name, implemented: c.implemented, coverage: c.coverage }));
  }
}
