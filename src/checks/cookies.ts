/**
 * Analiza atrybutów cookies ustawianych w obserwowanej publicznej odpowiedzi.
 * NIE zapisujemy wartości cookies. Brak HttpOnly w dowolnym cookie nie dowodzi
 * błędu sesji — nie wszystkie cookies są sesyjne.
 */

export interface CookieAttrs {
  name: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: "Strict" | "Lax" | "None" | null;
}

export function parseCookieAttributes(setCookie: string): CookieAttrs {
  const parts = setCookie.split(";").map((p) => p.trim());
  const nameValue = parts[0] ?? "";
  const name = nameValue.split("=")[0]?.trim() || "(bez nazwy)";
  let secure = false;
  let httpOnly = false;
  let sameSite: CookieAttrs["sameSite"] = null;
  for (const attr of parts.slice(1)) {
    const lower = attr.toLowerCase();
    if (lower === "secure") secure = true;
    else if (lower === "httponly") httpOnly = true;
    else if (lower.startsWith("samesite")) {
      const v = attr.split("=")[1]?.trim().toLowerCase();
      if (v === "strict") sameSite = "Strict";
      else if (v === "lax") sameSite = "Lax";
      else if (v === "none") sameSite = "None";
    }
  }
  return { name, secure, httpOnly, sameSite };
}

export function analyzeCookies(setCookies: string[]): CookieAttrs[] {
  return setCookies.map(parseCookieAttributes);
}
