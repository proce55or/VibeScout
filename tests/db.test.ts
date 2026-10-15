import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Db } from "../src/db/db.js";
import { qualify } from "../src/classify/qualify.js";
import type { ProjectInput } from "../src/types.js";

function input(appUrl: string, source: string, text = "built with Claude Code"): ProjectInput {
  return { name: appUrl, appUrl, announcementUrl: `https://news.example/${source}`, source, publishedAt: null, rawText: text, externalId: `${source}-1` };
}

describe("baza danych: kolejka, dedup, odzyskiwanie", () => {
  let db: Db;
  beforeEach(() => {
    db = new Db(":memory:");
  });
  afterEach(() => db.close());

  it("niezależne aplikacje na wspólnym hostingu to osobne rekordy", () => {
    const a = input("https://host.example/app-a", "hackernews");
    const b = input("https://host.example/app-b", "hackernews");
    const r1 = db.insertOrMergeProject("run1", a, qualify(a));
    const r2 = db.insertOrMergeProject("run1", b, qualify(b));
    expect(r1.merged).toBe(false);
    expect(r2.merged).toBe(false);
    expect(r1.project.id).not.toBe(r2.project.id);
  });

  it("dwa ogłoszenia tej samej aplikacji są łączone z zachowaniem pochodzenia", () => {
    const a = { ...input("https://same.example/app", "hackernews"), externalId: "hn-1" };
    const b = { ...input("https://same.example/app", "rss"), externalId: "rss-9" };
    db.insertOrMergeProject("run1", a, qualify(a));
    const r2 = db.insertOrMergeProject("run1", b, qualify(b));
    expect(r2.merged).toBe(true);
    expect(r2.project.mergedFrom.some((m) => m.source === "rss")).toBe(true);
  });

  it("kolejka: claimNextQueued oznacza 'checking' i jest trwała", () => {
    const a = input("https://q.example/app", "hackernews");
    db.insertOrMergeProject("run1", a, qualify(a)); // declared_ai → queued
    expect(db.queuedCount()).toBe(1);
    const claimed = db.claimNextQueued("run1");
    expect(claimed).not.toBeNull();
    expect(db.getProject(claimed!.id)!.status).toBe("checking");
    expect(db.claimNextQueued("run1")).toBeNull();
  });

  it("odzyskiwanie po awarii przywraca przerwane zadania do kolejki", () => {
    const a = input("https://r.example/app", "hackernews");
    db.insertOrMergeProject("run1", a, qualify(a));
    const claimed = db.claimNextQueued("run1");
    expect(db.getProject(claimed!.id)!.status).toBe("checking");
    const rec = db.recoverInterrupted();
    expect(rec.projectsRequeued).toBeGreaterThanOrEqual(1);
    expect(db.getProject(claimed!.id)!.status).toBe("queued");
  });

  it("brak działającego adresu → odrzucony, nie w kolejce", () => {
    const a: ProjectInput = { name: "x", appUrl: null, announcementUrl: "https://news.example/x", source: "rss", publishedAt: null, rawText: "built with AI", externalId: "x" };
    const r = db.insertOrMergeProject("run1", a, qualify(a));
    expect(r.project.status).toBe("rejected");
    expect(db.queuedCount()).toBe(0);
  });

  it("wykluczenia działają dla hosta i subdomen", () => {
    db.addExclusion("blocked.example");
    expect(db.isExcluded("blocked.example")).toBe(true);
    expect(db.isExcluded("sub.blocked.example")).toBe(true);
    expect(db.isExcluded("other.example")).toBe(false);
  });
});
