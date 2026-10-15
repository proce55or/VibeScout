import { stripHtml } from "../util/text.js";
import { fetchSource, parseJson } from "./source-fetch.js";
import type { Connector, CollectParams, CollectResult, ConnectorContext } from "./types.js";
import type { ProjectInput } from "../types.js";

/**
 * Konektor Hacker News — oficjalne API (https://github.com/HackerNews/API).
 * Czytamy listę „Show HN" z /v0/showstories.json i pobieramy pojedyncze wpisy.
 *
 * ZASIĘG (uczciwie): showstories zwraca do ~200 najnowszych wpisów Show HN.
 * To NIE jest pełne archiwum za cały miesiąc — tylko najnowsze wpisy w zasięgu API.
 */

const BASE = "https://hacker-news.firebaseio.com/v0";

interface HnItem {
  id: number;
  type?: string;
  by?: string;
  time?: number;
  title?: string;
  url?: string;
  text?: string;
  dead?: boolean;
  deleted?: boolean;
}

export const hackerNewsConnector: Connector = {
  id: "hackernews",
  name: "Hacker News (Show HN)",
  implemented: true,
  coverage:
    "Oficjalne API HN, endpoint /v0/showstories.json — do ok. 200 najnowszych wpisów Show HN. Nie obejmuje pełnego archiwum miesiąca.",

  async collect(params: CollectParams, ctx: ConnectorContext): Promise<CollectResult> {
    const items: ProjectInput[] = [];
    let reads = 0;
    let limited = false;

    const listRes = await fetchSource(`${BASE}/showstories.json`, ctx);
    reads += 1;
    ctx.budget.reads += 1;
    const ids = parseJson<number[]>(listRes);
    if (!ids) {
      return {
        items,
        reads,
        limited,
        error: listRes.error || listRes.blocked?.reason || `status ${listRes.status}`,
        note: "Nie udało się pobrać listy Show HN.",
      };
    }

    const cutoff = ctx.now() / 1000 - params.lookbackDays * 86400;

    for (const id of ids) {
      if (items.length >= params.limit) break;
      if (ctx.budget.reads >= ctx.budget.max) {
        limited = true;
        break;
      }
      const itemRes = await fetchSource(`${BASE}/item/${id}.json`, ctx);
      reads += 1;
      ctx.budget.reads += 1;
      const item = parseJson<HnItem>(itemRes);
      if (!item || item.deleted || item.dead || item.type !== "story") continue;
      if (typeof item.time === "number" && item.time < cutoff) {
        // showstories jest posortowane malejąco po czasie — starsze = koniec zakresu.
        break;
      }
      const title = item.title ?? "";
      const name = title.replace(/^show hn:\s*/i, "").split(/[-–—|:]/)[0]?.trim() || title || `HN ${id}`;
      const rawText = stripHtml(`${title} ${item.text ?? ""}`);
      items.push({
        name: name.slice(0, 120),
        appUrl: item.url ?? null,
        announcementUrl: `https://news.ycombinator.com/item?id=${id}`,
        source: "hackernews",
        publishedAt: typeof item.time === "number" ? new Date(item.time * 1000).toISOString() : null,
        rawText,
        externalId: String(id),
      });
    }

    return {
      items,
      reads,
      limited,
      error: null,
      note: limited
        ? `Osiągnięto budżet odczytów źródeł — zwrócono ${items.length} kandydatów (wynik częściowy).`
        : `Zwrócono ${items.length} kandydatów z Show HN (zasięg API, nie pełne archiwum).`,
    };
  },
};
