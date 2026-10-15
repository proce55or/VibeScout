# SPEC — VibeScout v1

## Cel

Lokalne narzędzie do **własnego użytku**, które w ograniczonej liczbie publicznych źródeł wyszukuje ogłoszenia autorów aplikacji webowych tworzonych przy pomocy AI, wyodrębnia adresy tych aplikacji, przeprowadza mały, jawnie określony zestaw wstępnych, **publicznych** kontroli odpowiedzi WWW i przygotowuje **prywatny** raport.

Pełny przebieg: **Start → pobranie ogłoszeń → identyfikacja projektów → kwalifikacja + deduplikacja → ograniczone kontrole WWW → raport → powiadomienie.**

## Zasady nadrzędne

- Samo stworzenie aplikacji z AI **nie** jest dowodem słabego zabezpieczenia.
- Podstawowym dowodem pochodzenia jest **publiczna deklaracja autora**, nie wygląd strony.
- Domyślnie automatycznym kontrolom podlegają tylko projekty z **wyraźną deklaracją autora**; pozostałe trafiają do przeglądu.
- To **nie** jest pentest ani gwarancja bezpieczeństwa. Brak zaobserwowanych problemów ≠ bezpieczeństwo.

## Źródła (v1)

| Źródło | Status | Zasięg / uwagi |
|---|---|---|
| Hacker News (Show HN) | wdrożony | Oficjalne API `/v0/showstories.json`, ~200 najnowszych wpisów. Nie pełne archiwum miesiąca. |
| RSS/Atom | wdrożony | Tylko kanały skonfigurowane przez użytkownika (nazwa, status, limit). Brak domyślnych kanałów. |
| Ręczne dodanie | wdrożony | Adres aplikacji + link do ogłoszenia + opcjonalny fragment deklaracji. |
| Import CSV/JSON | wdrożony | Z walidacją i podglądem przed dodaniem. |
| GitHub | wdrożony | Publiczne API wyszukiwania repo (bez tokenu; token opcjonalny). Adres aplikacji z pola `homepage`; README czytane w ograniczonym zakresie; same tagi = słaby dowód. |
| Reddit | niewdrożony | Tylko dozwoloną metodą i z autoryzacją, po sprawdzeniu zasad. |
| Facebook / grupy zamknięte | przez dane ręczne | Bez prywatnych sesji, bez obchodzenia logowania/CAPTCHA. |

Parametry początkowe: ogłoszenia z ostatnich **30 dni** (w granicach źródła), maks. **20** nowych aplikacji objętych kontrolami na dobę, ograniczony **budżet odczytów źródeł**. Zakres dat i wyczerpanie limitów są pokazywane.

## Kwalifikacja

Rozpoznawane określenia (PL/EN): Claude, Claude Code, Codex, ChatGPT/GPT, Gemini, Cursor, Lovable, Bolt, v0, Replit, Windsurf, Copilot oraz „vibe coding". Rozróżniane klasy pochodzenia:

- `declared_ai` — autor deklaruje stworzenie przy pomocy AI,
- `indirect` — słabsza przesłanka pośrednia (wymaga sprawdzenia),
- `uses_ai` — aplikacja tylko oferuje funkcję AI (np. czat z modelem),
- `unknown` — brak informacji,
- `conflicting` — sprzeczne informacje.

Poziom pewności jakościowy: niska / średnia / wysoka (bez fałszywej precyzji procentowej). Deduplikacja uwzględnia **subdomeny i znaczące ścieżki**; łączy wiele ogłoszeń tej samej aplikacji z zachowaniem pochodzenia; adresy z tokenami/podpisami/danymi logowania → ręczna ocena. Odrzucane: same artykuły, dokumentacja, profile i repozytoria bez działającego adresu aplikacji.

## Zakres kontroli WWW (A–F)

Patrz [`docs/CHECKS_PL.md`](./docs/CHECKS_PL.md). Poza zakresem (nie wykonywane): SQL injection, XSS z payloadami, zgadywanie haseł, testowanie autoryzacji, wysyłanie formularzy, zmiany danych, obejście logowania, enumeracja ścieżek, `.env`/`.git`, eksploatacja CVE, testy obciążeniowe.

## Limity i ochrona

- Walidacja URL/portów (80/443)/schematów; blokada adresów prywatnych, loopback, link-local, multicast, zarezerwowanych, ULA i metadata (IPv4 + IPv6 + formy mapowane); pinowanie do zweryfikowanego publicznego IP (anty-rebinding); walidacja każdego przekierowania.
- Na aplikację: ≤10 żądań HTTP, 10 s/żądanie, ≤5 przekierowań, ≤1 MB treści; globalnie 2 równoległe żądania; ≥5 s między żądaniami do tego samego hosta; obsługa `Retry-After`; brak obchodzenia 401/403/429/CAPTCHA.
- Panel tylko lokalnie (loopback), ochrona Host/Origin + token lokalnej sesji; brak publicznego proxy i CORS `*`.
- Dane ogłoszeń/HTML/nazwy to dane **niezaufane** — escapowane, nigdy wykonywane; sekrety i wartości cookies redagowane.

## Raport i powiadomienia

Raport PL pojedynczej aplikacji + podsumowanie przebiegu; eksport Markdown / bezpieczny HTML / JSON. Rozdzielony **stan wykonania** (wykonano/pominięto/zablokowano/błąd) od **wagi** obserwacji (informacja/zalecane/wymaga sprawdzenia). Powiadomienia w aplikacji — trwałe. W v1: brak kontaktu z właścicielami, brak publikacji wyników, brak mailingu/rankingu.

## Przechowywanie

SQLite w katalogu danych aplikacji (poza repo), retencja domyślnie 30 dni, możliwość ręcznego usunięcia. Minimalne dowody, bez pełnych kopii cudzych stron. Jeden lokalny użytkownik — bez kont, płatności, SaaS.

## Opcjonalne AI

Klasyfikacja i raport są deterministyczne (jawne reguły). Adapter LLM jest opcjonalny i **domyślnie wyłączony**; po włączeniu wysyła tylko minimalne, zredagowane dane, ma limit wydatków i nie zwiększa zakresu skanowania. Brak modelu nie zatrzymuje raportów.
