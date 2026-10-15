import type { CheckRunResult, Project, Observation, OriginClass, Confidence, CheckExecution, Severity } from "../types.js";

/** Etykiety po polsku. */
export const ORIGIN_LABEL: Record<OriginClass, string> = {
  declared_ai: "autor deklaruje stworzenie przy pomocy AI",
  indirect: "pośrednia przesłanka (wymaga sprawdzenia)",
  uses_ai: "aplikacja oferuje funkcję AI (nie przesądza o stworzeniu)",
  unknown: "brak informacji",
  conflicting: "sprzeczne informacje",
};

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  low: "niska",
  medium: "średnia",
  high: "wysoka",
};

export const EXECUTION_LABEL: Record<CheckExecution, string> = {
  done: "wykonano",
  skipped: "pominięto",
  blocked: "zablokowano",
  error: "błąd",
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  info: "informacja",
  recommendation: "zalecane ulepszenie",
  needs_check: "wymaga sprawdzenia",
};

export const SUMMARY_LABEL: Record<CheckRunResult["summary"], string> = {
  needs_review: "wymaga przeglądu",
  no_issues_observed: "nie zaobserwowano wskazanych problemów",
  incomplete: "wynik niepełny",
};

export interface ReportModel {
  project: Project;
  check: CheckRunResult | null;
  generatedAt: string;
}

export function buildReport(project: Project, check: CheckRunResult | null): ReportModel {
  return { project, check, generatedAt: new Date().toISOString() };
}

const CHECK_SCOPE: Array<{ id: string; title: string }> = [
  { id: "A", title: "HTTPS i certyfikat" },
  { id: "B", title: "Przekierowanie HTTP→HTTPS" },
  { id: "C", title: "Nagłówki bezpieczeństwa" },
  { id: "D", title: "Atrybuty cookies" },
  { id: "E", title: "Odwołania http:// w HTML (mixed content)" },
  { id: "F", title: "Ujawnienia diagnostyczne" },
];

function performedScope(check: CheckRunResult | null): { done: string[]; skipped: string[] } {
  const done: string[] = [];
  const skipped: string[] = [];
  for (const c of CHECK_SCOPE) {
    const obs = check?.observations.filter((o) => o.check === c.id) ?? [];
    const anyDone = obs.some((o) => o.execution === "done");
    if (anyDone) done.push(`${c.id}. ${c.title}`);
    else skipped.push(`${c.id}. ${c.title}`);
  }
  return { done, skipped };
}

/** Markdown raportu pojedynczej aplikacji. */
export function toMarkdown(model: ReportModel): string {
  const p = model.project;
  const c = model.check;
  const lines: string[] = [];
  lines.push(`# Raport VibeScout: ${p.name}`);
  lines.push("");
  lines.push(`- **Adres aplikacji:** ${p.appUrl ?? "—"}`);
  lines.push(`- **Źródło odkrycia:** ${p.source}${p.announcementUrl ? ` (${p.announcementUrl})` : ""}`);
  lines.push(`- **Data publikacji ogłoszenia:** ${p.publishedAt ?? "—"}`);
  lines.push(`- **Czas kontroli:** ${c ? `${c.startedAt} → ${c.finishedAt}` : "nie wykonano"}`);
  if (c?.resolvedIp) lines.push(`- **Adres IP (zweryfikowany):** ${c.resolvedIp}`);
  lines.push("");
  lines.push(`## Klasyfikacja pochodzenia`);
  lines.push(`- **Ocena:** ${ORIGIN_LABEL[p.classification.origin]}`);
  lines.push(`- **Zadeklarowane narzędzie:** ${p.classification.tool ?? "—"}`);
  lines.push(`- **Poziom pewności:** ${CONFIDENCE_LABEL[p.classification.confidence]}`);
  lines.push(`- **Język deklaracji:** ${p.classification.language}`);
  if (p.classification.evidenceSnippet) lines.push(`- **Fragment uzasadniający (zredagowany):** „${p.classification.evidenceSnippet}"`);
  lines.push("");

  const scope = performedScope(c);
  lines.push(`## Zakres kontroli`);
  lines.push(`- **Wykonano:** ${scope.done.length ? scope.done.join("; ") : "—"}`);
  lines.push(`- **Pominięto/niepełne:** ${scope.skipped.length ? scope.skipped.join("; ") : "—"}`);
  lines.push("");
  lines.push(
    `> Zakres poza v1 (NIE wykonywano): SQL injection, XSS z payloadami, zgadywanie haseł, enumeracja ścieżek, poszukiwanie .env/.git, eksploatacja CVE, testy obciążeniowe. To nie jest pentest ani gwarancja bezpieczeństwa.`,
  );
  lines.push("");

  if (c) {
    lines.push(`## Obserwacje`);
    for (const o of c.observations) {
      lines.push(`### [${o.check}] ${o.title}`);
      lines.push(`- **Stan wykonania:** ${EXECUTION_LABEL[o.execution]}`);
      lines.push(`- **Waga:** ${SEVERITY_LABEL[o.severity]}`);
      lines.push(`- **Zaobserwowano:** ${o.observed}`);
      lines.push(`- **Dowód (zredagowany):** ${o.evidence}`);
      lines.push(`- **Można wnioskować:** ${o.inference}`);
      lines.push(`- **Nie potwierdzono:** ${o.notConfirmed}`);
      lines.push(`- **Sugerowany krok:** ${o.nextStep}`);
      lines.push("");
    }
    lines.push(`## Podsumowanie`);
    lines.push(`**${SUMMARY_LABEL[c.summary]}.**`);
    lines.push("");
    lines.push(
      `Budżet: ${c.budget.httpRequests} żądań, ${c.budget.redirects} przekierowań, ${c.budget.bytes} B, ${c.budget.elapsedMs} ms${c.budget.truncated ? " (treść przycięta do limitu)" : ""}.`,
    );
  } else {
    lines.push(`## Podsumowanie`);
    lines.push(`Kontroli nie wykonano.`);
  }
  lines.push("");
  lines.push(`_Wygenerowano: ${model.generatedAt}. Raport prywatny, do użytku autora._`);
  return lines.join("\n");
}

