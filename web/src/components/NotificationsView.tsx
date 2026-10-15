import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import type { AppNotification } from "../types";

export function NotificationsView({ onChange }: { onChange: () => void }) {
  const [items, setItems] = useState<AppNotification[]>([]);

  const load = useCallback(async () => {
    const res = await api.get<{ notifications: AppNotification[]; unread: number }>("/notifications");
    setItems(res.notifications);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const markAll = async () => {
    await api.post("/notifications/read", {});
    await load();
    onChange();
  };

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>Powiadomienia</h2>
        <button className="btn ghost" onClick={markAll}>
          Oznacz wszystkie jako przeczytane
        </button>
      </div>
      <div className="small muted" style={{ marginTop: 6 }}>
        Powiadomienia są trwałe — widoczne także po ponownym otwarciu panelu.
      </div>
      <ul className="clean" style={{ marginTop: 10 }}>
        {items.length === 0 && <li className="muted small">Brak powiadomień.</li>}
        {items.map((n) => (
          <li key={n.id} className={`notif ${n.read ? "" : "unread"}`}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span>
                {n.level === "attention" ? "⚠ " : "• "}
                {n.title}
              </span>
              <span className="small muted">{n.createdAt.replace("T", " ").slice(0, 19)}</span>
            </div>
            <div className="small muted">{n.body}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
