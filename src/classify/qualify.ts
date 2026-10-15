import { classify, qualifiesForAutoChecks } from "./classify.js";
import { normalizeAppUrl, UrlRejected } from "./dedup.js";
import type { Classification, ProjectInput, ProjectStatus } from "../types.js";

/**
 * Kwalifikacja projektu: czy ma działający adres aplikacji, czy to tylko
 * artykuł/repo/profil, oraz jaka jest klasyfikacja pochodzenia.
 */

export interface Qualification {
  status: ProjectStatus;
  rejectReason: string | null;
  classification: Classification;
  normalized: string | null;
  host: string | null;
  dedupKey: string | null;
  sensitive: boolean;
}

// Hosty, które są źródłem informacji (repo/artykuł/profil), a NIE działającą aplikacją.
const NON_APP_HOSTS = new Set([
  "github.com",
  "www.github.com",
  "gitlab.com",
  "bitbucket.org",
  "news.ycombinator.com",
  "medium.com",
  "dev.to",
  "reddit.com",
  "www.reddit.com",
  "twitter.com",
  "x.com",
  "youtube.com",
  "www.youtube.com",
  "youtu.be",
  "linkedin.com",
  "www.linkedin.com",
  "npmjs.com",
  "www.npmjs.com",
  "producthunt.com",
  "www.producthunt.com",
]);

export function isNonAppHost(host: string | null): boolean {
  if (!host) return false;
  if (NON_APP_HOSTS.has(host)) return true;
  // Dokumentacja.
  if (/^docs\./.test(host)) return true;
  return false;
}

export function qualify(input: ProjectInput): Qualification {
  const classification = classify(input.rawText, { weakSource: input.weakSource });

  if (!input.appUrl) {
    return {
      status: "rejected",
      rejectReason: "brak adresu działającej aplikacji (sam artykuł/zgłoszenie)",
      classification,
      normalized: null,
      host: null,
      dedupKey: null,
      sensitive: false,
    };
  }

  let norm;
  try {
    norm = normalizeAppUrl(input.appUrl);
  } catch (err) {
    return {
      status: "rejected",
      rejectReason: err instanceof UrlRejected ? err.message : "nieprawidłowy adres aplikacji",
      classification,
      normalized: null,
      host: null,
      dedupKey: null,
      sensitive: false,
    };
  }

  if (isNonAppHost(norm.host)) {
    return {
      status: "rejected",
      rejectReason: `adres to repozytorium/artykuł/profil (${norm.host}), nie działająca aplikacja`,
      classification,
      normalized: norm.normalized,
      host: norm.host,
      dedupKey: norm.dedupKey,
      sensitive: norm.sensitive,
    };
  }

  // Adres z danymi wrażliwymi → ręczna ocena, nie automat.
  if (norm.sensitive) {
    return {
      status: "needs_review",
      rejectReason: `adres zawiera dane wrażliwe (${norm.sensitiveReason}) — ręczna ocena`,
      classification,
      normalized: norm.normalized,
      host: norm.host,
      dedupKey: norm.dedupKey,
      sensitive: true,
    };
  }

  // Domyślnie do kolejki kontroli trafiają tylko projekty z wyraźną deklaracją autora.
  const status: ProjectStatus = qualifiesForAutoChecks(classification) ? "queued" : "needs_review";
  return {
    status,
    rejectReason: status === "needs_review" ? "brak wyraźnej deklaracji autora — do przeglądu" : null,
    classification,
    normalized: norm.normalized,
    host: norm.host,
    dedupKey: norm.dedupKey,
    sensitive: false,
  };
}
