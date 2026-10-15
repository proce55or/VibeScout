import { XMLParser } from "fast-xml-parser";
import { stripHtml, firstExternalLink } from "../util/text.js";
import { fetchSource } from "./source-fetch.js";
import type { Connector, CollectParams, CollectResult, ConnectorContext, FeedConfig } from "./types.js";
import type { ProjectInput } from "../types.js";

/**
 * Konektor RSS/Atom. Czyta WYŁĄCZNIE skonfigurowane kanały (nie wymyślamy adresów).
 * Każdy kanał ma nazwę, status i limit. Z wpisu wyodrębniamy adres ogłoszenia oraz
 * — jeśli to możliwe — kandydujący adres aplikacji z treści.
 */

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", trimValues: true });

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

function pickLink(entry: Record<string, unknown>): string | null {
  const link = entry["link"];
  if (typeof link === "string") return link;
  // Atom: link może być obiektem lub tablicą obiektów z @_href.
  const links = asArray(link as unknown);
  for (const l of links) {
    if (l && typeof l === "object") {
      const rec = l as Record<string, unknown>;
      const rel = rec["@_rel"];
      const href = rec["@_href"];
      if ((rel === undefined || rel === "alternate") && typeof href === "string") return href;
    }
  }
  const first = links[0] as Record<string, unknown> | undefined;
  if (first && typeof first["@_href"] === "string") return first["@_href"] as string;
  return null;
}

function pickDate(entry: Record<string, unknown>): string | null {
  const raw = entry["pubDate"] ?? entry["published"] ?? entry["updated"] ?? entry["dc:date"];
  if (typeof raw !== "string") return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function pickContent(entry: Record<string, unknown>): string {
  const c = entry["content:encoded"] ?? entry["content"] ?? entry["description"] ?? entry["summary"];
  if (typeof c === "string") return c;
  if (c && typeof c === "object") {
    const rec = c as Record<string, unknown>;
    if (typeof rec["#text"] === "string") return rec["#text"] as string;
  }
  return "";
}

export const rssConnector: Connector = {
  id: "rss",
  name: "Kanały RSS/Atom",
  implemented: true,
  coverage:
    "Czyta tylko kanały skonfigurowane przez użytkownika (nazwa, status, limit). Brak domyślnych kanałów — nie wymyślamy adresów.",

  async collect(params: CollectParams, ctx: ConnectorContext): Promise<CollectResult> {
    const feeds: FeedConfig[] = (params.feeds ?? []).filter((f) => f.enabled);
    if (feeds.length === 0) {
      return { items: [], reads: 0, limited: false, error: null, note: "Brak skonfigurowanych/aktywnych kanałów RSS." };
    }

    const items: ProjectInput[] = [];
    let reads = 0;
    let limited = false;
    const errors: string[] = [];
    const cutoff = ctx.now() - params.lookbackDays * 86400 * 1000;

    for (const feed of feeds) {
      if (ctx.budget.reads >= ctx.budget.max) {
        limited = true;
        break;
      }
      const res = await fetchSource(feed.url, ctx);
      reads += 1;
      ctx.budget.reads += 1;
      if (!res.ok || res.status < 200 || res.status >= 300) {
        errors.push(`${feed.name}: ${res.error || res.blocked?.reason || `status ${res.status}`}`);
        continue;
      }
      let doc: Record<string, unknown>;
      try {
        doc = parser.parse(res.body) as Record<string, unknown>;
      } catch (err) {
        errors.push(`${feed.name}: błąd parsowania XML`);
        continue;
      }
      const rss = doc["rss"] as Record<string, unknown> | undefined;
      const atom = doc["feed"] as Record<string, unknown> | undefined;
      let entries: Record<string, unknown>[] = [];
      if (rss) {
        const channel = rss["channel"] as Record<string, unknown> | undefined;
        entries = asArray(channel?.["item"] as unknown) as Record<string, unknown>[];
      } else if (atom) {
        entries = asArray(atom["entry"] as unknown) as Record<string, unknown>[];
      }

      let perFeed = 0;
      let feedHost = "";
      try {
        feedHost = new URL(feed.url).hostname;
      } catch {
        /* ignore */
      }

      for (const entry of entries) {
        if (perFeed >= feed.limit) break;
        if (items.length >= params.limit) break;
        const titleRaw = entry["title"];
        const title = typeof titleRaw === "string" ? titleRaw : stripHtml(String((titleRaw as Record<string, unknown>)?.["#text"] ?? ""));
        const announcementUrl = pickLink(entry);
        const date = pickDate(entry);
        if (date && new Date(date).getTime() < cutoff) continue;
        const content = pickContent(entry);
        const appCandidate = firstExternalLink(content, feedHost) ?? null;
        items.push({
          name: (title || "Bez tytułu").slice(0, 120),
          appUrl: appCandidate,
          announcementUrl,
          source: "rss",
          publishedAt: date,
          rawText: stripHtml(`${title} ${content}`),
          externalId: announcementUrl,
        });
        perFeed += 1;
      }
    }

    return {
      items,
      reads,
      limited,
      error: errors.length ? errors.join("; ") : null,
      note: `Przetworzono ${feeds.length} kanał(ów), zebrano ${items.length} wpisów.`,
    };
  },
};
