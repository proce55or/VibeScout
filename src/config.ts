import os from "node:os";
import path from "node:path";
import fs from "node:fs";

/**
 * Konfiguracja VibeScout. Wartości z zmiennych środowiskowych (.env ładowany
 * w src/server/index.ts), z bezpiecznymi wartościami domyślnymi. Limity można
 * nadpisać per-przebieg w panelu — tu są wartości startowe.
 */

function envInt(name: string, def: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return def;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : def;
}

function envBool(name: string, def: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return def;
  return raw === "1" || raw.toLowerCase() === "true" || raw.toLowerCase() === "yes";
}

function envStr(name: string, def: string): string {
  const raw = process.env[name];
  return raw === undefined || raw.trim() === "" ? def : raw;
}

/** Domyślny katalog danych aplikacji — POZA katalogiem repozytorium. */
export function defaultDataDir(): string {
  const platform = process.platform;
  const home = os.homedir();
  if (platform === "darwin") {
    return path.join(home, "Library", "Application Support", "VibeScout");
  }
  if (platform === "win32") {
    const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    return path.join(appData, "VibeScout");
  }
  const xdg = process.env.XDG_DATA_HOME || path.join(home, ".local", "share");
  return path.join(xdg, "VibeScout");
}

export interface HardLimits {
  /** Maks. żądań HTTP na jedną aplikację (łącznie z przekierowaniami i robots.txt). */
  maxHttpRequestsPerApp: number;
  maxRedirects: number;
  /** Limit czasu na pojedyncze żądanie (ms). */
  perRequestTimeoutMs: number;
  /** Limit łącznego czasu kontroli jednej aplikacji (ms). */
  perAppTimeoutMs: number;
  /** Maks. rozpakowany rozmiar treści odpowiedzi (bajty). */
  maxBodyBytes: number;
  /** Maks. równoległych żądań do kontrolowanych aplikacji. */
  maxConcurrentApps: number;
  /** Minimalny odstęp między żądaniami do tego samego hosta (ms). */
  minHostIntervalMs: number;
}

export const HARD_LIMITS: HardLimits = {
  maxHttpRequestsPerApp: 10,
  maxRedirects: 5,
  perRequestTimeoutMs: 10_000,
  perAppTimeoutMs: 60_000,
  maxBodyBytes: 1_048_576, // 1 MB
  maxConcurrentApps: 2,
  minHostIntervalMs: 5_000,
};

export interface Config {
  host: string;
  port: number;
  demo: boolean;
  dataDir: string;
  dbPath: string;
  retentionDays: number;
  defaults: {
    maxAppsPerDay: number;
    lookbackDays: number;
    sourceReadBudget: number;
  };
  limits: HardLimits;
  llm: {
    enabled: boolean;
    endpoint: string;
    apiKey: string;
    budgetCents: number;
  };
  /** Opcjonalny token GitHub — tylko dla wyższych limitów API. Konektor działa bez niego. */
  githubToken: string;
  /** Nagłówek User-Agent używany przy pobieraniu stron. */
  userAgent: string;
}

let cached: Config | null = null;

export function loadConfig(): Config {
  if (cached) return cached;
  const dataDir = envStr("VIBESCOUT_DATA_DIR", defaultDataDir());
  const demo = envBool("VIBESCOUT_DEMO", false);
  // W trybie demo (offline, dane syntetyczne) skracamy odstęp per host, by podgląd
  // na żywo był responsywny. W trybie normalnym obowiązują pełne, „grzeczne" limity.
  const limits: HardLimits = demo ? { ...HARD_LIMITS, minHostIntervalMs: 250 } : HARD_LIMITS;
  const cfg: Config = {
    host: envStr("VIBESCOUT_HOST", "127.0.0.1"),
    port: envInt("VIBESCOUT_PORT", 4317),
    demo,
    dataDir,
    dbPath: path.join(dataDir, "vibescout.sqlite"),
    retentionDays: envInt("VIBESCOUT_RETENTION_DAYS", 30),
    defaults: {
      maxAppsPerDay: envInt("VIBESCOUT_MAX_APPS_PER_DAY", 20),
      lookbackDays: envInt("VIBESCOUT_LOOKBACK_DAYS", 30),
      sourceReadBudget: envInt("VIBESCOUT_SOURCE_READ_BUDGET", 300),
    },
    limits,
    llm: {
      enabled: envBool("VIBESCOUT_LLM_ENABLED", false),
      endpoint: envStr("VIBESCOUT_LLM_ENDPOINT", ""),
      apiKey: envStr("VIBESCOUT_LLM_API_KEY", ""),
      budgetCents: envInt("VIBESCOUT_LLM_BUDGET_CENTS", 0),
    },
    githubToken: envStr("VIBESCOUT_GITHUB_TOKEN", ""),
    userAgent:
      "VibeScout/1.0 (+local research tool; respects robots.txt; contact: local user)",
  };
  cached = cfg;
  return cfg;
}

/** Tworzy katalog danych, jeśli nie istnieje. Zwraca ścieżkę. */
export function ensureDataDir(cfg: Config): string {
  fs.mkdirSync(cfg.dataDir, { recursive: true });
  return cfg.dataDir;
}

/** Tylko do testów — czyści cache konfiguracji. */
export function resetConfigCache(): void {
  cached = null;
}
