import type { ProjectInput } from "../types.js";

/**
 * Import rekordów z lokalnego CSV lub JSON, z walidacją i podglądem przed dodaniem.
 * Oczekiwane pola (elastyczne nazwy): name, appUrl/url, announcementUrl/announcement,
 * source, publishedAt/date, rawText/declaration/text.
 */

export interface ImportRow {
  index: number;
  valid: boolean;
  error: string | null;
  input: ProjectInput | null;
  raw: Record<string, string>;
}

export interface ImportResult {
  rows: ImportRow[];
  validCount: number;
  invalidCount: number;
  format: "csv" | "json";
}

/** Minimalny parser CSV (RFC4180: cudzysłowy, przecinki, nowe linie w polach). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let i = 0;
  let inQuotes = false;
  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    rows.push(row);
    row = [];
  };
  while (i < text.length) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      pushField();
      i += 1;
      continue;
    }
    if (ch === "\r") {
      i += 1;
      continue;
    }
    if (ch === "\n") {
      pushField();
      pushRow();
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  // ostatnie pole/wiersz
  if (field.length > 0 || row.length > 0) {
    pushField();
    pushRow();
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function pick(obj: Record<string, string>, keys: string[]): string | null {
  for (const k of keys) {
    for (const objKey of Object.keys(obj)) {
      if (objKey.toLowerCase() === k) {
        const v = obj[objKey];
        if (v !== undefined && v.trim() !== "") return v.trim();
      }
    }
  }
  return null;
}

function toInput(raw: Record<string, string>): { input: ProjectInput | null; error: string | null } {
  const appUrl = pick(raw, ["appurl", "url", "app_url", "adres", "adresaplikacji"]);
  const announcementUrl = pick(raw, ["announcementurl", "announcement", "ogloszenie", "link", "zrodlo_url"]);
  const name = pick(raw, ["name", "nazwa", "title", "tytul"]) ?? (appUrl ? new URL(appUrl).hostname : "Import");
  const source = pick(raw, ["source", "zrodlo"]) ?? "import";
  const publishedAt = pick(raw, ["publishedat", "date", "data", "pubdate"]);
  const rawText = pick(raw, ["rawtext", "declaration", "deklaracja", "text", "opis"]) ?? "";

  if (!appUrl) {
    return { input: null, error: "brak adresu aplikacji (appUrl/url)" };
  }
  try {
    const u = new URL(appUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return { input: null, error: "adres aplikacji musi być http/https" };
    }
  } catch {
    return { input: null, error: "nieprawidłowy adres aplikacji" };
  }
  let iso: string | null = null;
  if (publishedAt) {
    const d = new Date(publishedAt);
    iso = Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return {
    input: {
      name: name.slice(0, 120),
      appUrl,
      announcementUrl,
      source,
      publishedAt: iso,
      rawText,
      externalId: announcementUrl ?? appUrl,
    },
    error: null,
  };
}

export function importRecords(content: string, format: "csv" | "json"): ImportResult {
  const rows: ImportRow[] = [];
  if (format === "json") {
    let data: unknown;
    try {
      data = JSON.parse(content);
    } catch {
      return { rows: [], validCount: 0, invalidCount: 0, format };
    }
    const arr = Array.isArray(data) ? data : [data];
    arr.forEach((rec, index) => {
      const raw: Record<string, string> = {};
      if (rec && typeof rec === "object") {
        for (const [k, v] of Object.entries(rec as Record<string, unknown>)) {
          raw[k] = v === null || v === undefined ? "" : String(v);
        }
      }
      const { input, error } = toInput(raw);
      rows.push({ index, valid: input !== null, error, input, raw });
    });
  } else {
    const table = parseCsv(content);
    if (table.length === 0) return { rows: [], validCount: 0, invalidCount: 0, format };
    const header = table[0]!.map((h) => h.trim());
    for (let r = 1; r < table.length; r += 1) {
      const cells = table[r]!;
      const raw: Record<string, string> = {};
      header.forEach((h, c) => {
        raw[h] = (cells[c] ?? "").trim();
      });
      const { input, error } = toInput(raw);
      rows.push({ index: r - 1, valid: input !== null, error, input, raw });
    }
  }
  const validCount = rows.filter((r) => r.valid).length;
  return { rows, validCount, invalidCount: rows.length - validCount, format };
}
