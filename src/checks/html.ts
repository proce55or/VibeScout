import { redactText } from "../util/redact.js";

/**
 * Lekkie skanowanie HTML BEZ uruchamiania JavaScriptu i bez przeglądarki.
 * Wykrywamy jedynie zaobserwowane odwołania/wzorce wymagające weryfikacji.
 */

/** Atrybuty ładujące podzasoby (istotne dla mixed content). <a href> to NIE podzasób. */
const SUBRESOURCE: Record<string, string[]> = {
  script: ["src"],
  img: ["src", "srcset"],
  link: ["href"], // tylko dla stylesheet/preload/prefetch — sprawdzane niżej
  iframe: ["src"],
  audio: ["src"],
  video: ["src", "poster"],
  source: ["src", "srcset"],
  object: ["data"],
  embed: ["src"],
  track: ["src"],
  form: ["action"], // aktywne odwołanie
};

export interface MixedContentRef {
  tag: string;
  attr: string;
  url: string;
  active: boolean; // script/iframe/form/object = aktywne; obraz/audio = pasywne
}

interface ParsedTag {
  name: string;
  attrs: Record<string, string>;
}

/** Prosty iterator po otwierających tagach HTML (bez budowania DOM). */
function* iterateTags(html: string): Generator<ParsedTag> {
  const tagRe = /<([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) !== null) {
    const name = m[1]!.toLowerCase();
    const attrText = m[2] ?? "";
    const attrs: Record<string, string> = {};
    const attrRe = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
    let a: RegExpExecArray | null;
    while ((a = attrRe.exec(attrText)) !== null) {
      const key = a[1]!.toLowerCase();
      const val = a[3] ?? a[4] ?? a[5] ?? "";
      attrs[key] = val;
    }
    yield { name, attrs };
  }
}

const ACTIVE_TAGS = new Set(["script", "iframe", "form", "object", "embed"]);

/** Znajduje odwołania http:// do podzasobów osadzanych na stronie. */
export function findMixedContent(html: string): MixedContentRef[] {
  const refs: MixedContentRef[] = [];
  for (const tag of iterateTags(html)) {
    const attrNames = SUBRESOURCE[tag.name];
    if (!attrNames) continue;
    if (tag.name === "link") {
      const rel = (tag.attrs["rel"] || "").toLowerCase();
      if (!/stylesheet|preload|prefetch|modulepreload/.test(rel)) continue;
    }
    for (const attr of attrNames) {
      const raw = tag.attrs[attr];
      if (!raw) continue;
      // srcset może zawierać wiele URL-i.
      const urls = attr === "srcset" ? raw.split(",").map((s) => s.trim().split(/\s+/)[0] ?? "") : [raw];
      for (const url of urls) {
        if (/^http:\/\//i.test(url)) {
          refs.push({ tag: tag.name, attr, url, active: ACTIVE_TAGS.has(tag.name) });
        }
      }
    }
  }
  return refs;
}

export interface Disclosure {
  kind: string;
  snippet: string;
}

const DISCLOSURE_PATTERNS: Array<{ kind: string; re: RegExp }> = [
  { kind: "Python traceback", re: /Traceback \(most recent call last\):/ },
  { kind: "PHP błąd/ostrzeżenie", re: /(?:Fatal error|Warning|Parse error|Notice):.{0,80}?on line \d+/ },
  { kind: "Node.js stack trace", re: /\bat\s+[^\s]+\s+\([^)]+:\d+:\d+\)/ },
  { kind: "Java/JVM stack trace", re: /\bat\s+[a-zA-Z0-9_.$]+\([A-Za-z0-9_]+\.java:\d+\)/ },
  { kind: ".NET stack trace", re: /at\s+[A-Za-z0-9_.]+\.[A-Za-z0-9_]+\([^)]*\)\s+in\s+.+?:line\s+\d+/ },
  { kind: "Ruby on Rails błąd", re: /(?:ActionController|ActiveRecord)::[A-Za-z]+/ },
  { kind: "Django DEBUG", re: /You're seeing this error because you have <code>DEBUG = True/ },
  { kind: "Werkzeug debugger", re: /Werkzeug Debugger|werkzeug\.debug/ },
  { kind: "Baza danych (SQL)", re: /SQLSTATE\[|SQL syntax.*?MySQL|PG::[A-Za-z]+Error|ORA-\d{4,}/ },
  { kind: "Zrzut diagnostyczny stosu", re: /stack trace:|StackTrace|call stack/i },
];

/**
 * Wykrywa jawne ujawnienia diagnostyczne w zwykłej odpowiedzi.
 * Nie wywołujemy celowo błędów. Zwracamy jedynie typ + zredagowany fragment —
 * nie zapisujemy znalezionych danych osobowych ani sekretów.
 */
export function findDisclosures(body: string): Disclosure[] {
  const found: Disclosure[] = [];
  const seen = new Set<string>();
  for (const { kind, re } of DISCLOSURE_PATTERNS) {
    const m = re.exec(body);
    if (m && !seen.has(kind)) {
      seen.add(kind);
      const start = Math.max(0, m.index - 20);
      const raw = body.slice(start, m.index + m[0].length + 40);
      found.push({ kind, snippet: redactText(raw, 160) });
    }
  }
  return found;
}
