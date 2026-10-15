import type { Transport, TransportRequest, TransportResponse, TlsInfo } from "../src/net/transport.js";
import type { DnsLookup } from "../src/net/ssrf.js";

/** Domyślny DNS testowy: każda nazwa → stały adres publiczny. */
export const publicLookup: DnsLookup = async () => [{ address: "93.184.216.34", family: 4 }];

/** DNS testowy z mapą nazw na adresy (symulacja rebinding/zmiany DNS). */
export function mapLookup(map: Record<string, Array<{ address: string; family: number }>>): DnsLookup {
  return async (host: string) => map[host] ?? [{ address: "93.184.216.34", family: 4 }];
}

const okTls: TlsInfo = {
  authorized: true,
  authorizationError: null,
  protocol: "TLSv1.3",
  validFrom: "Jan 1 2026",
  validTo: "Jan 1 2027",
  subjectCN: "example",
  issuerCN: "Test CA",
  altNames: [],
};

export interface FakeResponse {
  status: number;
  headers?: Record<string, string>;
  setCookie?: string[];
  body?: string;
  tls?: TlsInfo | null;
  truncated?: boolean;
  bodyBytes?: number;
}

export function resp(r: FakeResponse): TransportResponse {
  const body = r.body ?? "";
  return {
    status: r.status,
    headers: r.headers ?? {},
    setCookie: r.setCookie ?? [],
    body,
    bodyBytes: r.bodyBytes ?? Buffer.byteLength(body),
    truncated: r.truncated ?? false,
    tls: r.tls === undefined ? okTls : r.tls,
  };
}

/** Transport testowy sterowany funkcją (req) => odpowiedź. */
export function fakeTransport(handler: (req: TransportRequest) => TransportResponse): Transport {
  return async (req) => handler(req);
}

/** Transport mapujący `${protocol}//${hostname}${path}` → odpowiedź. */
export function routeTransport(routes: Record<string, FakeResponse>, fallback?: FakeResponse): Transport {
  return async (req) => {
    const key = `${req.protocol}//${req.hostname}${req.path}`;
    const hit = routes[key] ?? routes[`${req.hostname}${req.path}`];
    if (hit) return resp(hit);
    if (fallback) return resp(fallback);
    return resp({ status: 404, body: "not found" });
  };
}
