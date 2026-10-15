# VibeScout

> A small, local research tool that discovers **publicly announced** AI-built web apps and runs a tightly‑scoped set of **passive, public** web checks, producing a **private** report for the operator.

VibeScout is a personal/portfolio project. It is **not** a penetration-testing tool and makes **no** security guarantees. It reads a limited set of public sources (Hacker News "Show HN", GitHub repository search, configurable RSS/Atom feeds, manual entries, CSV/JSON import), classifies whether the **author declared** building the app with AI, and performs a small, explicitly defined set of public HTTP checks (A–F) on the apps that qualify.

🇵🇱 **Instrukcja po polsku (instalacja, uruchomienie, FAQ): [`QUICKSTART_PL.md`](./QUICKSTART_PL.md).**

---

## What it does

- **Discovers** announcements from a limited set of sources — it does not crawl the whole web.
- **Classifies** origin deterministically (rule-based, PL + EN): *declared built-with-AI* vs *merely uses an AI feature* vs *indirect / unknown*. The mere presence of a model name is **not** enough.
- **Checks** (only apps with an explicit author declaration, by default) a fixed list of public response properties:
  - **A** HTTPS availability & certificate validation (hostname, expiry)
  - **B** HTTP→HTTPS redirect behavior
  - **C** Security headers (HSTS, CSP incl. `frame-ancestors`, X-Frame-Options, X-Content-Type-Options, Referrer-Policy)
  - **D** Cookie attributes of cookies actually set in the observed response (Secure/HttpOnly/SameSite — never values)
  - **E** Explicit `http://` subresource references on an HTTPS page (observed mixed-content, flagged for verification)
  - **F** Visible diagnostic disclosures (e.g. stack traces) in the plain response
- **Reports** per app (Polish) + a run summary, exportable to **Markdown / safe HTML / JSON**, with in-app persistent notifications.

### Out of scope (never performed in v1)

SQL injection, XSS payloads, password guessing, auth testing on others' data, form submission, data changes, login bypass, hidden-path enumeration, `.env`/`.git` probing, CVE exploitation, load testing. A future, separately authorized module would be required for any of these. **Absence of observed issues does not mean an app is secure.**

## Safety by design

- Runs on **loopback only** (`127.0.0.1`); the panel is never exposed to the internet.
- The backend fetches foreign pages — **never** the frontend, and **no** CORS proxy.
- **SSRF protection**: validates URL/port/scheme; resolves DNS itself; blocks private/loopback/link-local (incl. cloud metadata `169.254.169.254`)/multicast/reserved/ULA for **both IPv4 and IPv6** and mapped forms; pins the connection to the verified public IP (**anti–DNS-rebinding**); re-validates every redirect hop.
- Hard budgets: ≤10 HTTP requests/app, 10s/request, ≤5 redirects, ≤1 MB body; global concurrency 2; ≥5s between requests to the same host; respects `Retry-After`; never bypasses 401/403/429/CAPTCHA.
- Untrusted content (announcements, HTML, project names) is escaped everywhere and **never** executed or rendered as raw HTML; secrets, cookie values and sensitive URL params are redacted in evidence and logs.
- Local panel protected by Host/Origin checks + a local session token (CSRF).

## Tech stack

TypeScript · Node.js (Express) · SQLite (better-sqlite3) · React + Vite. No Docker, Redis, paid database, or external cloud service required. Core discovery, classification, checks and templated reporting work **without any paid model or LLM key**.

## Status & honesty notes

- The **Hacker News** connector uses the official API (`/v0/showstories.json`): up to ~200 most recent Show HN posts — **not** a full monthly archive.
- The **GitHub** connector uses the public repository Search API (no token required; optional token only raises rate limits). The working app URL is taken from the repo's `homepage` field; a repo without one is recorded as a source but never treated as a running app. For repos with a homepage, the README is also read (bounded) to find author declarations missing from the short description. Repository tags alone are treated as weak evidence.
- Reddit and Facebook connectors are **not implemented** and are shown with an explicit "not implemented" status (Facebook/closed groups are handled via manual entry only).
- Running the code on GitHub is **not** a running server; the backend runs on your machine while it is on and awake.

## Quick start (summary)

```bash
npm install
npm run build
npm start          # opens the local API + built panel on http://127.0.0.1:4317
# or, for development:
npm run dev        # Vite panel on http://127.0.0.1:5174, API on :4317
```

Full, beginner-friendly instructions (macOS, Intel included), start/stop scripts, troubleshooting: **[`QUICKSTART_PL.md`](./QUICKSTART_PL.md)**.

Try it with zero network first:

```bash
VIBESCOUT_DEMO=1 npm start   # isolated demo mode: synthetic data, network checks disabled
```

## Documentation

- [`QUICKSTART_PL.md`](./QUICKSTART_PL.md) — install / run / stop / update / troubleshooting (Polish)
- [`SPEC.md`](./SPEC.md) — product scope
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — how it works
- [`docs/CHECKS_PL.md`](./docs/CHECKS_PL.md) — check scope, interpretation, limits
- [`demo-data/`](./demo-data) — synthetic demo data and a sample report (clearly marked as demo)

## License

MIT — see [`LICENSE`](./LICENSE).
