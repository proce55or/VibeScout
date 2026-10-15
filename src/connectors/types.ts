import type { Transport } from "../net/transport.js";
import type { DnsLookup } from "../net/ssrf.js";
import type { RateLimiter } from "../net/ratelimit.js";
import type { ProjectInput } from "../types.js";

export interface ConnectorContext {
  transport: Transport;
  lookup?: DnsLookup;
  /** Rate limiter wspólny dla hostów źródeł. */
  rateLimiter: RateLimiter;
  now: () => number;
  /** Budżet odczytów źródeł (łączna liczba elementów do pobrania). */
  budget: { reads: number; max: number };
  demo: boolean;
  /** Opcjonalny token GitHub (wyższe limity API). Pusty = działa bez tokenu. */
  githubToken?: string;
}

export interface CollectParams {
  lookbackDays: number;
  /** Maksymalna liczba elementów (kandydatów) do zwrócenia z tego konektora. */
  limit: number;
  /** Konfiguracja kanałów (dla RSS). */
  feeds?: FeedConfig[];
}

export interface FeedConfig {
  name: string;
  url: string;
  enabled: boolean;
  limit: number;
}

export interface CollectResult {
  items: ProjectInput[];
  reads: number;
  limited: boolean;
  error: string | null;
  note: string;
}

export interface Connector {
  id: string;
  name: string;
  coverage: string;
  implemented: boolean;
  collect(params: CollectParams, ctx: ConnectorContext): Promise<CollectResult>;
}

export function emptyResult(note: string): CollectResult {
  return { items: [], reads: 0, limited: false, error: null, note };
}
