/**
 * Kontrakt warstwy transportowej. Oddziela logikę kontroli od faktycznego
 * połączenia sieciowego — w testach wstrzykujemy transport z fixture, w programie
 * działa transport na node:http/https z pinowaniem adresu IP.
 *
 * WAŻNE: walidacja SSRF (ssrf.ts) wykonuje się ZAWSZE w warstwie fetch, zanim
 * wywołany zostanie transport. Transport testowy nie może omijać tej walidacji —
 * dostaje już zweryfikowany, publiczny adres do połączenia.
 */

export interface TlsInfo {
  authorized: boolean;
  authorizationError: string | null;
  protocol: string | null;
  validFrom: string | null;
  validTo: string | null;
  subjectCN: string | null;
  issuerCN: string | null;
  altNames: string[];
}

export interface TransportRequest {
  protocol: "http:" | "https:";
  /** Nazwa hosta — do nagłówka Host i SNI. */
  hostname: string;
  /** Zweryfikowany publiczny adres IP, do którego następuje połączenie (pinowanie). */
  pinnedIp: string;
  family: 4 | 6;
  port: number;
  method: string;
  /** pathname + search. */
  path: string;
  headers: Record<string, string>;
  timeoutMs: number;
  maxBodyBytes: number;
}

export interface TransportResponse {
  status: number;
  /** Nagłówki znormalizowane do małych liter; wiele wartości złączone przecinkiem. */
  headers: Record<string, string>;
  /** Surowe nagłówki Set-Cookie (osobno, bo wielowartościowe). */
  setCookie: string[];
  /** Zdekodowany, przycięty tekst odpowiedzi (UTF-8). */
  body: string;
  /** Liczba zdekompresowanych bajtów, które odczytano. */
  bodyBytes: number;
  truncated: boolean;
  tls: TlsInfo | null;
}

export type Transport = (req: TransportRequest) => Promise<TransportResponse>;

/** Łączy nagłówki Node (string | string[]) do mapy małych liter; zwraca też Set-Cookie. */
export function normalizeHeaders(
  raw: Record<string, string | string[] | undefined>,
): { headers: Record<string, string>; setCookie: string[] } {
  const headers: Record<string, string> = {};
  let setCookie: string[] = [];
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) continue;
    const lower = key.toLowerCase();
    if (lower === "set-cookie") {
      setCookie = Array.isArray(value) ? value : [value];
      continue;
    }
    headers[lower] = Array.isArray(value) ? value.join(", ") : value;
  }
  return { headers, setCookie };
}
