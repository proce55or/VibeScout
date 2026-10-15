import { HARD_LIMITS, type HardLimits } from "../config.js";
import {
  parseAndValidateUrl,
  resolvePublicIps,
  SsrfError,
  type DnsLookup,
} from "./ssrf.js";
import type { Transport, TransportResponse, TlsInfo } from "./transport.js";

/**
 * Bezpieczne pobieranie publicznej strony:
 *  - walidacja SSRF przed KAŻDYM żądaniem (także na każdym etapie przekierowania),
 *  - twarde limity: liczba żądań na aplikację, liczba przekierowań, rozmiar treści,
 *    czas żądania i czas całej kontroli,
 *  - brak automatycznego ponawiania (Retry-After jest tylko raportowane),
 *  - transport wstrzykiwany (w testach — fixture; w programie — node:http/https).
 */

export interface SafeFetchDeps {
  transport: Transport;
  lookup?: DnsLookup;
  now?: () => number;
}

export interface FetchOptions {
  method?: string;
  headers?: Record<string, string>;
  maxRedirects?: number;
}

export interface RedirectHop {
  from: string;
  to: string;
  status: number;
}

export interface FetchResult {
  ok: boolean;
  requestedUrl: string;
  finalUrl: string;
  status: number;
  headers: Record<string, string>;
  setCookie: string[];
  body: string;
  bodyBytes: number;
  truncated: boolean;
  tls: TlsInfo | null;
  resolvedIp: string | null;
  redirects: RedirectHop[];
  /** Jeśli przerwano z powodu polityki bezpieczeństwa (SSRF) — powód. */
  blocked: { reason: string; code: string; url: string } | null;
  /** Inny błąd sieciowy (timeout, reset itp.). */
  error: string | null;
  timingMs: number;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** Wspólny budżet żądań dla kontroli JEDNEJ aplikacji. */
export class FetchBudget {
  requests = 0;
  redirects = 0;
  bytes = 0;
  readonly startedAt: number;
  constructor(
    readonly limits: HardLimits,
    private readonly now: () => number = Date.now,
  ) {
    this.startedAt = now();
  }
  elapsedMs(): number {
    return this.now() - this.startedAt;
  }
  /** Czy wolno wykonać kolejne żądanie HTTP (łącznie z robots.txt i przekierowaniami). */
  canRequest(): { ok: boolean; reason: string | null } {
    if (this.requests >= this.limits.maxHttpRequestsPerApp) {
      return { ok: false, reason: `osiągnięto limit ${this.limits.maxHttpRequestsPerApp} żądań` };
    }
    if (this.elapsedMs() >= this.limits.perAppTimeoutMs) {
      return { ok: false, reason: "przekroczono łączny limit czasu kontroli" };
    }
    return { ok: true, reason: null };
  }
}

function portFor(url: URL): number {
  if (url.port) return Number.parseInt(url.port, 10);
  return url.protocol === "https:" ? 443 : 80;
}

/**
 * Pobiera adres, podążając za przekierowaniami w granicach limitów.
 * Każdy etap jest walidowany pod kątem SSRF przed połączeniem.
 */
export async function safeFetch(
  rawUrl: string,
  opts: FetchOptions,
  budget: FetchBudget,
  deps: SafeFetchDeps,
): Promise<FetchResult> {
  const now = deps.now ?? Date.now;
  const limits = budget.limits;
  const maxRedirects = Math.min(opts.maxRedirects ?? limits.maxRedirects, limits.maxRedirects);
  const startTime = now();

  const result: FetchResult = {
    ok: false,
    requestedUrl: rawUrl,
    finalUrl: rawUrl,
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
    error: null,
    timingMs: 0,
  };

  const visited = new Set<string>();
  let currentUrl = rawUrl;

  for (let hop = 0; ; hop += 1) {
    // Limit przekierowań.
    if (hop > maxRedirects) {
      result.error = `przekroczono limit ${maxRedirects} przekierowań`;
      break;
    }
    // Wykrycie pętli.
    if (visited.has(currentUrl)) {
      result.error = "wykryto pętlę przekierowań";
      break;
    }
    visited.add(currentUrl);

    const gate = budget.canRequest();
    if (!gate.ok) {
      result.error = gate.reason;
      result.truncated = true;
      break;
    }

    // Walidacja SSRF PRZED połączeniem.
    let url: URL;
    let publicIps: string[];
    let family: 4 | 6;
    try {
      url = parseAndValidateUrl(currentUrl);
      const resolved = await resolvePublicIps(url.hostname, deps.lookup);
      publicIps = resolved.ips;
      family = resolved.family;
    } catch (err) {
      if (err instanceof SsrfError) {
        result.blocked = { reason: err.message, code: err.code, url: currentUrl };
      } else {
        result.error = err instanceof Error ? err.message : String(err);
      }
      break;
    }

    const pinnedIp = publicIps[0]!;
    result.resolvedIp = pinnedIp;
    result.finalUrl = currentUrl;

    budget.requests += 1;
    let resp: TransportResponse;
    try {
      resp = await deps.transport({
        protocol: url.protocol === "https:" ? "https:" : "http:",
        hostname: url.hostname,
        pinnedIp,
        family,
        port: portFor(url),
        method: opts.method ?? "GET",
        path: `${url.pathname}${url.search}`,
        headers: {
          host: url.host,
          "user-agent": opts.headers?.["user-agent"] ?? "VibeScout/1.0",
          accept: "text/html,application/xhtml+xml,*/*;q=0.8",
          "accept-encoding": "gzip, deflate, br",
          ...opts.headers,
        },
        timeoutMs: limits.perRequestTimeoutMs,
        maxBodyBytes: limits.maxBodyBytes,
      });
    } catch (err) {
      result.error = err instanceof Error ? err.message : String(err);
      break;
    }

    budget.bytes += resp.bodyBytes;
    result.status = resp.status;
    result.headers = resp.headers;
    result.setCookie = resp.setCookie;
    result.body = resp.body;
    result.bodyBytes = resp.bodyBytes;
    result.truncated = result.truncated || resp.truncated;
    result.tls = resp.tls;

    // Przekierowanie?
    const location = resp.headers["location"];
    if (REDIRECT_STATUSES.has(resp.status) && location) {
      let nextUrl: string;
      try {
        nextUrl = new URL(location, currentUrl).toString();
      } catch {
        result.error = `nieprawidłowy adres przekierowania: ${location}`;
        break;
      }
      result.redirects.push({ from: currentUrl, to: nextUrl, status: resp.status });
      budget.redirects += 1;
      currentUrl = nextUrl;
      continue;
    }

    result.ok = resp.status > 0;
    break;
  }

  result.timingMs = now() - startTime;
  return result;
}

/** Wygodny konstruktor budżetu z twardymi limitami. */
export function newBudget(now?: () => number): FetchBudget {
  return new FetchBudget(HARD_LIMITS, now);
}
