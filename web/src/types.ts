// Minimalne typy po stronie panelu (odbicie modelu serwera).

export interface Classification {
  origin: "declared_ai" | "indirect" | "uses_ai" | "unknown" | "conflicting";
  tool: string | null;
  confidence: "low" | "medium" | "high";
  evidenceSnippet: string;
  matchedTerms: string[];
  language: string;
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
  status: string;
  rejectReason: string | null;
  classification: Classification;
  lastSummary?: string | null;
  mergedFrom: Array<{ source: string; announcementUrl: string | null; externalId: string | null }>;
}

export interface Observation {
  check: string;
  title: string;
  execution: string;
  severity: "info" | "recommendation" | "needs_check";
  observed: string;
  evidence: string;
  inference: string;
  notConfirmed: string;
  nextStep: string;
}

export interface CheckRun {
  startedAt: string;
  finishedAt: string;
  entryUrl: string;
  resolvedIp: string | null;
  summary: "needs_review" | "no_issues_observed" | "incomplete";
  budget: { httpRequests: number; redirects: number; bytes: number; elapsedMs: number; truncated: boolean };
  observations: Observation[];
  error: string | null;
}

export interface RunState {
  id: string;
  status: string;
  params: { sources: string[]; lookbackDays: number; maxAppsPerDay: number; sourceReadBudget: number };
  startedAt: string;
  finishedAt: string | null;
  counters: Record<string, number>;
  dateRange: { from: string | null; to: string | null };
  note: string | null;
}

export interface Connector {
  id: string;
  name: string;
  implemented: boolean;
  coverage: string;
}

export interface StatusResponse {
  run: RunState | null;
  lastRun: RunState | null;
  live: { paused: boolean; stopRequested: boolean };
  queued: number;
  unread: number;
  connectors: Connector[];
  limits: Record<string, number>;
  defaults: { maxAppsPerDay: number; lookbackDays: number; sourceReadBudget: number };
  retentionDays: number;
  demo: boolean;
  checkedLast24h: number;
}

export interface AppNotification {
  id: string;
  createdAt: string;
  level: "info" | "attention";
  title: string;
  body: string;
  read: boolean;
}
