// Centralne typy domenowe VibeScout. Komentarze po polsku — projekt do użytku autora.

/** Jak zakwalifikowano pochodzenie projektu. */
export type OriginClass =
  | "declared_ai" // autor wprost deklaruje stworzenie aplikacji przy pomocy AI
  | "indirect" // słabsza, pośrednia przesłanka — wymaga sprawdzenia
  | "uses_ai" // aplikacja tylko oferuje funkcję AI (np. czat z modelem)
  | "unknown" // brak informacji
  | "conflicting"; // sprzeczne informacje

/** Poziom pewności klasyfikacji (jakościowy, bez fałszywej precyzji procentowej). */
export type Confidence = "low" | "medium" | "high";

export interface Classification {
  origin: OriginClass;
  /** Zadeklarowane narzędzie, np. "Claude Code", "Cursor", "Lovable". */
  tool: string | null;
  confidence: Confidence;
  /** Krótki fragment uzasadniający klasyfikację (zredagowany, cudza treść). */
  evidenceSnippet: string;
  /** Dopasowane określenia/frazy, które doprowadziły do klasyfikacji. */
  matchedTerms: string[];
  /** Język, w którym wykryto deklarację. */
  language: "pl" | "en" | "unknown";
}

export type ProjectStatus =
  | "found" // znaleziony, przed kwalifikacją decyzji o kolejce
  | "rejected" // odrzucony (np. brak działającego adresu, sam artykuł/repo)
  | "queued" // zakwalifikowany, czeka na kontrole
  | "checking" // w trakcie kontroli
  | "checked" // kontrole zakończone
  | "needs_review" // do ręcznego przeglądu
  | "error"; // błąd podczas kontroli

export interface ProjectInput {
  name: string;
  appUrl: string | null;
  announcementUrl: string | null;
  source: string;
  publishedAt: string | null; // ISO 8601
  rawText: string; // treść ogłoszenia/deklaracji (niezaufana)
  externalId?: string | null; // identyfikator w źródle (np. HN item id)
}

export interface Project {
  id: string;
  name: string;
  appUrl: string | null;
  announcementUrl: string | null;
  source: string;
  externalId: string | null;
  publishedAt: string | null;
  discoveredAt: string;
  host: string | null;
  dedupKey: string | null;
  status: ProjectStatus;
  rejectReason: string | null;
  classification: Classification;
  /** Dodatkowe ogłoszenia tej samej aplikacji (pochodzenie danych zachowane). */
  mergedFrom: Array<{ source: string; announcementUrl: string | null; externalId: string | null }>;
}

/** Stan wykonania pojedynczej kontroli — oddzielony od wagi obserwacji. */
export type CheckExecution = "done" | "skipped" | "blocked" | "error";

/** Waga obserwacji — nie jest to ocena krytyczności włamania. */
export type Severity = "info" | "recommendation" | "needs_check";

export interface Observation {
  /** Identyfikator kontroli: "A".."F". */
  check: string;
  title: string;
  execution: CheckExecution;
  severity: Severity;
  /** Co zaobserwowano. */
  observed: string;
  /** Zredagowany dowód (bez sekretów, bez wartości cookies). */
  evidence: string;
  /** Co można z tego wnioskować. */
  inference: string;
  /** Czego NIE potwierdzono. */
  notConfirmed: string;
  /** Sugerowany kolejny krok. */
  nextStep: string;
}

export interface CheckRunResult {
  projectId: string;
  startedAt: string;
  finishedAt: string;
  /** Faktyczny adres wejścia, który sprawdzano. */
  entryUrl: string;
  /** Zweryfikowany publiczny adres IP, z którym się połączono (jeśli dotyczy). */
  resolvedIp: string | null;
  observations: Observation[];
  /** Podsumowanie: wymaga przeglądu / nie zaobserwowano problemów / wynik niepełny. */
  summary: "needs_review" | "no_issues_observed" | "incomplete";
  /** Liczniki żądań/limity dla audytu. */
  budget: {
    httpRequests: number;
    redirects: number;
    bytes: number;
    elapsedMs: number;
    truncated: boolean;
  };
  error: string | null;
}

export type RunStatus = "idle" | "running" | "paused" | "stopping" | "stopped" | "done" | "crashed";

export interface RunParams {
  sources: string[];
  lookbackDays: number;
  maxAppsPerDay: number;
  sourceReadBudget: number;
}

export interface RunState {
  id: string;
  status: RunStatus;
  params: RunParams;
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
  counters: RunCounters;
  /** Zakres dat faktycznie objęty (do pokazania użytkownikowi). */
  dateRange: { from: string | null; to: string | null };
  note: string | null;
}

export interface RunCounters {
  found: number;
  rejected: number;
  queued: number;
  checked: number;
  needsReview: number;
  errors: number;
  /** Ile aplikacji dziś objęto kontrolami (limit dobowy). */
  checkedToday: number;
  /** Ile elementów odczytano ze źródeł (budżet). */
  sourceReads: number;
}

export interface ConnectorStatus {
  id: string;
  name: string;
  /** Czy konektor jest zaimplementowany i gotowy. */
  implemented: boolean;
  enabled: boolean;
  /** Krótki opis zasięgu/ograniczeń — pokazywany w panelu i README. */
  coverage: string;
  lastRunAt: string | null;
  lastError: string | null;
  /** Czy przy ostatnim odczycie wyczerpano limit. */
  lastLimited: boolean;
}

export interface AppNotification {
  id: string;
  createdAt: string;
  level: "info" | "attention";
  title: string;
  body: string;
  read: boolean;
  /** Powiązany projekt/przebieg, jeśli dotyczy. */
  projectId: string | null;
  runId: string | null;
}
