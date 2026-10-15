import { describe, it, expect, afterEach } from "vitest";
import { Db } from "../src/db/db.js";
import { Pipeline } from "../src/pipeline/pipeline.js";
import { HARD_LIMITS, type Config } from "../src/config.js";
import { makeDemoDeps } from "../src/demo/demo.js";
import type { RunParams } from "../src/types.js";

function testConfig(): Config {
  return {
    host: "127.0.0.1",
    port: 0,
    demo: true,
    dataDir: "/tmp",
    dbPath: ":memory:",
    retentionDays: 30,
    defaults: { maxAppsPerDay: 20, lookbackDays: 30, sourceReadBudget: 100 },
    // W testach zerujemy odstęp per host, by nie czekać realnych 5 s (logika bez zmian).
    limits: { ...HARD_LIMITS, minHostIntervalMs: 0 },
    llm: { enabled: false, endpoint: "", apiKey: "", budgetCents: 0 },
    githubToken: "",
    userAgent: "test",
  };
}

const params: RunParams = { sources: ["hackernews"], lookbackDays: 30, maxAppsPerDay: 20, sourceReadBudget: 100 };

async function waitUntilIdle(p: Pipeline, timeoutMs = 15000): Promise<void> {
  const start = Date.now();
  while (p.isRunning() && Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe("pipeline: sterowanie przebiegiem", () => {
  let db: Db;
  afterEach(() => db?.close());

  it("nie uruchamia drugiego przebiegu (brak podwójnego Start)", async () => {
    db = new Db(":memory:");
    const p = new Pipeline(db, testConfig(), makeDemoDeps());
    const r1 = p.start(params);
    const r2 = p.start(params);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(false);
    await waitUntilIdle(p);
  });

  it("Stop ustawia żądanie zatrzymania i kończy przebieg", async () => {
    db = new Db(":memory:");
    const p = new Pipeline(db, testConfig(), makeDemoDeps());
    p.start(params);
    p.stop();
    expect(p.getStatus().live.stopRequested).toBe(true);
    await waitUntilIdle(p);
    const last = db.listRuns(1)[0]!;
    expect(["stopped", "done"]).toContain(last.status);
  });

  it("pełny przebieg tworzy projekty i kończy się statusem done", async () => {
    db = new Db(":memory:");
    const p = new Pipeline(db, testConfig(), makeDemoDeps());
    p.start(params);
    await waitUntilIdle(p);
    const last = db.listRuns(1)[0]!;
    expect(last.status).toBe("done");
    expect(last.counters.found).toBeGreaterThan(0);
    const { total } = db.listProjects({});
    expect(total).toBeGreaterThan(0);
    // Co najmniej jeden projekt zakwalifikowany jako declared_ai i sprawdzony.
    const checked = db.listProjects({ status: "checked" });
    expect(checked.total).toBeGreaterThanOrEqual(1);
  });

  it("Sprawdź kolejkę: przy pustej kolejce odmawia startu", () => {
    db = new Db(":memory:");
    const p = new Pipeline(db, testConfig(), makeDemoDeps());
    const r = p.start({ ...params, sources: [], queueOnly: true });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/pusta/);
  });

  it("Sprawdź kolejkę: sprawdza zaległe projekty bez czytania źródeł", async () => {
    db = new Db(":memory:");
    const p = new Pipeline(db, testConfig(), makeDemoDeps());
    // Pierwszy przebieg z limitem 1 kontroli — reszta zostaje w kolejce.
    p.start({ ...params, maxAppsPerDay: 1 });
    await waitUntilIdle(p);
    const left = db.queuedCount();
    expect(left).toBeGreaterThan(0);

    const r = p.start({ ...params, sources: [], queueOnly: true });
    expect(r.ok).toBe(true);
    await waitUntilIdle(p);
    const last = db.listRuns(1)[0]!;
    expect(last.params.queueOnly).toBe(true);
    expect(last.counters.found).toBe(0);
    expect(last.counters.sourceReads).toBe(0);
    expect(last.counters.checked + last.counters.rejected + last.counters.errors).toBeGreaterThan(0);
    expect(db.queuedCount()).toBeLessThan(left);
  });

  it("Sprawdź kolejkę: odmawia, gdy dobowy limit wyczerpany", async () => {
    db = new Db(":memory:");
    const p = new Pipeline(db, testConfig(), makeDemoDeps());
    p.start({ ...params, maxAppsPerDay: 1 });
    await waitUntilIdle(p);
    const r = p.start({ ...params, sources: [], queueOnly: true, maxAppsPerDay: 1 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/limit/);
  });

  it("recheck zwraca błąd dla nieistniejącego projektu", async () => {
    db = new Db(":memory:");
    const p = new Pipeline(db, testConfig(), makeDemoDeps());
    const res = await p.recheck("nope");
    expect(res.ok).toBe(false);
  });
});
