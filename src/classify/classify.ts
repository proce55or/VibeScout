import { redactText } from "../util/redact.js";
import type { Classification, OriginClass, Confidence } from "../types.js";

/**
 * Deterministyczny klasyfikator ogłoszeń (PL/EN).
 * Odróżnia:
 *  - autor DEKLARUJE stworzenie aplikacji przy pomocy AI (declared_ai),
 *  - słabsza przesłanka pośrednia (indirect),
 *  - aplikacja tylko OFERUJE funkcję AI, np. czat z modelem (uses_ai),
 *  - brak informacji (unknown) / sprzeczne (conflicting).
 *
 * Samo wystąpienie nazwy modelu NIE wystarcza do uznania „stworzone z AI".
 * To nie jest „zaawansowany model oceny ryzyka" — to jawne reguły dopasowania.
 */

interface ToolDef {
  canonical: string;
  re: RegExp;
}

// Dopuszczamy polskie końcówki fleksyjne i apostrof (np. „Cursora", „Claude'a").
const PL = "(?:['’]?[a-ząćęłńóśźż]{0,4})?";
const TOOLS: ToolDef[] = [
  { canonical: "Claude Code", re: /\bclaude\s*code/i },
  { canonical: "Claude", re: new RegExp(`\\bclaude${PL}`, "i") },
  { canonical: "Codex", re: new RegExp(`\\bcodex${PL}`, "i") },
  { canonical: "ChatGPT", re: /\bchat\s*gpt/i },
  { canonical: "GPT", re: /\bgpt(?:-?[0-9o]+)?/i },
  { canonical: "Gemini", re: new RegExp(`\\bgemini${PL}`, "i") },
  { canonical: "Cursor", re: new RegExp(`\\bcursor${PL}`, "i") },
  { canonical: "Lovable", re: new RegExp(`\\blovable${PL}`, "i") },
  { canonical: "Bolt", re: new RegExp(`\\bbolt(?:\\.new)?${PL}`, "i") },
  { canonical: "v0", re: /\bv0(?:\.dev)?\b/i },
  { canonical: "Replit", re: new RegExp(`\\breplit(?:\\s*agent)?${PL}`, "i") },
  { canonical: "Windsurf", re: new RegExp(`\\bwindsurf${PL}`, "i") },
  { canonical: "Copilot", re: new RegExp(`\\b(?:github\\s*)?copilot${PL}`, "i") },
];

const AI_REF =
  "(?:ai|a\\.i\\.|sztuczn\\w*\\s+inteligencj\\w*|llm|claude(?:\\s*code)?|codex|chat\\s*gpt|gpt(?:-?[0-9o]+)?|gemini|cursor|lovable|bolt(?:\\.new)?|v0|replit|windsurf|copilot)";

// Deklaracja autorstwa „stworzone przy pomocy AI".
const BUILT_WITH: RegExp[] = [
  new RegExp(
    `\\b(built|made|created|coded|wrote|developed|designed|generated|shipped)\\b[^.?!]{0,40}\\b(with|using|via)\\b[^.?!]{0,25}\\b${AI_REF}\\b`,
    "i",
  ),
  new RegExp(
    `\\b(stworzy\\w*|zrobi\\w*|zbudowa\\w*|napisa\\w*|postawi\\w*|wyklika\\w*|wygenerowa\\w*|zakodowa\\w*)\\b[^.?!]{0,45}\\b(z|przy|za|w)\\b[^.?!]{0,25}\\b(pomoc\\w*|uży\\w*|wykorzystani\\w*)?[^.?!]{0,15}\\b${AI_REF}\\b`,
    "i",
  ),
  new RegExp(
    `\\b(z|przy)\\s+(pomoc\\w*|uży\\w*|wykorzystani\\w*)\\s+[^.?!]{0,10}\\b${AI_REF}\\b`,
    "i",
  ),
  new RegExp(`\\b${AI_REF}[-\\s]?(built|generated|made|coded|powered\\s+build)\\b`, "i"),
  /\bvibe[-\s]?cod(?:ed|ing|owane\w*)\b/i,
  /\bzvibe[-\s]?codowa\w*\b/i,
];

// Aplikacja tylko OFERUJE funkcję AI (nie przesądza o sposobie stworzenia).
const USES_AI: RegExp[] = [
  new RegExp(`\\b(chat|talk|converse|speak)\\b[^.?!]{0,20}\\b(with|to)\\b[^.?!]{0,15}\\b${AI_REF}\\b`, "i"),
  new RegExp(`\\b(czat|rozmow\\w*|rozmawia\\w*|porozmawia\\w*|gadaj\\w*)\\b[^.?!]{0,15}\\b(z|ze)\\b[^.?!]{0,10}\\b(${AI_REF}|modelem)\\b`, "i"),
  /\bAI[-\s]?powered\b/i,
  /\bpowered\s+by\s+(ai|gpt|gemini|claude|an?\s+llm)\b/i,
  /\b(uses?|integrates?)\s+(ai|gpt|an?\s+llm|a\s+model)\b/i,
  /\b(opart\w*|bazuj\w*|wykorzystuj\w*)\s+(na\s+)?(ai|sztuczn\w*\s+inteligencj\w*|modelu)\b/i,
];

