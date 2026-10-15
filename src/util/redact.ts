/**
 * Redakcja danych wrażliwych. Używana w dowodach, raportach i logach.
 * Zasada: nigdy nie zapisujemy wartości cookies, tokenów, kluczy ani danych
 * logowania. Przechowujemy minimalne, zredagowane dowody.
 */

/** Nazwy parametrów URL, które traktujemy jako wrażliwe. */
const SENSITIVE_PARAM_RE =
  /^(?:.*(?:token|secret|password|passwd|pwd|apikey|api_key|key|auth|access[_-]?token|refresh[_-]?token|session|sig|signature|code|credential)s?.*)$/i;

/** Typowe parametry śledzące do pominięcia przy deduplikacji/normalizacji. */
export const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "gclid",
  "fbclid",
  "mc_cid",
  "mc_eid",
  "ref",
  "ref_src",
  "igshid",
  "yclid",
  "_hsenc",
  "_hsmi",
  "vero_id",
  "spm",
]);

/** Czy dany parametr URL jest wrażliwy (token, podpis, dane logowania). */
export function isSensitiveParam(name: string): boolean {
  return SENSITIVE_PARAM_RE.test(name);
}

/** Zwraca URL z zredagowanymi wartościami wrażliwych parametrów. */
export function redactUrl(raw: string): string {
  try {
    const u = new URL(raw);
    for (const key of [...u.searchParams.keys()]) {
      if (isSensitiveParam(key)) u.searchParams.set(key, "[zredagowano]");
    }
    // Dane logowania w URL — usuwamy.
    if (u.username || u.password) {
      u.username = "";
      u.password = "";
    }
    return u.toString();
  } catch {
    return raw;
  }
}

/** Redaguje nagłówek Set-Cookie do samych atrybutów (bez nazwy i wartości ciasteczka). */
export function redactSetCookie(setCookie: string): string {
  const parts = setCookie.split(";").map((p) => p.trim());
  const [nameValue, ...attrs] = parts;
  const name = nameValue ? nameValue.split("=")[0] : "cookie";
  const keptAttrs = attrs.filter((a) => {
    const lower = a.toLowerCase();
    // Zostawiamy tylko atrybuty bezpieczeństwa; pomijamy np. Expires/Domain/Path z wartościami.
    return (
      lower === "secure" ||
      lower === "httponly" ||
      lower.startsWith("samesite")
    );
  });
  return `${name}=[zredagowano]${keptAttrs.length ? "; " + keptAttrs.join("; ") : ""}`;
}

/** Ogólna redakcja tekstu: tnie długość i maskuje typowe sekrety. */
export function redactText(text: string, maxLen = 400): string {
  let out = text
    // klucze API i tokeny o dużej entropii
    .replace(/\b(?:sk|pk|rk|api|key|token|bearer)[-_]?[A-Za-z0-9]{12,}\b/gi, "[zredagowano-token]")
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\b/g, "[zredagowano-jwt]")
    // adresy e-mail
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[zredagowano-email]");
  out = out.replace(/\s+/g, " ").trim();
  if (out.length > maxLen) out = out.slice(0, maxLen) + " […]";
  return out;
}
