/**
 * Interpretacja nagłówków bezpieczeństwa. Uwzględniamy alternatywy i kontekst
 * (np. frame-ancestors w CSP zastępuje X-Frame-Options; CSP Report-Only NIE jest
 * polityką wymuszającą).
 */

export interface HeaderFinding {
  id: string;
  title: string;
  present: boolean;
  /** "info" = obecne/poprawne; "recommendation" = brak/nieoptymalne; "needs_check" = niejednoznaczne. */
  severity: "info" | "recommendation" | "needs_check";
  observed: string;
  inference: string;
}

export function analyzeHeaders(
  headers: Record<string, string>,
  ctx: { https: boolean; isHtml: boolean },
): HeaderFinding[] {
  const findings: HeaderFinding[] = [];
  const get = (name: string) => headers[name.toLowerCase()];

  // HSTS (tylko sensowne dla HTTPS).
  const hsts = get("strict-transport-security");
  findings.push({
    id: "hsts",
    title: "HSTS (Strict-Transport-Security)",
    present: Boolean(hsts),
    severity: hsts ? "info" : ctx.https ? "recommendation" : "info",
    observed: hsts ? `obecny: ${hsts}` : "brak nagłówka HSTS",
    inference: hsts
      ? "Przeglądarka będzie wymuszać HTTPS dla tego hosta przez zadeklarowany czas."
      : ctx.https
        ? "Brak HSTS — pierwsze połączenie może nie być wymuszone na HTTPS. Zalecane ustawienie."
        : "Host nie serwuje HTTPS w tym żądaniu — HSTS nie dotyczy.",
  });

  // CSP vs CSP-Report-Only.
  const csp = get("content-security-policy");
  const cspRo = get("content-security-policy-report-only");
  findings.push({
    id: "csp",
    title: "Content-Security-Policy",
    present: Boolean(csp),
    severity: csp ? "info" : cspRo ? "needs_check" : ctx.isHtml ? "recommendation" : "info",
    observed: csp
      ? "obecna polityka wymuszająca CSP"
      : cspRo
        ? "obecna jedynie CSP w trybie Report-Only (NIE wymusza)"
        : "brak CSP",
    inference: csp
      ? "Zdefiniowano politykę CSP. Jej skuteczność zależy od dyrektyw (nie oceniamy tu szczegółowo)."
      : cspRo
        ? "Report-Only nie blokuje treści — to nie jest polityka wymuszająca. Wymaga sprawdzenia, czy docelowo ma wymuszać."
        : ctx.isHtml
          ? "Brak CSP. Zalecane rozważenie polityki ograniczającej źródła skryptów. Brak CSP NIE jest potwierdzonym XSS."
          : "Odpowiedź nie-HTML — CSP mniej istotne.",
  });

  // Ochrona przed osadzaniem (frame-ancestors w CSP lub X-Frame-Options).
  const xfo = get("x-frame-options");
  const frameAncestors = csp ? /frame-ancestors/i.test(csp) : false;
  const framingProtected = Boolean(xfo) || frameAncestors;
  findings.push({
    id: "framing",
    title: "Ochrona przed osadzaniem (clickjacking)",
    present: framingProtected,
    severity: framingProtected ? "info" : ctx.isHtml ? "recommendation" : "info",
    observed: frameAncestors
      ? "CSP zawiera frame-ancestors"
      : xfo
        ? `X-Frame-Options: ${xfo}`
        : "brak frame-ancestors i brak X-Frame-Options",
    inference: framingProtected
      ? "Strona deklaruje ograniczenie osadzania w ramkach."
      : ctx.isHtml
        ? "Brak deklaracji ograniczającej osadzanie. Zalecane frame-ancestors (CSP) lub X-Frame-Options."
        : "Odpowiedź nie-HTML — ryzyko clickjackingu mniej istotne.",
  });

  // X-Content-Type-Options.
  const xcto = get("x-content-type-options");
  const nosniff = (xcto || "").toLowerCase().includes("nosniff");
  findings.push({
    id: "xcto",
    title: "X-Content-Type-Options",
    present: Boolean(xcto),
    severity: nosniff ? "info" : "recommendation",
    observed: xcto ? `obecny: ${xcto}` : "brak nagłówka",
    inference: nosniff
      ? "Wyłączone zgadywanie typu MIME (nosniff)."
      : "Zalecane ustawienie 'nosniff', aby przeglądarka nie zgadywała typu zawartości.",
  });

  // Referrer-Policy.
  const refPolicy = get("referrer-policy");
  findings.push({
    id: "referrer",
    title: "Referrer-Policy",
    present: Boolean(refPolicy),
    severity: refPolicy ? "info" : "recommendation",
    observed: refPolicy ? `obecny: ${refPolicy}` : "brak nagłówka",
    inference: refPolicy
      ? "Zdefiniowano politykę przekazywania nagłówka Referer."
      : "Zalecane ustawienie Referrer-Policy (np. strict-origin-when-cross-origin).",
  });

  return findings;
}

/** Wyodrębnia zaobserwowaną nazwę technologii serwera (to NIE jest podatność). */
export function serverTech(headers: Record<string, string>): string | null {
  const parts: string[] = [];
  if (headers["server"]) parts.push(`Server: ${headers["server"]}`);
  if (headers["x-powered-by"]) parts.push(`X-Powered-By: ${headers["x-powered-by"]}`);
  return parts.length ? parts.join("; ") : null;
}
