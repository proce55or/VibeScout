import { useEffect, useState } from "react";
import { api } from "../api";
import type { StatusResponse } from "../types";

interface Feed {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  limit: number;
  status: string | null;
  lastError: string | null;
}
interface Exclusion {
  host: string;
  addedAt: string;
  note: string | null;
}
interface ImportPreviewRow {
  index: number;
  valid: boolean;
  error: string | null;
  input: unknown;
  raw: Record<string, string>;
}

export function SourcesView({ status, onChange }: { status: StatusResponse; onChange: () => void }) {
  return (
    <>
      <ConnectorsCard status={status} />
      <ManualAddCard onChange={onChange} />
      <ImportCard onChange={onChange} />
      <FeedsCard />
      <ExclusionsCard />
    </>
  );
}

function ConnectorsCard({ status }: { status: StatusResponse }) {
  return (
    <div className="card">
      <h2>Stan konektorów</h2>
      <table>
        <thead>
          <tr>
            <th>Konektor</th>
            <th>Status</th>
            <th>Zasięg / uwagi</th>
          </tr>
        </thead>
        <tbody>
          {status.connectors.map((c) => (
            <tr key={c.id}>
              <td>{c.name}</td>
              <td>{c.implemented ? <span className="tag origin-declared_ai">wdrożony</span> : <span className="tag">niewdrożony</span>}</td>
              <td className="small muted">{c.coverage}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ManualAddCard({ onChange }: { onChange: () => void }) {
  const [appUrl, setAppUrl] = useState("");
  const [name, setName] = useState("");
  const [announcementUrl, setAnn] = useState("");
  const [rawText, setRaw] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const submit = async () => {
    setMsg(null);
    try {
      const res = await api.post<{ merged: boolean; qualification: { status: string; reason: string | null } }>("/projects/manual", {
        appUrl,
        name,
        announcementUrl,
        rawText,
      });
      setMsg(`${res.merged ? "Połączono z istniejącym." : "Dodano."} Status: ${res.qualification.status}${res.qualification.reason ? ` (${res.qualification.reason})` : ""}.`);
      setAppUrl("");
      setName("");
      setAnn("");
      setRaw("");
      onChange();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="card">
      <h2>Ręczne dodanie projektu</h2>
      <div className="row">
        <label className="field grow">
          Adres aplikacji (wymagany)
          <input placeholder="https://moja-aplikacja.example" value={appUrl} onChange={(e) => setAppUrl(e.target.value)} />
        </label>
        <label className="field grow">
          Nazwa
          <input placeholder="Nazwa projektu" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
      </div>
      <label className="field" style={{ marginTop: 8 }}>
        Link do ogłoszenia (opcjonalnie)
        <input placeholder="https://news.ycombinator.com/item?id=…" value={announcementUrl} onChange={(e) => setAnn(e.target.value)} />
      </label>
      <label className="field" style={{ marginTop: 8 }}>
        Fragment deklaracji autora (opcjonalnie) — na jego podstawie następuje klasyfikacja
        <textarea placeholder="np. I built this with Claude Code" value={rawText} onChange={(e) => setRaw(e.target.value)} />
      </label>
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn" disabled={!appUrl} onClick={submit}>
          Dodaj projekt
        </button>
        {msg && <span className="small muted">{msg}</span>}
      </div>
    </div>
  );
}

function ImportCard({ onChange }: { onChange: () => void }) {
  const [format, setFormat] = useState<"csv" | "json">("csv");
  const [content, setContent] = useState("");
  const [rows, setRows] = useState<ImportPreviewRow[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const preview = async () => {
    setMsg(null);
    const res = await api.post<{ rows: ImportPreviewRow[]; validCount: number; invalidCount: number }>("/import/preview", { format, content });
    setRows(res.rows);
    setMsg(`Podgląd: ${res.validCount} poprawnych, ${res.invalidCount} błędnych.`);
  };

  const commit = async () => {
    if (!rows) return;
    const valid = rows.filter((r) => r.valid).map((r) => r.input);
    const res = await api.post<{ added: number; merged: number }>("/import/commit", { rows: valid });
    setMsg(`Dodano ${res.added}, połączono ${res.merged}.`);
    setRows(null);
    setContent("");
    onChange();
  };

  return (
    <div className="card">
      <h2>Import z pliku (CSV / JSON)</h2>
      <div className="small muted">
        Pola (elastyczne nazwy): <code>appUrl/url</code>, <code>announcementUrl</code>, <code>name</code>, <code>publishedAt</code>,{" "}
        <code>rawText/deklaracja</code>. Walidacja i podgląd przed dodaniem.
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <select value={format} onChange={(e) => setFormat(e.target.value as "csv" | "json")}>
          <option value="csv">CSV</option>
          <option value="json">JSON</option>
        </select>
        <button className="btn ghost" onClick={preview} disabled={!content.trim()}>
          Podgląd
        </button>
        {rows && (
          <button className="btn" onClick={commit} disabled={!rows.some((r) => r.valid)}>
            Dodaj poprawne
          </button>
        )}
        {msg && <span className="small muted">{msg}</span>}
      </div>
      <textarea
        style={{ marginTop: 8 }}
        placeholder={format === "csv" ? "appUrl,name,announcementUrl,rawText\nhttps://app.example,Moja apka,https://…,\"built with Cursor\"" : '[{"appUrl":"https://app.example","name":"Moja apka","rawText":"built with Cursor"}]'}
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
      {rows && (
        <table style={{ marginTop: 8 }}>
          <thead>
            <tr>
              <th>#</th>
              <th>Poprawny</th>
              <th>Szczegóły</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.index}>
                <td>{r.index + 1}</td>
                <td>{r.valid ? "✓" : <span className="err">✕</span>}</td>
                <td className="small">{r.valid ? JSON.stringify((r.input as { appUrl?: string })?.appUrl) : r.error}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function FeedsCard() {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [limit, setLimit] = useState(25);
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => setFeeds(await api.get<Feed[]>("/feeds"));
  useEffect(() => {
    load();
  }, []);

  const add = async () => {
    setMsg(null);
    try {
      await api.post("/feeds", { name, url, limit });
      setName("");
      setUrl("");
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="card">
      <h2>Kanały RSS / Atom</h2>
      <div className="small muted">Brak domyślnych kanałów — dodaj własne, jeśli serwis udostępnia kanał do takiego użycia.</div>
      <div className="row" style={{ marginTop: 8 }}>
        <input placeholder="Nazwa" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="grow" placeholder="https://przykład.example/feed.xml" value={url} onChange={(e) => setUrl(e.target.value)} />
        <input type="number" min={1} max={200} value={limit} onChange={(e) => setLimit(Number(e.target.value))} style={{ width: 80 }} />
        <button className="btn" onClick={add} disabled={!name || !url}>
          Dodaj kanał
        </button>
      </div>
      {msg && <div className="err small">{msg}</div>}
      <table style={{ marginTop: 10 }}>
        <tbody>
          {feeds.length === 0 && (
            <tr>
              <td className="muted small">Brak kanałów.</td>
            </tr>
          )}
          {feeds.map((f) => (
            <tr key={f.id}>
              <td>
                <label className="checkline">
                  <input type="checkbox" checked={f.enabled} onChange={async () => { await api.post(`/feeds/${f.id}/toggle`, { enabled: !f.enabled }); load(); }} />
                  <strong>{f.name}</strong>
                </label>
                <div className="small muted">{f.url}</div>
              </td>
              <td style={{ textAlign: "right" }}>
                <button className="btn danger" onClick={async () => { await api.del(`/feeds/${f.id}`); load(); }}>
                  Usuń
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExclusionsCard() {
  const [list, setList] = useState<Exclusion[]>([]);
  const [host, setHost] = useState("");

  const load = async () => setList(await api.get<Exclusion[]>("/exclusions"));
  useEffect(() => {
    load();
  }, []);

  const add = async () => {
    if (!host.trim()) return;
    await api.post("/exclusions", { host: host.trim() });
    setHost("");
    load();
  };

  return (
    <div className="card">
      <h2>Wykluczenia domen</h2>
      <div className="small muted">Hosty z tej listy (oraz ich subdomeny) są pomijane w kontrolach.</div>
      <div className="row" style={{ marginTop: 8 }}>
        <input className="grow" placeholder="przyklad.example" value={host} onChange={(e) => setHost(e.target.value)} />
        <button className="btn" onClick={add} disabled={!host.trim()}>
          Dodaj wykluczenie
        </button>
      </div>
      <ul className="clean" style={{ marginTop: 8 }}>
        {list.length === 0 && <li className="muted small">Brak wykluczeń.</li>}
        {list.map((e) => (
          <li key={e.host} className="row" style={{ justifyContent: "space-between" }}>
            <span>
              {e.host} {e.note && <span className="small muted">— {e.note}</span>}
            </span>
            <button className="btn ghost" onClick={async () => { await api.del(`/exclusions/${encodeURIComponent(e.host)}`); load(); }}>
              Usuń
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
