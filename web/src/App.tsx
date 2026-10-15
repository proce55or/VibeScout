import { useEffect, useState, useCallback } from "react";
import { api, initSession } from "./api";
import type { StatusResponse } from "./types";
import { ControlPanel } from "./components/ControlPanel";
import { ProjectsView } from "./components/ProjectsView";
import { SourcesView } from "./components/SourcesView";
import { NotificationsView } from "./components/NotificationsView";

type Tab = "panel" | "sources" | "notifications";

export function App() {
  const [session, setSession] = useState<{ demo: boolean; version: string } | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [tab, setTab] = useState<Tab>("panel");
  const [error, setError] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const s = await api.get<StatusResponse>("/status");
      setStatus(s);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    initSession()
      .then((s) => setSession(s))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    refreshStatus();
    const t = setInterval(refreshStatus, 2500);
    return () => clearInterval(t);
  }, [refreshStatus]);

  const unread = status?.unread ?? 0;

  return (
    <div className="app">
      <header className="top">
        <div className="logo">
          Vibe<span>Scout</span>
        </div>
        {session?.demo && <span className="badge demo">TRYB DEMO</span>}
        <span className="badge">v{session?.version ?? "…"}</span>
        <div className="spacer" />
        <nav className="tabs">
          <button className={tab === "panel" ? "active" : ""} onClick={() => setTab("panel")}>
            Panel
          </button>
          <button className={tab === "sources" ? "active" : ""} onClick={() => setTab("sources")}>
            Źródła i dane
          </button>
          <button className={`bell ${tab === "notifications" ? "active" : ""}`} onClick={() => setTab("notifications")}>
            Powiadomienia
            {unread > 0 && <span className="dot">{unread}</span>}
          </button>
        </nav>
      </header>

      {error && <div className="card err">Błąd połączenia z backendem: {error}</div>}

      {tab === "panel" && status && (
        <>
          <ControlPanel status={status} onChange={refreshStatus} />
          <ProjectsView status={status} />
        </>
      )}
      {tab === "sources" && status && <SourcesView status={status} onChange={refreshStatus} />}
      {tab === "notifications" && <NotificationsView onChange={refreshStatus} />}

      <p className="footer-note">
        VibeScout to narzędzie do WŁASNEGO użytku. Wykonuje ograniczone, publiczne odczyty stron (kontrole A–F) — to
        nie jest pentest ani gwarancja bezpieczeństwa. Brak zaobserwowanych problemów nie oznacza, że aplikacja jest
        bezpieczna. Panel działa tylko lokalnie (loopback). Dane trwałe poza katalogiem repozytorium, retencja{" "}
        {status?.retentionDays ?? 30} dni.
      </p>
    </div>
  );
}
