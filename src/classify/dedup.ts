import { TRACKING_PARAMS, isSensitiveParam } from "../util/redact.js";

/**
 * Normalizacja adresów aplikacji i deduplikacja.
 *
 * Zasady:
 *  - uwzględniamy subdomeny i znaczące ścieżki (na jednym hostingu działa wiele
 *    niezależnych aplikacji), więc klucz deduplikacji zawiera pełny host + ścieżkę,
 *  - ignorujemy znane parametry śledzące, ale NIE usuwamy innych parametrów,
 *  - adresy z tokenami/podpisami/danymi logowania kierujemy do ręcznej oceny.
 */

export interface NormalizedUrl {
  normalized: string;
  host: string;
  dedupKey: string;
  /** Czy adres zawiera dane wrażliwe (token/podpis/login) → ręczna ocena. */
  sensitive: boolean;
  sensitiveReason: string | null;
}

export class UrlRejected extends Error {}

export function normalizeAppUrl(raw: string): NormalizedUrl {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new UrlRejected(`Nieprawidłowy URL: ${raw}`);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new UrlRejected(`Niedozwolony schemat: ${u.protocol}`);
  }

  let sensitive = false;
  let sensitiveReason: string | null = null;

  if (u.username || u.password) {
    sensitive = true;
    sensitiveReason = "dane logowania w adresie";
    u.username = "";
    u.password = "";
  }

  const host = u.hostname.toLowerCase();

  // Parametry: usuń znane śledzące; wykryj wrażliwe.
  const kept: Array<[string, string]> = [];
  for (const [key, value] of u.searchParams.entries()) {
    if (TRACKING_PARAMS.has(key.toLowerCase())) continue;
    if (isSensitiveParam(key)) {
      sensitive = true;
      sensitiveReason = sensitiveReason ?? `wrażliwy parametr: ${key}`;
      // Nie włączamy wrażliwego parametru do klucza deduplikacji.
      continue;
    }
    kept.push([key, value]);
  }

  // Ścieżka: usuń końcowy ukośnik poza korzeniem.
  let path = u.pathname || "/";
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);

  // Posortowane pozostałe parametry do klucza (stabilność).
  const sortedParams = [...kept].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1));
  const queryKey = sortedParams.map(([k, v]) => `${k}=${v}`).join("&");

  // Port w kluczu tylko, gdy niestandardowy.
  const portPart = u.port && !((u.protocol === "https:" && u.port === "443") || (u.protocol === "http:" && u.port === "80")) ? `:${u.port}` : "";

  const dedupKey = `${host}${portPart}${path}${queryKey ? `?${queryKey}` : ""}`;

  // Zbuduj znormalizowany adres (bez fragmentu, bez śledzących).
  const normUrl = new URL(`${u.protocol}//${u.host}${path}`);
  for (const [k, v] of kept) normUrl.searchParams.append(k, v);
  const normalized = normUrl.toString();

  return { normalized, host, dedupKey, sensitive, sensitiveReason };
}

/** Czy dwa adresy wskazują tę samą aplikację (po normalizacji). */
export function sameApp(a: string, b: string): boolean {
  try {
    return normalizeAppUrl(a).dedupKey === normalizeAppUrl(b).dedupKey;
  } catch {
    return false;
  }
}
