import type { Transport, TransportRequest, TransportResponse } from "../net/transport.js";
import type { DnsLookup } from "../net/ssrf.js";
import type { PipelineDeps } from "../pipeline/pipeline.js";
import type { Db } from "../db/db.js";

/**
 * Tryb demo — izolowany, z danymi SYNTETYCZNYMI i BEZ prawdziwej sieci.
 * Transport demonstracyjny zwraca spreparowane odpowiedzi (adresy .example),
 * a DNS demonstracyjny mapuje nazwy na stały adres publiczny, dzięki czemu cały
 * łańcuch (konektory → kwalifikacja → kontrole → raport) działa offline.
 *
 * Adresy .example są wyłącznie danymi demonstracyjnymi, nie celami rzeczywistych żądań.
 */

const DEMO_PUBLIC_IP = "93.184.216.34";

export const demoLookup: DnsLookup = async (_hostname: string) => {
  return [{ address: DEMO_PUBLIC_IP, family: 4 }];
};

function json(status: number, body: unknown): TransportResponse {
  const text = JSON.stringify(body);
  return {
    status,
    headers: { "content-type": "application/json" },
    setCookie: [],
    body: text,
    bodyBytes: Buffer.byteLength(text),
    truncated: false,
    tls: null,
  };
}

function htmlResponse(status: number, html: string, extraHeaders: Record<string, string> = {}, setCookie: string[] = []): TransportResponse {
  return {
    status,
    headers: { "content-type": "text/html; charset=utf-8", ...extraHeaders },
    setCookie,
    body: html,
    bodyBytes: Buffer.byteLength(html),
    truncated: false,
    tls: {
      authorized: true,
      authorizationError: null,
      protocol: "TLSv1.3",
      validFrom: "Jan 1 00:00:00 2026 GMT",
      validTo: "Jan 1 00:00:00 2027 GMT",
      subjectCN: "*.example",
      issuerCN: "Demo CA",
      altNames: ["DNS:*.example"],
    },
  };
}

const SHOW_IDS = [101, 102, 103, 104];

export const demoTransport: Transport = async (req: TransportRequest): Promise<TransportResponse> => {
  const host = req.hostname.toLowerCase();
  const path = req.path;

  // --- API Hacker News (demo) ---
  if (host === "hacker-news.firebaseio.com") {
    if (path.includes("/showstories.json")) return json(200, SHOW_IDS);
    const m = path.match(/\/item\/(\d+)\.json/);
    if (m) {
      const id = Number(m[1]);
      const nowSec = Math.floor(Date.now() / 1000) - 3600;
      const items: Record<number, unknown> = {
        101: {
          id: 101,
          type: "story",
          by: "demo",
          time: nowSec,
          title: "Show HN: Habitly – a habit tracker",
          url: "https://habits.example",
          text: "I built this habit tracker with Claude Code over a weekend. Feedback welcome!",
        },
        102: {
          id: 102,
          type: "story",
          by: "demo",
          time: nowSec,
          title: "Show HN: ChatBuddy – talk to an assistant",
          url: "https://chat.example",
          text: "Our app lets you chat with Gemini. No signup required.",
        },
        103: {
          id: 103,
          type: "story",
          by: "demo",
          time: nowSec,
          title: "Show HN: My open-source library",
          url: "https://github.com/demo/library",
          text: "Just the repo, no hosted app yet.",
        },
        104: {
          id: 104,
          type: "story",
          by: "demo",
          time: nowSec,
          title: "Show HN: Notesy – vibe coded notes app",
          url: "https://notes.example",
          text: "Zbudowałem tę aplikację do notatek przy pomocy Cursora. Zvibecodowane w kilka godzin.",
        },
      };
      return json(200, items[id] ?? null);
    }
    return json(404, null);
  }

  // --- Strony aplikacji (demo) ---
  if (host === "habits.example") {
    // Dobrze skonfigurowana strona.
    return htmlResponse(
      200,
      `<!doctype html><html><head><title>Habitly</title>
       <link rel="stylesheet" href="https://habits.example/app.css"></head>
       <body><h1>Habitly</h1><script src="https://habits.example/app.js"></script></body></html>`,
      {
        "strict-transport-security": "max-age=63072000; includeSubDomains",
        "content-security-policy": "default-src 'self'",
        "x-content-type-options": "nosniff",
        "x-frame-options": "DENY",
        "referrer-policy": "strict-origin-when-cross-origin",
      },
      ["sid=abc; Secure; HttpOnly; SameSite=Lax"],
    );
  }
  if (host === "chat.example") {
    // Brak części nagłówków + odwołanie http:// (mixed content) + cookie bez Secure.
    return htmlResponse(
      200,
      `<!doctype html><html><head><title>ChatBuddy</title></head>
       <body><img src="http://chat.example/logo.png">
       <script src="http://cdn.example/widget.js"></script>
       <a href="http://example.org/info">info</a></body></html>`,
      { "x-content-type-options": "nosniff" },
      ["session=xyz; SameSite=Lax"],
    );
  }
  if (host === "notes.example") {
    // Ujawnienie diagnostyczne w treści.
    return htmlResponse(
      200,
      `<!doctype html><html><head><title>Notesy</title></head>
       <body><pre>Traceback (most recent call last):
  File "app.py", line 42, in handler
    raise ValueError("demo")</pre></body></html>`,
      { "strict-transport-security": "max-age=100" },
    );
  }

  // robots.txt demo — wszystko dozwolone.
  if (path === "/robots.txt") {
    return {
      status: 200,
      headers: { "content-type": "text/plain" },
      setCookie: [],
      body: "User-agent: *\nAllow: /\n",
      bodyBytes: 20,
      truncated: false,
      tls: req.protocol === "https:" ? htmlResponse(200, "").tls : null,
    };
  }

  // Domyślna odpowiedź demo.
  return htmlResponse(200, `<!doctype html><title>Demo ${host}</title><h1>${host}</h1>`);
};

export function makeDemoDeps(): PipelineDeps {
  return { transport: demoTransport, lookup: demoLookup };
}

/** Wstępne dane demonstracyjne — żeby panel pokazywał coś od razu. */
export function seedDemo(db: Db): void {
  if (db.getMeta("demo_seeded") === "1") return;
  // Nic nie robimy poza oznaczeniem — Start w trybie demo wygeneruje dane offline.
  db.setMeta("demo_seeded", "1");
}
