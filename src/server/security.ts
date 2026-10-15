import { randomUUID } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

/**
 * Ochrona lokalnego panelu:
 *  - panel odpowiada tylko na żądania z hosta pętli zwrotnej (127.0.0.1/localhost/::1),
 *    co blokuje DNS rebinding na panel,
 *  - operacje zmieniające stan (POST/PUT/DELETE) wymagają tokenu lokalnej sesji
 *    (nagłówek x-vibescout-token) oraz zgodnego Origin/Referer (ochrona CSRF),
 *  - brak CORS z gwiazdką, brak publicznego proxy.
 */

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/** Token lokalnej sesji, generowany przy starcie procesu. */
export const SESSION_TOKEN = randomUUID();

function hostnameOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    // value może być "host:port" lub pełnym URL (Origin/Referer).
    if (value.includes("://")) return new URL(value).hostname;
    const h = value.split(":");
    // IPv6 w nawiasach.
    if (value.startsWith("[")) return value.slice(0, value.indexOf("]") + 1);
    return h[0] ?? null;
  } catch {
    return null;
  }
}

function isLoopbackHost(host: string | null): boolean {
  if (!host) return false;
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  return LOOPBACK_HOSTS.has(h) || LOOPBACK_HOSTS.has(host.toLowerCase());
}

/** Odrzuca żądania spoza pętli zwrotnej. */
export function hostGuard(req: Request, res: Response, next: NextFunction): void {
  const host = hostnameOf(req.headers.host);
  if (!isLoopbackHost(host)) {
    res.status(403).json({ error: "Panel dostępny tylko lokalnie (loopback)." });
    return;
  }
  next();
}

/** Wymusza token i zgodny Origin dla operacji zmieniających stan. */
export function csrfGuard(req: Request, res: Response, next: NextFunction): void {
  const mutating = req.method === "POST" || req.method === "PUT" || req.method === "DELETE" || req.method === "PATCH";
  if (!mutating) {
    next();
    return;
  }
  // Origin/Referer, jeśli obecne, muszą wskazywać loopback.
  const origin = req.headers.origin as string | undefined;
  const referer = req.headers.referer as string | undefined;
  if (origin && !isLoopbackHost(hostnameOf(origin))) {
    res.status(403).json({ error: "Niedozwolony Origin." });
    return;
  }
  if (!origin && referer && !isLoopbackHost(hostnameOf(referer))) {
    res.status(403).json({ error: "Niedozwolony Referer." });
    return;
  }
  const token = req.headers["x-vibescout-token"];
  if (token !== SESSION_TOKEN) {
    res.status(403).json({ error: "Brak lub nieprawidłowy token lokalnej sesji." });
    return;
  }
  next();
}
