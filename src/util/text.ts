/** Proste narzędzia tekstowe: dekodowanie encji HTML i usuwanie tagów. */

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#x27": "'",
  "#x2F": "/",
  "#39": "'",
  "#47": "/",
};

export function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (full, body: string) => {
    const key = body as string;
    if (NAMED[key] !== undefined) return NAMED[key];
    if (key[0] === "#") {
      const isHex = key[1] === "x" || key[1] === "X";
      const code = Number.parseInt(key.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      if (Number.isFinite(code) && code > 0 && code < 0x10ffff) {
        try {
          return String.fromCodePoint(code);
        } catch {
          return full;
        }
      }
    }
    return full;
  });
}

/** Usuwa tagi HTML i dekoduje encje; zwraca zwięzły tekst. */
export function stripHtml(html: string): string {
  const noTags = html.replace(/<[^>]*>/g, " ");
  return decodeEntities(noTags).replace(/\s+/g, " ").trim();
}

/** Wyszukuje pierwszy link http(s) w treści, który nie należy do podanego hosta. */
export function firstExternalLink(html: string, excludeHost: string): string | null {
  const re = /https?:\/\/[^\s"'<>)]+/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const u = new URL(m[0]);
      if (u.hostname.toLowerCase() !== excludeHost.toLowerCase()) return u.toString();
    } catch {
      /* ignore */
    }
  }
  return null;
}