/** Model JSON (czysta struktura do eksportu/maszynowego użycia). */
export function toJsonObject(model: ReportModel): unknown {
  const p = model.project;
  const c = model.check;
  return {
    project: {
      id: p.id,
      name: p.name,
      appUrl: p.appUrl,
      announcementUrl: p.announcementUrl,
      source: p.source,
      publishedAt: p.publishedAt,
      discoveredAt: p.discoveredAt,
      classification: p.classification,
      mergedFrom: p.mergedFrom,
    },
    check: c
      ? {
          startedAt: c.startedAt,
          finishedAt: c.finishedAt,
          entryUrl: c.entryUrl,
          resolvedIp: c.resolvedIp,
          summary: c.summary,
          budget: c.budget,
          observations: c.observations,
          error: c.error,
        }
      : null,
    scope: performedScope(c),
    outOfScope: [
      "SQL injection",
      "XSS z payloadami",
      "zgadywanie haseł",
      "enumeracja ścieżek",
      "poszukiwanie .env/.git",
      "eksploatacja CVE",
      "testy obciążeniowe",
    ],
    generatedAt: model.generatedAt,
    disclaimer: "To nie jest pentest ani gwarancja bezpieczeństwa.",
  };
}

export interface RunSummaryModel {
  runId: string;
  startedAt: string;
  finishedAt: string | null;
  counters: Record<string, number>;
  dateRange: { from: string | null; to: string | null };
  note: string | null;
}

export function runSummaryMarkdown(m: RunSummaryModel): string {
  const c = m.counters;
  return [
    `# Podsumowanie przebiegu VibeScout`,
    "",
    `- **Przebieg:** ${m.runId}`,
    `- **Start:** ${m.startedAt}`,
    `- **Koniec:** ${m.finishedAt ?? "—"}`,
    `- **Zakres dat ogłoszeń:** ${m.dateRange.from ?? "—"} → ${m.dateRange.to ?? "—"}`,
    "",
    `## Liczniki`,
    `- Znalezione: ${c.found ?? 0}`,
    `- Zakwalifikowane do kontroli: ${c.queued ?? 0}`,
    `- Sprawdzone: ${c.checked ?? 0}`,
    `- Do przeglądu: ${c.needsReview ?? 0}`,
    `- Odrzucone: ${c.rejected ?? 0}`,
    `- Błędy: ${c.errors ?? 0}`,
    `- Odczyty źródeł: ${c.sourceReads ?? 0}`,
    m.note ? `\n> ${m.note}` : "",
  ].join("\n");
}
