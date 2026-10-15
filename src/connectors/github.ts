import { fetchSource, parseJson } from "./source-fetch.js";
import type { Connector, CollectParams, CollectResult, ConnectorContext } from "./types.js";
import type { ProjectInput } from "../types.js";

/**
 * Konektor GitHub — oficjalne, PUBLICZNE API wyszukiwania repozytoriów.
 * Szuka repo z deklaracją tworzenia przy pomocy AI i wyodrębnia adres DZIAŁAJĄCEJ
 * aplikacji z pola `homepage` (repozytorium to nie strona produktu).
 *
 * Działa BEZ tokenu (limit ~10 zapytań/min). Opcjonalny token (VIBESCOUT_GITHUB_TOKEN)
 * tylko podnosi limity i jest wysyłany wyłącznie do api.github.com.
 */

const API = "https://api.github.com/search/repositories";

interface GhRepo {
  full_name?: string;
  html_url?: string;
  description?: string | null;
  homepage?: string | null;
  pushed_at?: string;
  topics?: string[];
}
interface GhSearch {
  total_count?: number;
  items?: GhRepo[];
  message?: string;
}

// Zapytania nakierowane na deklaracje „stworzone z AI". Mało zapytań = szacunek dla limitów.
const QUERIES = [
  '"vibe coded" in:readme,description',
  '"built with" ("claude code" OR cursor OR codex OR lovable OR bolt) in:readme,description',
];

function isCodeHost(host: string): boolean {
  return /(^|\.)(github\.com|gitlab\.com|bitbucket\.org|npmjs\.com|sourceforge\.net)$/i.test(host);
}

export const githubConnector: Connector = {
  id: "github",
  name: "GitHub",
  implemented: true,
  coverage:
    "Oficjalne publiczne API wyszukiwania repozytoriów. Adres aplikacji pobierany z pola 'homepage' repo (repo bez homepage → zapis źródła, bez kontroli). Działa bez tokenu (niższy limit); token opcjonalny.",

  async collect(params: CollectParams, ctx: ConnectorContext): Promise<CollectResult> {
    const items: ProjectInput[] = [];
    let reads = 0;
    let limited = false;
    const errors: string[] = [];
    const seen = new Set<string>();

    const headers: Record<string, string> = { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" };
    if (ctx.githubToken) headers["authorization"] = `Bearer ${ctx.githubToken}`;

    const perPage = Math.min(Math.max(10, Math.ceil(params.limit / QUERIES.length)), 50);
    const cutoff = ctx.now() - params.lookbackDays * 86400 * 1000;

    for (const q of QUERIES) {
      if (items.length >= params.limit) break;
      if (ctx.budget.reads >= ctx.budget.max) {
        limited = true;
        break;
      }
      const url = `${API}?q=${encodeURIComponent(q)}&sort=updated&order=desc&per_page=${perPage}`;
      const res = await fetchSource(url, ctx, headers);
      reads += 1;
      ctx.budget.reads += 1;

      if (res.status === 403 || res.status === 429) {
        errors.push("limit API GitHub (403/429) — spróbuj później lub dodaj token.");
        limited = true;
        break;
      }
      const data = parseJson<GhSearch>(res);
      if (!data) {
        errors.push(`zapytanie „${q}": ${res.error || res.blocked?.reason || `status ${res.status}`}`);
        continue;
      }
      if (data.message) {
        errors.push(`GitHub: ${data.message}`);
        continue;
      }
      for (const repo of data.items ?? []) {
        if (items.length >= params.limit) break;
        const fullName = repo.full_name ?? "";
        if (!fullName || seen.has(fullName)) continue;
        seen.add(fullName);

        if (repo.pushed_at && new Date(repo.pushed_at).getTime() < cutoff) continue;

        // Adres działającej aplikacji z homepage (jeśli publiczny i nie jest hostem kodu).
        let appUrl: string | null = null;
        const hp = (repo.homepage ?? "").trim();
        if (hp) {
          try {
            const u = new URL(hp);
            if ((u.protocol === "http:" || u.protocol === "https:") && !isCodeHost(u.hostname)) {
              appUrl = u.toString();
            }
          } catch {
            /* nieprawidłowy homepage — pomijamy jako adres aplikacji */
          }
        }

        const rawText = [repo.full_name, repo.description ?? "", (repo.topics ?? []).join(" ")].join(" ").trim();
        items.push({
          name: (repo.full_name?.split("/")[1] ?? repo.full_name ?? "repo").slice(0, 120),
          appUrl,
          announcementUrl: repo.html_url ?? (fullName ? `https://github.com/${fullName}` : null),
          source: "github",
          publishedAt: repo.pushed_at ?? null,
          rawText,
          externalId: fullName,
        });
      }
    }

    return {
      items,
      reads,
      limited,
      error: errors.length ? errors.join("; ") : null,
      note: `GitHub: ${items.length} repo (z homepage jako adresem aplikacji tam, gdzie dostępne).${ctx.githubToken ? "" : " Bez tokenu — niższe limity API."}`,
    };
  },
};
