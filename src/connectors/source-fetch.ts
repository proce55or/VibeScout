import { FetchBudget, safeFetch, type FetchResult } from "../net/fetch.js";
import type { HardLimits } from "../config.js";
import type { ConnectorContext } from "./types.js";

/**
 * Pobieranie z API/kanałów źródeł przez wspólną warstwę sieciową (SSRF, limity),
 * z osobnym limitem wielkości i rate-limitem per host źródła.
 */
const SOURCE_LIMITS: HardLimits = {
  maxHttpRequestsPerApp: 6,
  maxRedirects: 5,
  perRequestTimeoutMs: 10_000,
  perAppTimeoutMs: 15_000,
  maxBodyBytes: 3_145_728, // 3 MB (kanały bywają większe niż strony)
  maxConcurrentApps: 2,
  minHostIntervalMs: 0, // odstępy pilnuje wspólny RateLimiter
};

export async function fetchSource(url: string, ctx: ConnectorContext): Promise<FetchResult> {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    // Zwróć wynik z błędem zamiast rzucać.
    const budget = new FetchBudget(SOURCE_LIMITS, ctx.now);
    return {
      ok: false,
      requestedUrl: url,
      finalUrl: url,
      status: 0,
      headers: {},
      setCookie: [],
      body: "",
      bodyBytes: 0,
      truncated: false,
      tls: null,
      resolvedIp: null,
      redirects: [],
      blocked: null,
      error: "nieprawidłowy URL źródła",
      timingMs: 0,
    };
  }
  return ctx.rateLimiter.run(host, async () => {
    const budget = new FetchBudget(SOURCE_LIMITS, ctx.now);
    return safeFetch(
      url,
      {
        method: "GET",
        headers: {
          "user-agent": "VibeScout/1.0 (+local research tool)",
          accept: "application/json, application/rss+xml, application/atom+xml, text/xml, */*;q=0.8",
        },
      },
      budget,
      { transport: ctx.transport, lookup: ctx.lookup, now: ctx.now },
    );
  });
}

export function parseJson<T>(res: FetchResult): T | null {
  if (!res.ok || res.status < 200 || res.status >= 300) return null;
  try {
    return JSON.parse(res.body) as T;
  } catch {
    return null;
  }
}