const NEGATION: RegExp[] = [
  /\bno\s+ai\b/i,
  /\bwithout\s+ai\b/i,
  /\bnot\s+(?:built|made|created)\s+(?:with\s+)?ai\b/i,
  /\bhand[-\s]?(coded|written|built)\b/i,
  /\bbez\s+(?:pomocy\s+)?(ai|sztucznej\s+inteligencj\w*)\b/i,
  /\bnie\s+(?:uży\w*|korzysta\w*)\s+(?:z\s+)?ai\b/i,
];

function detectLanguage(text: string): "pl" | "en" | "unknown" {
  if (!text.trim()) return "unknown";
  if (/[ąćęłńóśźż]/i.test(text)) return "pl";
  const plWords = /\b(aplikacj\w*|stworzy\w*|przy|pomoc\w*|użyci\w*|który|dla|jest|oraz)\b/i;
  const enWords = /\b(the|with|built|app|using|made|created|and|for|this)\b/i;
  const pl = plWords.test(text);
  const en = enWords.test(text);
  if (pl && !en) return "pl";
  if (en && !pl) return "en";
  if (en) return "en";
  return "unknown";
}

function firstMatch(text: string, res: RegExp[]): { term: string; index: number } | null {
  let best: { term: string; index: number } | null = null;
  for (const re of res) {
    const m = re.exec(text);
    if (m && (best === null || m.index < best.index)) {
      best = { term: m[0], index: m.index };
    }
  }
  return best;
}

export interface ClassifyOptions {
  /** Źródło niskiej wiarygodności (np. same tagi repo GitHub). Wtedy sam token
   * „vibe coded" NIE jest traktowany jako deklaracja autora — tylko wyraźne
   * zdanie typu „built with X" liczy się jako declared_ai. */
  weakSource?: boolean;
}

export function classify(rawText: string, opts?: ClassifyOptions): Classification {
  const text = rawText || "";
  const language = detectLanguage(text);
  const matchedTerms: string[] = [];

  // Narzędzia.
  let tool: string | null = null;
  for (const t of TOOLS) {
    if (t.re.test(text)) {
      if (!tool) tool = t.canonical;
      matchedTerms.push(t.canonical);
    }
  }

  // Przy słabym źródle (tagi) pomijamy samodzielne wzorce „vibe cod*" —
  // deklaracją autora pozostaje tylko wyraźne zdanie „built with X".
  const builtPatterns = opts?.weakSource ? BUILT_WITH.slice(0, 4) : BUILT_WITH;
  const built = firstMatch(text, builtPatterns);
  const uses = firstMatch(text, USES_AI);
  const negation = firstMatch(text, NEGATION);

  let origin: OriginClass;
  let confidence: Confidence;
  let evidenceIndex = 0;

  if (built && negation) {
    origin = "conflicting";
    confidence = "medium";
    matchedTerms.push(built.term, negation.term);
    evidenceIndex = Math.min(built.index, negation.index);
  } else if (built) {
    origin = "declared_ai";
    // Wysoka pewność, gdy deklaracji towarzyszy konkretne narzędzie.
    confidence = tool ? "high" : "medium";
    matchedTerms.push(built.term);
    evidenceIndex = built.index;
  } else if (uses) {
    origin = "uses_ai";
    confidence = tool ? "high" : "medium";
    matchedTerms.push(uses.term);
    evidenceIndex = uses.index;
  } else if (tool) {
    // Sama nazwa modelu bez deklaracji — słaba przesłanka pośrednia.
    origin = "indirect";
    confidence = "low";
  } else {
    origin = "unknown";
    confidence = "low";
  }

  const snippet = buildSnippet(text, evidenceIndex);

  return {
    origin,
    tool: origin === "uses_ai" || origin === "declared_ai" || origin === "indirect" || origin === "conflicting" ? tool : null,
    confidence,
    evidenceSnippet: snippet,
    matchedTerms: [...new Set(matchedTerms)].slice(0, 12),
    language,
  };
}

function buildSnippet(text: string, index: number): string {
  if (!text.trim()) return "";
  const start = Math.max(0, index - 40);
  const end = Math.min(text.length, index + 160);
  return redactText(text.slice(start, end), 200);
}

/** Czy projekt domyślnie kwalifikuje się do automatycznych kontroli. */
export function qualifiesForAutoChecks(c: Classification): boolean {
  // Domyślnie tylko wyraźna deklaracja autora.
  return c.origin === "declared_ai";
}
