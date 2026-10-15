// Klient API panelu. Token lokalnej sesji dołączany do operacji zmieniających stan.

let token: string | null = null;

export async function initSession(): Promise<{ demo: boolean; version: string }> {
  const res = await fetch("/api/session");
  const data = await res.json();
  token = data.token;
  return { demo: data.demo, version: data.version };
}

async function req<T>(method: string, pathUrl: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (method !== "GET" && token) headers["x-vibescout-token"] = token;
  const res = await fetch(`/api${pathUrl}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = `Błąd ${res.status}`;
    try {
      const j = await res.json();
      if (j.error) msg = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return (await res.json()) as T;
  return (await res.text()) as unknown as T;
}

export const api = {
  get: <T>(p: string) => req<T>("GET", p),
  post: <T>(p: string, body?: unknown) => req<T>("POST", p, body ?? {}),
  del: <T>(p: string) => req<T>("DELETE", p),
};

export function reportUrl(projectId: string, format: "html" | "md" | "json"): string {
  return `/api/projects/${projectId}/report?format=${format}`;
}
