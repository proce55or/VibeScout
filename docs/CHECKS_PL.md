# Zakres kontroli, interpretacja wyników i ograniczenia

VibeScout wykonuje **ograniczone, publiczne odczyty** stron bez logowania. Są to **rzeczywiste żądania sieciowe**, więc proces nie jest „całkowicie pasywny". **To nie jest pentest ani gwarancja bezpieczeństwa.**

Każda obserwacja ma oddzielnie:
- **stan wykonania:** `wykonano` / `pominięto` / `zablokowano` / `błąd`,
- **wagę:** `informacja` / `zalecane ulepszenie` / `wymaga sprawdzenia`.

Podsumowanie kontroli to jedno z: **wymaga przeglądu**, **nie zaobserwowano wskazanych problemów**, **wynik niepełny**. Nie generujemy pojedynczego arbitralnego wyniku 0–100 ani alarmów o „krytycznym włamaniu".

## Kontrole

### A. HTTPS i certyfikat
Dostępność HTTPS, poprawność weryfikacji certyfikatu i nazwy hosta, termin ważności (z prawidłowego połączenia). **Nie** wyłączamy weryfikacji TLS, by pobrać treść mimo błędu — przy błędzie certyfikatu zapisujemy tylko powód, bez pobierania treści.

### B. HTTP → HTTPS
Sprawdzenie przekierowania z publicznego adresu HTTP na HTTPS, w granicach limitów. Zapisujemy obserwowany przebieg (także pętle lub przekroczenie limitu).

### C. Nagłówki bezpieczeństwa
HSTS, Content-Security-Policy, ochrona przed osadzaniem (`frame-ancestors` lub `X-Frame-Options`), `X-Content-Type-Options`, `Referrer-Policy`. Uwzględniamy alternatywy i kontekst. **CSP Report-Only nie jest polityką wymuszającą.** Brak CSP **nie** jest potwierdzonym XSS.

### D. Atrybuty cookies
Analizujemy tylko atrybuty cookies **faktycznie ustawianych** w obserwowanej odpowiedzi: `Secure`, `HttpOnly`, `SameSite`. **Nie** zapisujemy wartości cookies. Brak `HttpOnly` w dowolnym cookie **nie** dowodzi błędu sesji — nie każde cookie jest sesyjne.

### E. Odwołania `http://` w HTML (mixed content)
Wykrywamy jawne adresy `http://` **osadzanych podzasobów** na stronie HTTPS (skrypty, obrazy, style, ramki, `action` formularzy). Zwykły link `<a href="http://…">` to **nie** mixed content. Bez uruchamiania przeglądarki opisujemy to jako **zaobserwowane odwołanie wymagające weryfikacji** — polityki przeglądarki mogą zmienić efekt.

### F. Ujawnienia diagnostyczne
Widoczny w zwykłej odpowiedzi zrzut stosu lub szczegółowy komunikat diagnostyczny. **Nie** wywołujemy celowo błędów i **nie** zapisujemy znalezionych danych osobowych ani sekretów (dowód jest zredagowany i przycięty).

## Poza zakresem (NIE wykonywane w v1)

SQL injection, XSS z payloadami, zgadywanie haseł, testowanie autoryzacji na cudzych danych, wysyłanie formularzy, zmiany danych, obejście logowania, enumeracja ukrytych ścieżek, poszukiwanie `.env`/`.git` i kopii baz, eksploatacja CVE, testy obciążeniowe. Potwierdzanie takich podatności należy do przyszłego, osobno autoryzowanego modułu.

## Jak czytać wyniki (ważne zastrzeżenia)

- Brak CSP **nie** jest potwierdzonym XSS.
- Ujawniona nazwa technologii **nie** jest potwierdzeniem podatności.
- Klucz przeznaczony do publikacji **nie** staje się automatycznie sekretem.
- Kod `403`, `429`, timeout lub blokada robota **nie** oznaczają luki.
- **Brak zaobserwowanych problemów nie oznacza, że aplikacja jest bezpieczna.**
- Przerwanie z powodu limitu oznacza **wynik częściowy**, a nie brak problemów.

## Limity (na aplikację)

≤ 10 żądań HTTP (łącznie z `robots.txt` i przekierowaniami), 10 s na żądanie, ≤ 5 przekierowań, ≤ 1 MB rozpakowanej treści, oraz łączny limit czasu kontroli. Globalnie: 2 równoległe żądania, ≥ 5 s między żądaniami do tego samego hosta. Respektujemy `Retry-After`; nie ponawiamy bez końca i nie obchodzimy `401`/`403`/`429`/CAPTCHA. `robots.txt` jest respektowany tam, gdzie dotyczy — ale **nie** jest zgodą prawną na dowolne wykorzystanie treści.
