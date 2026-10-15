import { describe, it, expect } from "vitest";
import { safeFetch, FetchBudget } from "../src/net/fetch.js";
import { HARD_LIMITS } from "../src/config.js";
import { fakeTransport, resp, publicLookup } from "./helpers.js";

function budget(): FetchBudget {
  return new FetchBudget(HARD_LIMITS);
}

describe("safeFetch: przekierowania, limity, 429", () => {
  it("podąża za przekierowaniem HTTP→HTTPS w granicach limitu", async () => {
    const transport = fakeTransport((req) => {
      if (req.protocol === "http:") return resp({ status: 301, headers: { location: `https://${req.hostname}/` } });
      return resp({ status: 200, headers: { "content-type": "text/html" }, body: "<h1>ok</h1>" });
    });
    const res = await safeFetch("http://app.example/", {}, budget(), { transport, lookup: publicLookup });
    expect(res.redirects.length).toBe(1);
    expect(res.finalUrl.startsWith("https://")).toBe(true);
    expect(res.status).toBe(200);
  });

  it("blokuje przekierowanie na prywatny adres IP (Przykład E)", async () => {
    const transport = fakeTransport((req) => {
      if (req.hostname === "app.example") return resp({ status: 302, headers: { location: "http://10.0.0.5/" } });
      return resp({ status: 200, body: "should not reach" });
    });
    const res = await safeFetch("https://app.example/", {}, budget(), { transport, lookup: publicLookup });
    expect(res.blocked).not.toBeNull();
    expect(res.blocked?.url).toContain("10.0.0.5");
  });

  it("respektuje limit liczby przekierowań", async () => {
    let n = 0;
    const transport = fakeTransport((req) => {
      n += 1;
      return resp({ status: 302, headers: { location: `https://${req.hostname}/step${n}` } });
    });
    const res = await safeFetch("https://loop.example/", {}, budget(), { transport, lookup: publicLookup });
    expect(res.error).toMatch(/przekierowa/);
    expect(res.redirects.length).toBeLessThanOrEqual(HARD_LIMITS.maxRedirects + 1);
  });

  it("wykrywa pętlę przekierowań", async () => {
    const transport = fakeTransport((req) => resp({ status: 302, headers: { location: `https://${req.hostname}/same` } }));
    const res = await safeFetch("https://loopy.example/same", {}, budget(), { transport, lookup: publicLookup });
    expect(res.error).toMatch(/pętl/);
  });

  it("nie ponawia przy 429 i przekazuje Retry-After (Przykład F)", async () => {
    let calls = 0;
    const transport = fakeTransport(() => {
      calls += 1;
      return resp({ status: 429, headers: { "retry-after": "120" }, body: "rate limited" });
    });
    const b = budget();
    const res = await safeFetch("https://rl.example/", {}, b, { transport, lookup: publicLookup });
    expect(res.status).toBe(429);
    expect(res.headers["retry-after"]).toBe("120");
    expect(calls).toBe(1); // bez ponawiania
    expect(b.requests).toBe(1);
  });

  it("oznacza przycięcie treści przy przekroczeniu limitu", async () => {
    const transport = fakeTransport(() => resp({ status: 200, body: "x".repeat(100), truncated: true, bodyBytes: 100 }));
    const res = await safeFetch("https://big.example/", {}, budget(), { transport, lookup: publicLookup });
    expect(res.truncated).toBe(true);
  });

  it("egzekwuje limit liczby żądań na aplikację", async () => {
    const b = new FetchBudget({ ...HARD_LIMITS, maxHttpRequestsPerApp: 2 });
    const transport = fakeTransport((req) => resp({ status: 302, headers: { location: `https://${req.hostname}/n${Math.random()}` } }));
    const res = await safeFetch("https://x.example/", {}, b, { transport, lookup: publicLookup });
    expect(b.requests).toBeLessThanOrEqual(2);
    expect(res.truncated || res.error).toBeTruthy();
  });
});
