import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import type { Project, StatusResponse } from "../types";
import { ProjectDetail } from "./ProjectDetail";

const ORIGIN_LABELS: Record<string, string> = {
  declared_ai: "deklaracja AI",
  indirect: "pośrednie",
  uses_ai: "używa AI",
  unknown: "brak",
  conflicting: "sprzeczne",
};
const STATUS_LABELS: Record<string, string> = {
  found: "znaleziony",
  rejected: "odrzucony",
  queued: "w kolejce",
  checking: "sprawdzany",
  checked: "sprawdzony",
  needs_review: "do przeglądu",
  error: "błąd",
};
const SUMMARY_LABELS: Record<string, string> = {
  needs_review: "wymaga przeglądu",
  no_issues_observed: "bez uwag",
  incomplete: "niepełny",
};

export function ProjectsView({ status }: { status: StatusResponse }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v) qs.set(k, v);
    qs.set("limit", "200");
    const res = await api.get<{ projects: Project[]; total: number }>(`/projects?${qs.toString()}`);
    setProjects(res.projects);
    setTotal(res.total);
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  // Odświeżaj listę, gdy przebieg w toku.
  useEffect(() => {
    if (!status.run) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [status.run, load]);

  const setF = (k: string, v: string) => setFilters((f) => ({ ...f, [k]: v }));

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>Projekty ({total})</h2>
        <button className="btn ghost" onClick={load}>
          Odśwież
        </button>
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <input placeholder="Szukaj (nazwa/adres/host)…" value={filters.q ?? ""} onChange={(e) => setF("q", e.target.value)} className="grow" />
        <select value={filters.source ?? ""} onChange={(e) => setF("source", e.target.value)}>
          <option value="">— źródło —</option>
          {status.connectors.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value="manual">Ręczne</option>
          <option value="import">Import</option>
        </select>
        <select value={filters.origin ?? ""} onChange={(e) => setF("origin", e.target.value)}>
          <option value="">— pochodzenie —</option>
          {Object.entries(ORIGIN_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select value={filters.confidence ?? ""} onChange={(e) => setF("confidence", e.target.value)}>
          <option value="">— pewność —</option>
          <option value="high">wysoka</option>
          <option value="medium">średnia</option>
          <option value="low">niska</option>
        </select>
        <select value={filters.status ?? ""} onChange={(e) => setF("status", e.target.value)}>
          <option value="">— status —</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select value={filters.summary ?? ""} onChange={(e) => setF("summary", e.target.value)}>
          <option value="">— wynik kontroli —</option>
          {Object.entries(SUMMARY_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>

      <table style={{ marginTop: 14 }}>
        <thead>
          <tr>
            <th>Nazwa / host</th>
            <th>Źródło</th>
            <th>Pochodzenie</th>
            <th>Pewność</th>
            <th>Narzędzie</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {projects.length === 0 && (
            <tr>
              <td colSpan={6} className="muted" style={{ padding: 24, textAlign: "center" }}>
                Brak projektów. Uruchom przebieg lub dodaj ręcznie w zakładce „Źródła i dane".
              </td>
            </tr>
          )}
          {projects.map((p) => (
            <tr key={p.id} className="clickable" onClick={() => setSelected(p.id)}>
              <td>
                <div>{p.name}</div>
                <div className="small muted">{p.host ?? p.appUrl ?? "—"}</div>
              </td>
              <td>{p.source}</td>
              <td>
                <span className={`tag origin-${p.classification.origin}`}>{ORIGIN_LABELS[p.classification.origin]}</span>
              </td>
              <td>
                <span className={`tag conf-${p.classification.confidence}`}>{p.classification.confidence}</span>
              </td>
              <td>{p.classification.tool ?? "—"}</td>
              <td>{STATUS_LABELS[p.status] ?? p.status}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {selected && <ProjectDetail projectId={selected} onClose={() => setSelected(null)} onChanged={load} />}
    </div>
  );
}
