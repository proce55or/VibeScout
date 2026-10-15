import { describe, it, expect } from "vitest";
import { analyzeHeaders } from "../src/checks/headers.js";
import { parseCookieAttributes } from "../src/checks/cookies.js";
import { findMixedContent, findDisclosures } from "../src/checks/html.js";
import { runWebChecks } from "../src/checks/run-checks.js";
import { routeTransport, publicLookup, resp, fakeTransport } from "./helpers.js";

describe("interpretacja nagłówków", () => {
  it("brak CSP → zalecenie; Report-Only → wymaga sprawdzenia; frame-ancestors liczy się jako ochrona", () => {
    const none = analyzeHeaders({}, { https: true, isHtml: true });
    expect(none.find((f) => f.id === "csp")?.severity).toBe("recommendation");

    const ro = analyzeHeaders({ "content-security-policy-report-only": "default-src 'self'" }, { https: true, isHtml: true });
    expect(ro.find((f) => f.id === "csp")?.severity).toBe("needs_check");

    const fa = analyzeHeaders({ "content-security-policy": "frame-ancestors 'none'" }, { https: true, isHtml: true });
    expect(fa.find((f) => f.id === "framing")?.present).toBe(true);
  });
});

describe("interpretacja cookies", () => {
  it("parsuje atrybuty bez zapisywania wartości", () => {
    const c = parseCookieAttributes("sid=supersecretvalue; Secure; HttpOnly; SameSite=Lax");
    expect(c.secure).toBe(true);
    expect(c.httpOnly).toBe(true);
    expect(c.sameSite).toBe("Lax");
    expect(JSON.stringify(c)).not.toContain("supersecretvalue");
  });
});

describe("skan HTML", () => {
  it("odróżnia link <a href> od mixed content podzasobu", () => {
    const html = `<a href="http://example.org/page">link</a><script src="http://cdn.example/x.js"></script>`;
    const refs = findMixedContent(html);
    expect(refs.length).toBe(1);
    expect(refs[0]!.tag).toBe("script");
  });

  it("wykrywa zrzut stosu (ujawnienie diagnostyczne)", () => {
    const d = findDisclosures(`<pre>Traceback (most recent call last):\n  File "x.py"</pre>`);
    expect(d.length).toBeGreaterThan(0);
  });
});

describe("runWebChecks (pełna kontrola A–F)", () => {
  const robots = { status: 200, body: "User-agent: *\nAllow: /\n" };

  it("błąd certyfikatu → obserwacja 'wymaga sprawdzenia', bez pobrania treści", async () => {
    const transport = fakeTransport((req) => {
      if (req.path === "/robots.txt") return resp(robots);
      if (req.protocol === "https:") return resp({ status: 0, tls: { authorized: false, authorizationError: "CERT_HAS_EXPIRED", protocol: null, validFrom: null, validTo: null, subjectCN: null, issuerCN: null, altNames: [] }, body: "" });
      return resp({ status: 200, body: "http" });
    });
    const result = await runWebChecks("https://expired.example/", { transport, lookup: publicLookup });
    const a = result.observations.find((o) => o.check === "A");
    expect(a?.severity).toBe("needs_check");
    expect(result.summary).toBe("needs_review");
  });

  it("strona z mixed content → obserwacja E 'wymaga sprawdzenia'", async () => {
    const page = `<!doctype html><html><body><script src="http://cdn.example/w.js"></script></body></html>`;
    const transport = routeTransport({
      "https://mc.example/robots.txt": robots,
      "https://mc.example/": { status: 200, headers: { "content-type": "text/html" }, body: page },
      "http://mc.example/": { status: 301, headers: { location: "https://mc.example/" } },
    });
    const result = await runWebChecks("https://mc.example/", { transport, lookup: publicLookup });
    const e = result.observations.filter((o) => o.check === "E");
    expect(e.some((o) => o.severity === "needs_check")).toBe(true);
    expect(result.resolvedIp).toBe("93.184.216.34");
  });

  it("respektuje 429 bez oznaczania podatności", async () => {
    const transport = fakeTransport((req) => {
      if (req.path === "/robots.txt") return resp(robots);
      return resp({ status: 429, headers: { "retry-after": "60" }, body: "" });
    });
    const result = await runWebChecks("https://rl.example/", { transport, lookup: publicLookup });
    // Brak obserwacji o wadze needs_check wynikającej z 429.
    expect(result.summary).not.toBe("needs_review");
  });
});
