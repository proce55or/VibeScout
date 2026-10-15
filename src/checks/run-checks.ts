import { HARD_LIMITS } from "../config.js";
import { FetchBudget, safeFetch, type SafeFetchDeps, type FetchResult } from "../net/fetch.js";
import { checkRobots } from "../net/robots.js";
import { analyzeHeaders, serverTech } from "./headers.js";
import { analyzeCookies } from "./cookies.js";
import { findMixedContent, findDisclosures } from "./html.js";
import { redactUrl } from "../util/redact.js";
import type { CheckRunResult, Observation, Severity } from "../types.js";

/**
 * Wykonuje ograniczone kontrole WWW A–F dla pojedynczej aplikacji.
 * Tylko publiczne odczyty, bez logowania, bez uruchamiania JavaScriptu.
 * NIE jest to pentest ani gwarancja bezpieczeństwa.
 */

function obs(o: Observation): Observation {
  return o;
}

function withProtocol(appUrl: string, protocol: "http:" | "https:"): string | null {
  try {
    const u = new URL(appUrl);
    u.protocol = protocol;
    return u.toString();
  } catch {
    return null;
  }
}

function isHtml(res: FetchResult): boolean {
  return (res.headers["content-type"] || "").toLowerCase().includes("text/html");
}

export async function runWebChecks(
  appUrl: string,
  deps: SafeFetchDeps,
  opts?: { now?: () => number },
): Promise<CheckRunResult> {
  const now = opts?.now ?? Date.now;
  const startedAt = new Date(now()).toISOString();
  const budget = new FetchBudget(HARD_LIMITS, now);
  const observations: Observation[] = [];

  // Normalizacja adresów.
  let parsed: URL;
  try {
    parsed = new URL(appUrl);
  } catch {
    return {
      projectId: "",
      startedAt,
      finishedAt: new Date(now()).toISOString(),
      entryUrl: appUrl,
      resolvedIp: null,
      observations: [
        obs({
          check: "A",
          title: "Adres wejścia",
          execution: "error",
          severity: "needs_check",
          observed: "Nieprawidłowy adres URL aplikacji.",
          evidence: redactUrl(appUrl),
          inference: "Nie można wykonać kontroli bez poprawnego adresu.",
          notConfirmed: "Nie sprawdzono niczego.",
          nextStep: "Popraw adres aplikacji.",
        }),
      ],
      summary: "incomplete",
      budget: { httpRequests: 0, redirects: 0, bytes: 0, elapsedMs: 0, truncated: false },
      error: "invalid_url",
    };
  }

  const httpsUrl = withProtocol(appUrl, "https:")!;
  const httpUrl = withProtocol(appUrl, "http:")!;
  const entryUrl = httpsUrl;

  // Robots.txt dla zgłoszonego adresu.
  const robots = await checkRobots(httpsUrl, budget, deps);
  if (robots.fetched || !robots.allowed) {
    observations.push(
      obs({
        check: "pre",
        title: "robots.txt",
        execution: robots.allowed ? "done" : "skipped",
        severity: "info",
        observed: robots.note,
        evidence: `${new URL(httpsUrl).origin}/robots.txt`,
        inference: robots.allowed
          ? "Pobranie zgłoszonego adresu jest technicznie dozwolone przez robots.txt."
          : "robots.txt zabrania pobrania tej ścieżki — pomijamy pobranie strony.",
        notConfirmed: "robots.txt nie jest zgodą prawną na wykorzystanie treści.",
        nextStep: robots.allowed ? "—" : "Ewentualne pobranie wymaga innej podstawy niż robots.txt.",
      }),
    );
  }

  let mainRes: FetchResult | null = null;
  if (robots.allowed) {
    mainRes = await safeFetch(httpsUrl, { method: "GET" }, budget, deps);
  }

  // --- A. HTTPS i certyfikat ---
  if (!mainRes) {
    observations.push(
      obs({
        check: "A",
        title: "HTTPS i certyfikat",
        execution: "skipped",
        severity: "info",
        observed: "Pominięto pobranie strony (robots.txt).",
        evidence: redactUrl(httpsUrl),
        inference: "Brak danych o certyfikacie.",
        notConfirmed: "Nie sprawdzono dostępności HTTPS ani certyfikatu.",
        nextStep: "—",
      }),
    );
  } else if (mainRes.blocked) {
    observations.push(
      obs({
        check: "A",
        title: "HTTPS i certyfikat",
        execution: "blocked",
        severity: "info",
        observed: `Połączenie zablokowane przez politykę bezpieczeństwa: ${mainRes.blocked.reason}`,
        evidence: redactUrl(mainRes.blocked.url),
        inference: "Nie łączono się z adresem z powodu ochrony (np. adres prywatny).",
        notConfirmed: "To zabezpieczenie VibeScout, nie ocena aplikacji.",
        nextStep: "Jeśli adres jest publiczny, zweryfikuj ręcznie.",
      }),
    );
  } else if (mainRes.tls && mainRes.tls.authorized) {
    observations.push(
      obs({
        check: "A",
        title: "HTTPS i certyfikat",
        execution: "done",
        severity: "info",
        observed: `HTTPS dostępne, certyfikat zweryfikowany dla hosta.`,
        evidence: `CN=${mainRes.tls.subjectCN ?? "?"}; wystawca=${mainRes.tls.issuerCN ?? "?"}; ważny do=${mainRes.tls.validTo ?? "?"}; protokół=${mainRes.tls.protocol ?? "?"}`,
        inference: "Połączenie jest szyfrowane, a certyfikat przeszedł standardową weryfikację systemową.",
        notConfirmed: "Nie oceniano konfiguracji TLS (wersje, szyfry) ani odwołania certyfikatu.",
        nextStep: "—",
      }),
    );
  } else if (mainRes.tls && !mainRes.tls.authorized) {
    observations.push(
      obs({
        check: "A",
        title: "HTTPS i certyfikat",
        execution: "done",
        severity: "needs_check",
        observed: `Błąd weryfikacji certyfikatu: ${mainRes.tls.authorizationError ?? "nieznany"}`,
        evidence: redactUrl(httpsUrl),
        inference: "Przeglądarka najpewniej pokaże ostrzeżenie o niezaufanym połączeniu. Nie pobrano treści przez niezweryfikowane połączenie.",
        notConfirmed: "Nie potwierdzono rodzaju wady certyfikatu poza komunikatem błędu.",
        nextStep: "Sprawdź poprawność i ważność certyfikatu oraz zgodność nazwy hosta.",
      }),
    );
  } else {
    observations.push(
      obs({
        check: "A",
        title: "HTTPS i certyfikat",
        execution: mainRes.error ? "error" : "done",
        severity: "recommendation",
        observed: mainRes.error
          ? `HTTPS niedostępne lub błąd połączenia: ${mainRes.error}`
          : "Brak informacji TLS (odpowiedź bez HTTPS).",
        evidence: redactUrl(httpsUrl),
        inference: "Nie potwierdzono działającego HTTPS dla tego adresu.",
        notConfirmed: "Brak połączenia nie dowodzi podatności.",
        nextStep: "Zalecane udostępnienie i wymuszenie HTTPS.",
      }),
    );
  }

  // --- B. HTTP -> HTTPS ---
  if (budget.canRequest().ok) {
    const httpRes = await safeFetch(httpUrl, { method: "GET" }, budget, deps);
    if (httpRes.blocked) {
      observations.push(
        obs({
          check: "B",
          title: "Przekierowanie HTTP→HTTPS",
          execution: "blocked",
          severity: "info",
          observed: `Zablokowane przez politykę: ${httpRes.blocked.reason}`,
          evidence: redactUrl(httpRes.blocked.url),
          inference: "Nie łączono się (ochrona).",
          notConfirmed: "—",
          nextStep: "—",
        }),
      );
    } else if (httpRes.error) {
      observations.push(
        obs({
          check: "B",
          title: "Przekierowanie HTTP→HTTPS",
          execution: "error",
          severity: "info",
          observed: `Błąd/limit przy HTTP: ${httpRes.error}`,
          evidence: redactUrl(httpUrl),
          inference: "Wynik niepełny — przerwanie nie oznacza problemu.",
          notConfirmed: "Nie potwierdzono zachowania przekierowania.",
          nextStep: "Sprawdź ręcznie zachowanie na porcie 80.",
        }),
      );
    } else {
      const endedHttps = httpRes.finalUrl.startsWith("https://");
      const redirectedToHttps = httpRes.redirects.some((r) => r.to.startsWith("https://"));
      const ok = endedHttps && (redirectedToHttps || httpRes.redirects.length > 0);
      const chain = httpRes.redirects.map((r) => `${r.status} → ${redactUrl(r.to)}`).join("; ");
      observations.push(
        obs({
          check: "B",
          title: "Przekierowanie HTTP→HTTPS",
          execution: "done",
          severity: ok ? "info" : "recommendation",
          observed: ok
            ? "Adres HTTP przekierowuje na HTTPS."
            : "Brak przekierowania HTTP→HTTPS (lub pozostaje na HTTP).",
          evidence: chain || `status ${httpRes.status}, finalny ${redactUrl(httpRes.finalUrl)}`,
          inference: ok
            ? "Ruch z HTTP jest kierowany na wersję szyfrowaną."
            : "Użytkownik wchodzący po HTTP może pozostać na połączeniu nieszyfrowanym.",
          notConfirmed: "Nie oceniano HSTS preload ani zachowania wszystkich ścieżek.",
          nextStep: ok ? "—" : "Zalecane trwałe przekierowanie 301 na HTTPS.",
        }),
      );
    }
  }

  // Dalsze kontrole tylko gdy mamy użyteczną treść HTTPS.
  const haveBody = Boolean(mainRes && !mainRes.blocked && !mainRes.error && mainRes.status > 0 && (!mainRes.tls || mainRes.tls.authorized));

  // --- C. Nagłówki ---
  if (haveBody && mainRes) {
    const findings = analyzeHeaders(mainRes.headers, { https: true, isHtml: isHtml(mainRes) });
    for (const f of findings) {
      observations.push(
        obs({
          check: "C",
          title: `Nagłówek: ${f.title}`,
          execution: "done",
          severity: f.severity,
          observed: f.observed,
          evidence: f.id,
          inference: f.inference,
          notConfirmed: "Obecność nagłówka nie dowodzi poprawnej konfiguracji; brak nie dowodzi podatności.",
          nextStep: f.severity === "info" ? "—" : "Rozważ ustawienie/uzupełnienie nagłówka.",
        }),
      );
    }
    const tech = serverTech(mainRes.headers);
    if (tech) {
      observations.push(
        obs({
          check: "C",
          title: "Zaobserwowana technologia serwera",
          execution: "done",
          severity: "info",
          observed: tech,
          evidence: "server/x-powered-by",
          inference: "Ujawniona nazwa technologii to informacja, NIE potwierdzenie podatności.",
          notConfirmed: "Nie wiązano wersji z konkretnymi CVE.",
          nextStep: "Opcjonalnie: ograniczyć ujawnianie wersji.",
        }),
      );
    }
  } else {
    observations.push(skipped("C", "Nagłówki bezpieczeństwa", mainRes));
  }

  // --- D. Cookies ---
  if (haveBody && mainRes) {
    const cookies = analyzeCookies(mainRes.setCookie);
    if (cookies.length === 0) {
      observations.push(
        obs({
          check: "D",
          title: "Atrybuty cookies",
          execution: "done",
          severity: "info",
          observed: "Brak cookies w obserwowanej publicznej odpowiedzi.",
          evidence: "—",
          inference: "Nie ustawiono ciasteczek w tej odpowiedzi.",
          notConfirmed: "Inne ścieżki mogą ustawiać cookies.",
          nextStep: "—",
        }),
      );
    } else {
      for (const c of cookies) {
        const insecureOnHttps = !c.secure;
        observations.push(
          obs({
            check: "D",
            title: `Cookie: ${c.name}`,
            execution: "done",
            severity: insecureOnHttps ? "recommendation" : "info",
            observed: `Secure=${c.secure ? "tak" : "nie"}, HttpOnly=${c.httpOnly ? "tak" : "nie"}, SameSite=${c.sameSite ?? "brak"}`,
            evidence: "atrybuty cookie (bez wartości)",
            inference: insecureOnHttps
              ? "Cookie bez atrybutu Secure może zostać wysłane po HTTP."
              : "Cookie ma atrybut Secure.",
            notConfirmed:
              "Brak HttpOnly nie dowodzi błędu sesji — nie każde cookie jest sesyjne. Nie zapisujemy wartości cookies.",
            nextStep: insecureOnHttps ? "Rozważ ustawienie Secure (oraz HttpOnly/SameSite, jeśli to cookie sesyjne)." : "—",
          }),
        );
      }
    }
  } else {
    observations.push(skipped("D", "Atrybuty cookies", mainRes));
  }

  // --- E. Odwołania http:// w HTML (mixed content) ---
  if (haveBody && mainRes && isHtml(mainRes)) {
    const refs = findMixedContent(mainRes.body);
    const unique = [...new Map(refs.map((r) => [r.url, r])).values()].slice(0, 15);
    if (unique.length === 0) {
      observations.push(
        obs({
          check: "E",
          title: "Odwołania http:// do podzasobów",
          execution: "done",
          severity: "info",
          observed: "Nie zaobserwowano odwołań http:// do osadzanych podzasobów.",
          evidence: "—",
          inference: "W pobranym HTML nie znaleziono jawnych odwołań mixed content.",
          notConfirmed: "Nie uruchamiano JS; treść generowana dynamicznie nie była analizowana.",
          nextStep: "—",
        }),
      );
    } else {
      for (const r of unique) {
        observations.push(
          obs({
            check: "E",
            title: `Odwołanie http:// (${r.tag} ${r.attr})`,
            execution: "done",
            severity: "needs_check",
            observed: `${r.active ? "Aktywne" : "Pasywne"} odwołanie do zasobu po HTTP na stronie HTTPS.`,
            evidence: redactUrl(r.url),
            inference:
              "To zaobserwowane odwołanie wymagające weryfikacji — polityki przeglądarki mogą je zablokować lub awansować do HTTPS.",
            notConfirmed: "Bez uruchomienia przeglądarki nie potwierdzamy faktycznego efektu (mixed content).",
            nextStep: "Zweryfikuj w przeglądarce; docelowo ładuj podzasoby po HTTPS.",
          }),
        );
      }
    }
  } else if (haveBody && mainRes) {
    observations.push(
      obs({
        check: "E",
        title: "Odwołania http:// do podzasobów",
        execution: "skipped",
        severity: "info",
        observed: "Odpowiedź nie jest HTML — pominięto skan odwołań.",
        evidence: mainRes.headers["content-type"] ?? "—",
        inference: "Skan mixed content dotyczy dokumentów HTML.",
        notConfirmed: "—",
        nextStep: "—",
      }),
    );
  } else {
    observations.push(skipped("E", "Odwołania http:// do podzasobów", mainRes));
  }

  // --- F. Ujawnienia diagnostyczne ---
  if (haveBody && mainRes) {
    const disclosures = findDisclosures(mainRes.body);
    if (disclosures.length === 0) {
      observations.push(
        obs({
          check: "F",
          title: "Ujawnienia diagnostyczne",
          execution: "done",
          severity: "info",
          observed: "Nie zaobserwowano jawnych ujawnień diagnostycznych w pobranej treści.",
          evidence: "—",
          inference: "W pobranej odpowiedzi nie znaleziono typowych zrzutów stosu/komunikatów błędów.",
          notConfirmed: "Nie wywoływaliśmy błędów celowo; brak nie dowodzi braku problemu.",
          nextStep: "—",
        }),
      );
    } else {
      for (const d of disclosures) {
        observations.push(
          obs({
            check: "F",
            title: `Możliwe ujawnienie: ${d.kind}`,
            execution: "done",
            severity: "needs_check",
            observed: "W zwykłej odpowiedzi widoczny fragment diagnostyczny.",
            evidence: d.snippet,
            inference: "Może wskazywać na włączony tryb debugowania lub ujawnianie szczegółów technicznych.",
            notConfirmed: "Nie wywoływaliśmy błędów; nie zapisujemy znalezionych danych osobowych ani sekretów.",
            nextStep: "Wyłącz tryb debug w produkcji i ogranicz szczegóły komunikatów.",
          }),
        );
      }
    }
  } else {
    observations.push(skipped("F", "Ujawnienia diagnostyczne", mainRes));
  }

  // Podsumowanie.
  const anyNeedsCheck = observations.some((o) => o.severity === "needs_check" && o.execution === "done");
  const anyIncomplete =
    !robots.allowed ||
    budget.elapsedMs() >= HARD_LIMITS.perAppTimeoutMs ||
    observations.some((o) => o.execution === "blocked" || o.execution === "error") ||
    (mainRes?.truncated ?? false);
  const summary: CheckRunResult["summary"] = anyNeedsCheck
    ? "needs_review"
    : anyIncomplete
      ? "incomplete"
      : "no_issues_observed";

  return {
    projectId: "",
    startedAt,
    finishedAt: new Date(now()).toISOString(),
    entryUrl,
    resolvedIp: mainRes?.resolvedIp ?? null,
    observations,
    summary,
    budget: {
      httpRequests: budget.requests,
      redirects: budget.redirects,
      bytes: budget.bytes,
      elapsedMs: budget.elapsedMs(),
      truncated: mainRes?.truncated ?? false,
    },
    error: null,
  };
}

function skipped(check: string, title: string, mainRes: FetchResult | null): Observation {
  const reason = !mainRes
    ? "pominięto pobranie strony"
    : mainRes.blocked
      ? `zablokowano: ${mainRes.blocked.reason}`
      : mainRes.error
        ? `błąd: ${mainRes.error}`
        : mainRes.tls && !mainRes.tls.authorized
          ? "błąd certyfikatu — nie pobrano treści"
          : "brak treści do analizy";
  return {
    check,
    title,
    execution: "skipped",
    severity: "info" as Severity,
    observed: `Pominięto (${reason}).`,
    evidence: "—",
    inference: "Brak danych do oceny tej kontroli.",
    notConfirmed: "Nie sprawdzono — wynik niepełny.",
    nextStep: "Powtórz po usunięciu przyczyny (np. poprawny certyfikat/HTTPS).",
  };
}
