import { useEffect, useRef, useState } from "react";
import { api } from "../api";

interface Ev {
  seq: number;
  ts: string;
  level: "info" | "ok" | "warn" | "error";
  msg: string;
}

const COLOR: Record<Ev["level"], string> = {
  info: "var(--muted)",
  ok: "var(--ok)",
  warn: "var(--warn)",
  error: "var(--bad)",
};

export function ActivityLog({ active }: { active: boolean }) {
  const [events, setEvents] = useState<Ev[]>([]);
  const sinceRef = useRef(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const [autoscroll, setAutoscroll] = useState(true);

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const res = await api.get<{ events: Ev[]; lastSeq: number }>(`/events?since=${sinceRef.current}`);
        if (res.events.length) {
          sinceRef.current = res.lastSeq;
          setEvents((prev) => [...prev, ...res.events].slice(-200));
        } else if (res.lastSeq < sinceRef.current) {
          // Serwer zrestartowany — zacznij od nowa.
          sinceRef.current = 0;
          setEvents([]);
        }
      } catch {
        /* ignore */
      }
    };
    tick();
    // Szybciej, gdy przebieg aktywny.
    const interval = active ? 1200 : 3000;
    const t = setInterval(() => {
      if (!stop) tick();
    }, interval);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [active]);

  useEffect(() => {
    if (autoscroll && boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [events, autoscroll]);

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>Na żywo — co robi program</h2>
        <label className="checkline small">
          <input type="checkbox" checked={autoscroll} onChange={(e) => setAutoscroll(e.target.checked)} />
          auto-przewijanie
        </label>
      </div>
      <div
        ref={boxRef}
        style={{
          marginTop: 10,
          maxHeight: 240,
          overflowY: "auto",
          background: "var(--panel-2)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "8px 10px",
          fontFamily: "ui-monospace, Menlo, Consolas, monospace",
          fontSize: 12.5,
          lineHeight: 1.7,
        }}
      >
        {events.length === 0 && <div className="muted">Brak zdarzeń. Kliknij „Start", żeby zobaczyć przebieg na żywo.</div>}
        {events.map((e) => (
          <div key={e.seq}>
            <span className="muted">{e.ts.slice(11, 19)}</span>{" "}
            <span style={{ color: COLOR[e.level] }}>{e.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
