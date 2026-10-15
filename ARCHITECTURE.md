# ARCHITECTURE — VibeScout

## Przegląd

VibeScout to jeden lokalny proces Node.js, który:

1. serwuje **panel** (React + Vite, zbudowany statycznie) i **API** (Express) na `127.0.0.1`,
2. uruchamia **pipeline** przetwarzania w tle (pobieranie → kwalifikacja → kontrole → raport),
3. zapisuje stan w lokalnej bazie **SQLite** (poza katalogiem repozytorium).

Przeglądarka wyświetla tylko interfejs. **Wszystkie** żądania do obcych stron wykonuje backend — nigdy frontend, bez proxy CORS.

```
Przeglądarka (panel React)  ──/api──►  Express (loopback)
                                         │
                                         ├─ Pipeline (kolejka, Start/Pauza/Stop)
                                         │     ├─ Konektory (HN API, RSS, import, manual)
                                         │     ├─ Klasyfikacja + deduplikacja
                                         │     └─ Kontrole A–F ──► Warstwa sieciowa
                                         │                           (SSRF guard, limity,
                                         │                            rate-limit, pinowanie DNS)
                                         └─ SQLite (projekty, kontrole, powiadomienia, kolejka)
```

## Moduły (`src/`)

- **`config.ts`** — konfiguracja, twarde limity, katalog danych (poza repo).
- **`net/`** — wspólna, przetestowana warstwa sieciowa:
  - `ssrf.ts` — walidacja URL/IP (ipaddr.js), blokada adresów niepublicznych (IPv4/IPv6/mapowane), rozwiązywanie DNS z wstrzykiwalną funkcją (testy), anty-rebinding.
  - `ratelimit.ts` — globalna współbieżność + odstęp per host (wstrzykiwalny zegar).
  - `transport.ts` / `http-transport.ts` — kontrakt transportu i implementacja na node:http/https z **pinowaniem IP**, weryfikacją TLS, dekompresją i limitem treści.
  - `fetch.ts` — bezpieczne pobieranie: walidacja SSRF przed każdym żądaniem (także na każdym przekierowaniu), budżet żądań/czasu/rozmiaru, brak auto-ponawiania (Retry-After tylko raportowane).
  - `robots.ts` — minimalna obsługa robots.txt dla zgłoszonego adresu.
- **`checks/`** — kontrole A–F: `run-checks.ts` (orkiestracja), `headers.ts`, `cookies.ts`, `html.ts` (mixed content + ujawnienia, bez uruchamiania JS).
- **`classify/`** — `classify.ts` (deterministyczna klasyfikacja PL/EN), `dedup.ts` (normalizacja + klucz dedup), `qualify.ts` (decyzja o kolejce/odrzuceniu).
- **`connectors/`** — `hackernews.ts`, `rss.ts`, `import.ts`, `registry.ts` (ze statusami, konektory niewdrożone jawnie oznaczone), `source-fetch.ts`.
- **`db/`** — `schema.ts`, `db.ts` (repozytoria, dedup przy zapisie, odzyskiwanie po awarii, retencja).
- **`pipeline/`** — `pipeline.ts` (Start/Pauza/Wznów/Stop, kolejka, limit dobowy, współbieżność, powiadomienia, brak podwójnego Startu).
- **`report/`** — `report.ts` (model + Markdown + JSON), `html.ts` (bezpieczny HTML z escapowaniem).
- **`server/`** — `index.ts` (wejście, .env, odzyskiwanie), `app.ts`, `routes.ts`, `security.ts` (Host/Origin + token).
- **`demo/`** — transport i DNS demonstracyjny (offline), dane syntetyczne.
- **`util/`** — `redact.ts`, `escape.ts`, `text.ts`, `id.ts`.

Frontend w `web/` (React + Vite): panel sterowania, lista projektów z filtrami, szczegóły/dowody/raport/historia, źródła/kanały/wykluczenia/import, powiadomienia.

## Kolejka, trwałość i odzyskiwanie

- Kolejka = projekty o statusie `queued`. Kontroler pobiera je atomowo (`claimNextQueued` → `checking`).
- Stan trwały w SQLite. Przy starcie `recoverInterrupted()` oznacza przerwane przebiegi jako `crashed` i przywraca zadania `checking` → `queued`. **Sam restart nie uruchamia nowego przeszukiwania.**
- **Brak podwójnego Startu** — Pipeline odmawia drugiego przebiegu, gdy jeden trwa.
- Deduplikacja przy zapisie: wspólny klucz (host + port niestandardowy + ścieżka + istotne parametry) łączy ogłoszenia tej samej aplikacji z zachowaniem pochodzenia.

## Bezpieczeństwo (skrót)

- Tylko loopback; Host/Origin + token lokalnej sesji na operacjach zmieniających stan.
- SSRF: schemat/port, blokada adresów niepublicznych (IPv4/IPv6/mapowane, metadata), pinowanie do zweryfikowanego IP, walidacja każdego przekierowania, przerwanie przy niejednoznacznym DNS.
- Limity twarde (żądania/czas/rozmiar/przekierowania), rate-limit, obsługa Retry-After, brak obchodzenia blokad.
- Dane niezaufane escapowane; sekrety/wartości cookies redagowane; brak renderowania surowego HTML cudzych stron.

## Testy

`tests/` (vitest) — bez internetu i poświadczeń; transport i DNS wstrzykiwane. Pokrycie: klasyfikacja, deduplikacja, nagłówki/cookies, błędy TLS, przekierowania, SSRF (IPv4/IPv6, rebinding), timeout/limit treści, 403/429, trwałość kolejki, brak podwójnego Startu, Pauza/Stop, redakcja sekretów, bezpieczne wyświetlanie cudzej treści.

CI (`.github/workflows/ci.yml`) uruchamia typy, testy i build na danych lokalnych — **nie** skanuje prawdziwych stron.
