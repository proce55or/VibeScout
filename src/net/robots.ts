import { safeFetch, type FetchBudget, type SafeFetchDeps } from "./fetch.js";

/**
 * Minimalna obsługa robots.txt dla pojedynczego adresu wejścia.
 * Nie jest to crawler — sprawdzamy tylko, czy wolno pobrać zgłoszony adres.
 * Uwaga: robots.txt nie jest zgodą prawną na dowolne wykorzystanie treści —
 * to jedynie techniczna dyrektywa, którą respektujemy.
 */

export interface RobotsRules {
  /** Reguły dla wybranej grupy user-agent. */
  rules: Array<{ allow: boolean; path: string }>;
  /** Czy plik w ogóle istniał/udało się pobrać. */
  present: boolean;
}

const UA_TOKEN = "vibescout";

export function parseRobots(text: string): RobotsRules {
  const lines = text.split(/\r?\n/);
  // Grupy: mapujemy user-agent -> reguły.
  const groups: Array<{ agents: string[]; rules: Array<{ allow: boolean; path: string }> }> = [];
  let current: { agents: string[]; rules: Array<{ allow: boolean; path: string }> } | null = null;
  let lastWasAgent = false;

  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (field === "allow" || field === "disallow") {
      if (!current) {
        current = { agents: ["*"], rules: [] };
        groups.push(current);
      }
      current.rules.push({ allow: field === "allow", path: value });
      lastWasAgent = false;
    } else {
      lastWasAgent = false;
    }
  }

  // Wybór grupy: najpierw dokładny token, potem "*".
  const specific = groups.find((g) => g.agents.some((a) => a.includes(UA_TOKEN)));
  const wildcard = groups.find((g) => g.agents.includes("*"));
  const chosen = specific ?? wildcard;
  return { rules: chosen ? chosen.rules : [], present: true };
}

/** Standardowa reguła: najdłuższe dopasowanie wygrywa; remis → Allow. */
export function isAllowed(robots: RobotsRules, pathname: string): boolean {
  if (!robots.present || robots.rules.length === 0) return true;
  let best: { allow: boolean; len: number } | null = null;
  for (const rule of robots.rules) {
    if (rule.path === "") continue; // puste Disallow = brak ograniczenia
    if (matchesRobotPattern(rule.path, pathname)) {
      const len = rule.path.length;
      if (!best || len > best.len || (len === best.len && rule.allow)) {
        best = { allow: rule.allow, len };
      }
    }
  }
  return best ? best.allow : true;
}

function matchesRobotPattern(pattern: string, pathname: string): boolean {
  // Obsługa prostych wzorców z '*' i kotwicą '$'.
  const anchored = pattern.endsWith("$");
  const core = anchored ? pattern.slice(0, -1) : pattern;
  const parts = core.split("*");
  let pos = 0;
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i]!;
    if (part === "") continue;
    const found = pathname.indexOf(part, pos);
    if (i === 0) {
      if (!pathname.startsWith(part)) return false;
      pos = part.length;
    } else {
      if (found === -1) return false;
      pos = found + part.length;
    }
  }
  if (anchored) {
    const last = parts[parts.length - 1]!;
    return pathname.endsWith(last) && pos === pathname.length;
  }
  return true;
}

export interface RobotsCheck {
  allowed: boolean;
  present: boolean;
  fetched: boolean;
  note: string;
}

/** Pobiera i interpretuje robots.txt dla danego adresu. Liczy się do budżetu żądań. */
export async function checkRobots(
  entryUrl: string,
  budget: FetchBudget,
  deps: SafeFetchDeps,
): Promise<RobotsCheck> {
  let origin: string;
  let pathname: string;
  try {
    const u = new URL(entryUrl);
    origin = `${u.protocol}//${u.host}`;
    pathname = u.pathname || "/";
  } catch {
    return { allowed: false, present: false, fetched: false, note: "nieprawidłowy URL" };
  }
  const robotsUrl = `${origin}/robots.txt`;
  const res = await safeFetch(robotsUrl, { method: "GET" }, budget, deps);
  if (res.blocked) {
    return { allowed: false, present: false, fetched: false, note: `robots: ${res.blocked.reason}` };
  }
  if (res.error) {
    // Nie udało się pobrać robots — zachowawczo pozwalamy na pojedynczy zgłoszony adres.
    return { allowed: true, present: false, fetched: false, note: `robots niedostępny: ${res.error}` };
  }
  if (res.status === 404 || res.status === 410) {
    return { allowed: true, present: false, fetched: true, note: "brak robots.txt (dozwolone)" };
  }
  if (res.status >= 400) {
    return { allowed: true, present: false, fetched: true, note: `robots status ${res.status} (dozwolone)` };
  }
  const parsed = parseRobots(res.body);
  const allowed = isAllowed(parsed, pathname);
  return {
    allowed,
    present: true,
    fetched: true,
    note: allowed ? "robots: dozwolone" : "robots: ścieżka zabroniona",
  };
}
