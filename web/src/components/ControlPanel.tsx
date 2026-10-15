import { useEffect, useState } from "react";
import { api } from "../api";
import type { StatusResponse } from "../types";

const COUNTER_DEFS: Array<{ key: string; label: string; attn?: boolean }> = [
  { key: "found", label: "Znalezione" },
  { key: "queued", label: "W kolejce / zakwalif." },
  { key: "checked", label: "Sprawdzone" },
  { key: "needsReview", label: "Do przeglądu", attn: true },
  { key: "rejected", label: "Odrzucone" },
  { key: "errors", label: "Błędy" },
  { key: "sourceReads", label: "Odczyty źródeł" },
];

export function ControlPanel({ status, onChange }: { status: StatusResponse; onChange: () => void }) {
  const run = status.run;
  const isActive = run !== null && ["running", "paused", "stopping"].includes(run.status);
  const paused = run?.status === "paused";

  const [sources, setSources] = useState<string[]>(["hackernews"]);
  const [lookbackDays, setLookback] = useState(status.defaults.lookbackDays);
  const [maxApps, setMaxApps] = useState(status.defaults.maxAppsPerDay);
  const [budget, setBudget] = useState(status.defaults.sourceReadBudget);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    // Domyślnie zaznacz wszystkie wdrożone konektory.
    const impl = status.connectors.filter((c) => c.implemented).map((c) => c.id);
    setSources((prev) => (prev.length === 1 && prev[0] === "hackernews" ? impl : prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.connectors.length]);

  const toggleSource = (id: string) =>
    setSources((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const action = async (path: string, body?: unknown) => {
    setBusy(true);
    setErr(null);
    try {
      const res = await api.post<{ ok: boolean; error?: string }>(path, body);
      if (!res.ok && res.error) setErr(res.error);
      onChange();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const counters = (status.lastRun?.counters ?? {}) as Record<string, number>;
  const displayRun = status.run ?? status.lastRun;

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>Przebieg</h2>
        <span className={`status-pill status-${displayRun?.status ?? "idle"}`}>
          {statusLabel(displayRun?.status, status.live.stopRequested)}
        </span>
      </div>

      <div className="row" style={{ marginTop: 12, gap: 8 }}>
        <button className="btn" disabled={busy || isActive} onClick={() => action("/run/start", { sources, lookbackDays, maxAppsPerDay: maxApps, sourceReadBudget: budget })}>
          ▶ Start
        </button>
        <button
          className="btn ghost"
          disabled={busy || isActive || status.queued === 0}
          title={
            status.queued === 0
              ? "Kolejka jest pusta — nie ma czego sprawdzać."
              : "Sprawdza projekty już czekające w kolejce, bez szukania nowych w źródłach."
          }
          onClick={() => action("/run/start", { queueOnly: true, maxAppsPerDay: maxApps })}
        >
          ✓ Sprawdź kolejkę ({status.queued})
        </button>
        <button className="btn ghost" disabled={busy || !isActive || paused} onClick={() => action("/run/pause")}>
          ⏸ Pauza
        </button>
        <button className="btn ghost" disabled={busy || !paused} onClick={() => action("/run/resume")}>
          ⏵ Wznów
        </button>
        <button className="btn danger" disabled={busy || !isActive} onClick={() => action("/run/stop")}>
          ⏹ Stop
        </button>
        <span className="grow" />
        <span className="small muted">Dziś sprawdzono (24h): {status.checkedLast24h} / limit {maxApps}</span>
      </div>

      {err && <div className="err" style={{ marginTop: 8 }}>{err}</div>}

      <h3>Źródła</h3>
      <div className="pill-group">
        {status.connectors.map((c) => (
          <label key={c.id} className="checkline" title={c.coverage} style={{ opacity: c.implemented ? 1 : 0.5 }}>
            <input
              type="checkbox"
              disabled={!c.implemented || isActive}
              checked={sources.includes(c.id)}
              onChange={() => toggleSource(c.id)}
            />
            {c.name} {!c.implemented && <span className="tag">niewdrożony</span>}
          </label>
        ))}
      </div>

      <h3>Zakres i limity (przed startem)</h3>
      <div className="row">
        <label className="field">
          Zakres dat wstecz (dni)
          <input type="number" min={1} max={365} value={lookbackDays} disabled={isActive} onChange={(e) => setLookback(Number(e.target.value))} />
        </label>
        <label className="field">
          Maks. aplikacji / dobę
          <input type="number" min={1} max={500} value={maxApps} disabled={isActive} onChange={(e) => setMaxApps(Number(e.target.value))} />
        </label>
        <label className="field">
          Budżet odczytów źródeł
          <input type="number" min={1} max={5000} value={budget} disabled={isActive} onChange={(e) => setBudget(Number(e.target.value))} />
        </label>
      </div>

      {displayRun && (
        <>
          <h3>
            Liczniki {status.run ? "(bieżący przebieg)" : "(ostatni przebieg)"}
            {displayRun.params.queueOnly ? " — tylko kolejka" : ""}
          </h3>
          <div className="counters">
            {COUNTER_DEFS.map((d) => (
              <div key={d.key} className={`counter ${d.attn && (counters[d.key] ?? 0) > 0 ? "attn" : ""}`}>
                <div className="n">{counters[d.key] ?? 0}</div>
                <div className="l">{d.label}</div>
              </div>
            ))}
          </div>
          <div className="small muted" style={{ marginTop: 10 }}>
            Zakres dat ogłoszeń: {fmt(displayRun.dateRange.from)} → {fmt(displayRun.dateRange.to)}. W kolejce: {status.queued}.
          </div>
          {displayRun.note && <div className="notice warn" style={{ marginTop: 10 }}>{displayRun.note}</div>}
        </>
      )}
    </div>
  );
}

function statusLabel(status: string | undefined, stopping: boolean): string {
  if (!status) return "bezczynny";
  const map: Record<string, string> = {
    running: "w toku",
    paused: "wstrzymany",
    stopping: "zatrzymywanie…",
    stopped: "zatrzymany",
    done: "zakończony",
    crashed: "przerwany (błąd)",
    idle: "bezczynny",
  };
  return map[status] ?? status;
}

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return iso.slice(0, 10);
}
