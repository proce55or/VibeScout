import { useCallback, useEffect, useState } from "react";
import { api, reportUrl } from "../api";
import type { CheckRun, Observation, Project } from "../types";

const EXEC_LABELS: Record<string, string> = { done: "wykonano", skipped: "pominięto", blocked: "zablokowano", error: "błąd" };
const SEV_LABELS: Record<string, string> = { info: "informacja", recommendation: "zalecane", needs_check: "wymaga sprawdzenia" };
const SUMMARY_LABELS: Record<string, string> = {
  needs_review: "wymaga przeglądu",
  no_issues_observed: "nie zaobserwowano problemów",
  incomplete: "wynik niepełny",
};

export function ProjectDetail({ projectId, onClose, onChanged }: { projectId: string; onClose: () => void; onChanged: () => void }) {
  const [data, setData] = useState<{ project: Project; checks: CheckRun[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await api.get<{ project: Project; checks: CheckRun[] }>(`/projects/${projectId}`);
    setData(res);
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!data) return null;
  const { project, checks } = data;
  const latest = checks[0];

  const recheck = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.post<{ ok: boolean; error?: string }>(`/projects/${projectId}/recheck`);
      setMsg(res.ok ? "Kontrola ponowiona." : res.error ?? "Błąd");
      await load();
      onChanged();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const del = async () => {
    if (!confirm("Usunąć dane tego projektu?")) return;
    await api.del(`/projects/${projectId}`);
    onChanged();
    onClose();
  };

  const exclude = async () => {
    if (!project.host) return;
    await api.post("/exclusions", { host: project.host, note: "z panelu projektu" });
    setMsg(`Dodano ${project.host} do wykluczeń.`);
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <button className="btn ghost close" onClick={onClose}>
          Zamknij ✕
        </button>
        <h2 style={{ marginTop: 0 }}>{project.name}</h2>
        <div className="small">
          {project.appUrl ? (
            <a href={project.appUrl} target="_blank" rel="noopener noreferrer nofollow">
              {project.appUrl}
            </a>
          ) : (
            <span className="muted">brak adresu aplikacji</span>
          )}
        </div>

        <h3>Klasyfikacja</h3>
        <div className="pill-group">
          <span className={`tag origin-${project.classification.origin}`}>{project.classification.origin}</span>
          <span className={`tag conf-${project.classification.confidence}`}>pewność: {project.classification.confidence}</span>
          {project.classification.tool && <span className="tag">{project.classification.tool}</span>}
          <span className="tag">język: {project.classification.language}</span>
        </div>
        {project.classification.evidenceSnippet && (
          <div className="notice" style={{ marginTop: 8 }}>
            Dowód (zredagowany): „{project.classification.evidenceSnippet}"
          </div>
        )}
        {project.classification.matchedTerms.length > 0 && (
          <div className="small muted" style={{ marginTop: 6 }}>
            Dopasowania: {project.classification.matchedTerms.join(", ")}
          </div>
        )}
        {project.rejectReason && <div className="notice warn" style={{ marginTop: 8 }}>{project.rejectReason}</div>}

        {project.announcementUrl && (
          <div className="small" style={{ marginTop: 10 }}>
            Ogłoszenie:{" "}
            <a href={project.announcementUrl} target="_blank" rel="noopener noreferrer nofollow">
              {project.announcementUrl}
            </a>
          </div>
        )}
        {project.mergedFrom.length > 0 && (
          <div className="small muted" style={{ marginTop: 6 }}>
            Połączone ogłoszenia: {project.mergedFrom.map((m) => m.source).join(", ")}
          </div>
        )}

        <div className="row" style={{ marginTop: 14, gap: 8 }}>
          <button className="btn" disabled={busy || !project.appUrl} onClick={recheck}>
            Ponów kontrolę
          </button>
          <a className="btn ghost" href={reportUrl(projectId, "html")} target="_blank" rel="noopener noreferrer">
            Raport HTML
          </a>
          <a className="btn ghost" href={reportUrl(projectId, "md")}>
            .md
          </a>
          <a className="btn ghost" href={reportUrl(projectId, "json")}>
            .json
          </a>
          {project.host && (
            <button className="btn ghost" onClick={exclude}>
              Wyklucz {project.host}
            </button>
          )}
          <button className="btn danger" onClick={del}>
            Usuń dane
          </button>
        </div>
        {msg && <div className="notice" style={{ marginTop: 8 }}>{msg}</div>}

        <h3>Historia kontroli ({checks.length})</h3>
        {!latest && <div className="muted small">Brak wykonanych kontroli.</div>}
        {latest && (
          <>
            <div className="row" style={{ gap: 8 }}>
              <span className={`tag sum-${latest.summary}`}>{SUMMARY_LABELS[latest.summary]}</span>
              <span className="small muted">
                {latest.startedAt.replace("T", " ").slice(0, 19)} · {latest.budget.httpRequests} żądań ·{" "}
                {latest.budget.bytes} B{latest.budget.truncated ? " · przycięto" : ""}
                {latest.resolvedIp ? ` · IP ${latest.resolvedIp}` : ""}
              </span>
            </div>
            {latest.observations.map((o, i) => (
              <ObservationCard key={i} o={o} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function ObservationCard({ o }: { o: Observation }) {
  return (
    <div className={`sev ${o.severity}`}>
      <div>
        <span className="tag">{o.check}</span> <strong>{o.title}</strong>{" "}
        <span className="k">
          [{EXEC_LABELS[o.execution] ?? o.execution} · {SEV_LABELS[o.severity] ?? o.severity}]
        </span>
      </div>
      <dl>
        <dt>Zaobserwowano</dt>
        <dd>{o.observed}</dd>
        <dt>Dowód</dt>
        <dd>
          <code>{o.evidence}</code>
        </dd>
        <dt>Wniosek</dt>
        <dd>{o.inference}</dd>
        <dt>Nie potwierdzono</dt>
        <dd>{o.notConfirmed}</dd>
        <dt>Następny krok</dt>
        <dd>{o.nextStep}</dd>
      </dl>
    </div>
  );
}
