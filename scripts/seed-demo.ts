/**
 * Generuje SYNTETYCZNE dane demonstracyjne i przykładowy raport (oznaczone jako DEMO).
 * Uruchom: `npm run seed:demo`. Pliki trafiają do katalogu demo-data/.
 * Adresy .example są wyłącznie danymi demonstracyjnymi.
 */
import fs from "node:fs";
import path from "node:path";
import { classify } from "../src/classify/classify.js";
import { buildReport, toMarkdown } from "../src/report/report.js";
import { toSafeHtml } from "../src/report/html.js";
import type { Project, CheckRunResult } from "../src/types.js";

const outDir = path.resolve(process.cwd(), "demo-data");
fs.mkdirSync(outDir, { recursive: true });

const classification = classify("I built this habit tracker with Claude Code over a weekend. Feedback welcome!");

const project: Project = {
  id: "demo-habitly",
  name: "Habitly (DEMO)",
  appUrl: "https://habits.example",
  announcementUrl: "https://news.ycombinator.com/item?id=0",
  source: "hackernews",
  externalId: "0",
  publishedAt: "2026-10-10T08:00:00.000Z",
  discoveredAt: "2026-10-15T09:00:00.000Z",
  host: "habits.example",
  dedupKey: "habits.example/",
  status: "checked",
  rejectReason: null,
  classification,
  mergedFrom: [],
};

const check: CheckRunResult = {
  projectId: "demo-habitly",
  startedAt: "2026-10-15T09:00:05.000Z",
  finishedAt: "2026-10-15T09:00:09.000Z",
  entryUrl: "https://habits.example/",
  resolvedIp: "203.0.113.10",
  summary: "no_issues_observed",
  budget: { httpRequests: 3, redirects: 1, bytes: 4096, elapsedMs: 3800, truncated: false },
  error: null,
  observations: [
    {
      check: "A",
      title: "HTTPS i certyfikat",
      execution: "done",
      severity: "info",
      observed: "HTTPS dostępne, certyfikat zweryfikowany dla hosta.",
      evidence: "CN=*.example; ważny do=Jan 1 2027; protokół=TLSv1.3",
      inference: "Połączenie szyfrowane, certyfikat poprawny.",
      notConfirmed: "Nie oceniano konfiguracji TLS (wersje, szyfry).",
      nextStep: "—",
    },
    {
      check: "C",
      title: "Nagłówek: Content-Security-Policy",
      execution: "done",
      severity: "info",
      observed: "obecna polityka wymuszająca CSP",
      evidence: "csp",
      inference: "Zdefiniowano politykę CSP.",
      notConfirmed: "Brak CSP nie jest potwierdzonym XSS.",
      nextStep: "—",
    },
    {
      check: "D",
      title: "Cookie: sid",
      execution: "done",
      severity: "info",
      observed: "Secure=tak, HttpOnly=tak, SameSite=Lax",
      evidence: "atrybuty cookie (bez wartości)",
      inference: "Cookie ma atrybut Secure.",
      notConfirmed: "Nie zapisujemy wartości cookies.",
      nextStep: "—",
    },
  ],
};

const model = buildReport(project, check);
const banner = "<!-- DANE DEMONSTRACYJNE — syntetyczne, nie dotyczą prawdziwej strony -->\n";

fs.writeFileSync(path.join(outDir, "sample-report.md"), `> DANE DEMONSTRACYJNE (syntetyczne)\n\n` + toMarkdown(model), "utf-8");
fs.writeFileSync(path.join(outDir, "sample-report.html"), banner + toSafeHtml(model), "utf-8");

fs.writeFileSync(
  path.join(outDir, "sample-import.csv"),
  [
    "appUrl,name,announcementUrl,rawText",
    'https://habits.example,Habitly,https://news.ycombinator.com/item?id=0,"I built this with Claude Code"',
    'https://notes.example,Notesy,https://news.ycombinator.com/item?id=4,"Zbudowane przy pomocy Cursora"',
    'https://chat.example,ChatBuddy,https://news.ycombinator.com/item?id=2,"Chat with Gemini"',
  ].join("\n"),
  "utf-8",
);

fs.writeFileSync(
  path.join(outDir, "sample-import.json"),
  JSON.stringify(
    [
      { appUrl: "https://habits.example", name: "Habitly", rawText: "I built this with Claude Code" },
      { appUrl: "https://notes.example", name: "Notesy", rawText: "Zbudowane przy pomocy Cursora" },
    ],
    null,
    2,
  ),
  "utf-8",
);

// eslint-disable-next-line no-console
console.log(`Zapisano dane demonstracyjne w: ${outDir}`);
