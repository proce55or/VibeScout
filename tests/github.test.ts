import { describe, it, expect } from "vitest";
import { githubConnector } from "../src/connectors/github.js";
import type { ConnectorContext } from "../src/connectors/types.js";
import { RateLimiter } from "../src/net/ratelimit.js";
import { resp, type FakeResponse } from "./helpers.js";
import type { Transport } from "../src/net/transport.js";

function searchResponse(items: unknown[]): FakeResponse {
  return { status: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ total_count: items.length, items }) };
}

function ctxWith(transport: Transport): ConnectorContext {
  return {
    transport,
    lookup: async () => [{ address: "93.184.216.34", family: 4 }],
    rateLimiter: new RateLimiter({ maxConcurrent: 2, minHostIntervalMs: 0 }),
    now: Date.now,
    budget: { reads: 0, max: 100 },
    demo: false,
  };
}

const nowIso = new Date().toISOString();

describe("konektor GitHub", () => {
  it("wyodrębnia adres aplikacji z homepage i klasyfikuje deklarację AI", async () => {
    const transport: Transport = async () =>
      resp(
        searchResponse([
          {
            full_name: "alice/habit-tracker",
            html_url: "https://github.com/alice/habit-tracker",
            description: "A habit tracker I vibe coded with Claude Code",
            homepage: "https://habits.example",
            pushed_at: nowIso,
            topics: ["ai"],
          },
        ]),
      );
    const r = await githubConnector.collect({ lookbackDays: 365, limit: 10 }, ctxWith(transport));
    expect(r.items.length).toBeGreaterThanOrEqual(1);
    const it0 = r.items[0]!;
    expect(it0.appUrl).toBe("https://habits.example/");
    expect(it0.source).toBe("github");
    expect(it0.announcementUrl).toContain("github.com/alice/habit-tracker");
  });

  it("repo bez homepage → appUrl null (zapis źródła, nie działająca aplikacja)", async () => {
    const transport: Transport = async () =>
      resp(searchResponse([{ full_name: "bob/lib", html_url: "https://github.com/bob/lib", description: "built with cursor", homepage: null, pushed_at: nowIso }]));
    const r = await githubConnector.collect({ lookbackDays: 365, limit: 10 }, ctxWith(transport));
    expect(r.items[0]!.appUrl).toBeNull();
  });

  it("homepage wskazujący na github.com nie jest traktowany jako aplikacja", async () => {
    const transport: Transport = async () =>
      resp(searchResponse([{ full_name: "c/d", html_url: "https://github.com/c/d", description: "vibe coded", homepage: "https://github.com/c/d", pushed_at: nowIso }]));
    const r = await githubConnector.collect({ lookbackDays: 365, limit: 10 }, ctxWith(transport));
    expect(r.items[0]!.appUrl).toBeNull();
  });

  it("respektuje limit API (403) i raportuje problem", async () => {
    const transport: Transport = async () => resp({ status: 403, body: "rate limited" });
    const r = await githubConnector.collect({ lookbackDays: 365, limit: 10 }, ctxWith(transport));
    expect(r.limited).toBe(true);
    expect(r.error).toMatch(/limit/i);
  });
});
