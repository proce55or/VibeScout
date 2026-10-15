import { describe, it, expect } from "vitest";
import { buildReport, toMarkdown } from "../src/report/report.js";
import { toSafeHtml } from "../src/report/html.js";
import type { Project, CheckRunResult } from "../src/types.js";

function maliciousProject(): Project {
  return {
    id: "p1",
    name: '<script>alert("xss")</script>',
    appUrl: "https://evil.example/<img src=x onerror=alert(1)>",
    announcementUrl: "javascript:alert(1)",
    source: "manual",
    externalId: null,
    publishedAt: null,
    discoveredAt: new Date().toISOString(),
    host: "evil.example",
    dedupKey: "evil.example/",
    status: "checked",
    rejectReason: null,
    classification: {
      origin: "declared_ai",
      tool: "<b>Claude</b>",
      confidence: "high",
      evidenceSnippet: '</dd><script>alert(2)</script>',
      matchedTerms: ["Claude"],
      language: "en",
    },
    mergedFrom: [],
  };
}

const check: CheckRunResult = {
  projectId: "p1",
  startedAt: "2026-10-15T10:00:00.000Z",
  finishedAt: "2026-10-15T10:00:01.000Z",
  entryUrl: "https://evil.example/",
  resolvedIp: "93.184.216.34",
  observations: [
    {
      check: "F",
      title: "Możliwe ujawnienie",
      execution: "done",
      severity: "needs_check",
      observed: "<script>bad</script>",
      evidence: "<iframe>evil</iframe>",
      inference: "x",
      notConfirmed: "y",
      nextStep: "z",
    },
  ],
  summary: "needs_review",
  budget: { httpRequests: 3, redirects: 0, bytes: 100, elapsedMs: 50, truncated: false },
  error: null,
};

describe("bezpieczne wyświetlanie cudzej treści (eksport HTML)", () => {
  it("escapuje wszelki HTML z niezaufanych pól", () => {
    const html = toSafeHtml(buildReport(maliciousProject(), check));
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<iframe>evil</iframe>");
    expect(html).toContain("&lt;iframe&gt;");
  });

  it("neutralizuje niebezpieczny href (javascript:)", () => {
    const html = toSafeHtml(buildReport(maliciousProject(), check));
    expect(html).not.toContain('href="javascript:');
  });

  it("markdown zawiera wymagane sekcje", () => {
    const md = toMarkdown(buildReport(maliciousProject(), check));
    expect(md).toContain("Klasyfikacja pochodzenia");
    expect(md).toContain("Zakres kontroli");
    expect(md).toContain("Podsumowanie");
  });
});
