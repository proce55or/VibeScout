# Historia zmian (Changelog)

Najnowsze na górze. Numer wersji widać w panelu obok logo.
Numery 1.0–1.2 nadano wstecz, bo wtedy wersja nie była jeszcze pokazywana w panelu.

## 1.5.0 — 2026-10-15

- **Nowy przycisk „✓ Sprawdź kolejkę (N)”.** Sprawdza projekty, które już czekają w kolejce (np. po dobowym limicie albo po Stop), bez ponownego przeszukiwania źródeł. Nie uruchomi się, gdy kolejka jest pusta albo dobowy limit kontroli jest wykorzystany, i powie dlaczego.
- Kontrola z kolejki pomija adresy repozytoriów i profili (github.com itp.), tak samo jak ręczne „Ponów kontrolę”.
- Nowy plik `CHANGELOG.md` (ten), z linkami w README i instrukcji.

## 1.4.0 — 2026-10-15

- **GitHub: odczyt README.** Gdy repo ma adres działającej aplikacji, a krótki opis nie zawiera deklaracji, program czyta początek README (najwyżej 12 na przebieg).
- **Kolumna „Wynik kontroli”** na liście projektów i filtr po wyniku.
- README i SPEC zgodne ze stanem faktycznym (konektor GitHub opisany jako wdrożony).

## 1.3.0 — 2026-10-15

- „Ponów kontrolę” jest zablokowane dla adresów repozytoriów i profili, a panel wyjaśnia, dlaczego przycisk jest szary.
- Same tagi repozytorium na GitHubie są traktowane jako słaby dowód i nie dają wysokiej pewności.
- Numer wersji przy logo.

## 1.2.0 — 2026-10-15

- **Konektor GitHub** (publiczne API wyszukiwania repozytoriów, bez tokenu; opcjonalny token tylko podnosi limity).
- Naprawiona awaria bazy danych na Node 24 (aktualizacja `better-sqlite3` do 12.11.1).

## 1.1.0 — 2026-10-15

- Naprawiony krytyczny błąd połączeń („Invalid IP address: undefined”) na nowszym Node.
- **Dziennik na żywo** i liczniki aktualizowane w trakcie przebiegu.
- Aktualizacja bibliotek: `npm audit` pokazuje 0 podatności.

## 1.0.0 — 2026-10-15

- Pierwsza wersja: Hacker News (Show HN), RSS/Atom, dodawanie ręczne, import CSV/JSON.
- Klasyfikacja deklaracji autorów (PL + EN), kontrole A–F, raporty po polsku, powiadomienia.
- Ochrona SSRF (IPv4/IPv6, przypięcie DNS), limity żądań, działanie tylko na 127.0.0.1.
