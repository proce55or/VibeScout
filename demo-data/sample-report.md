> DANE DEMONSTRACYJNE (syntetyczne)

# Raport VibeScout: Habitly (DEMO)

- **Adres aplikacji:** https://habits.example
- **Źródło odkrycia:** hackernews (https://news.ycombinator.com/item?id=0)
- **Data publikacji ogłoszenia:** 2026-10-10T08:00:00.000Z
- **Czas kontroli:** 2026-10-15T09:00:05.000Z → 2026-10-15T09:00:09.000Z
- **Adres IP (zweryfikowany):** 203.0.113.10

## Klasyfikacja pochodzenia
- **Ocena:** autor deklaruje stworzenie przy pomocy AI
- **Zadeklarowane narzędzie:** Claude Code
- **Poziom pewności:** wysoka
- **Język deklaracji:** en
- **Fragment uzasadniający (zredagowany):** „I built this habit tracker with Claude Code over a weekend. Feedback welcome!"

## Zakres kontroli
- **Wykonano:** A. HTTPS i certyfikat; C. Nagłówki bezpieczeństwa; D. Atrybuty cookies
- **Pominięto/niepełne:** B. Przekierowanie HTTP→HTTPS; E. Odwołania http:// w HTML (mixed content); F. Ujawnienia diagnostyczne

> Zakres poza v1 (NIE wykonywano): SQL injection, XSS z payloadami, zgadywanie haseł, enumeracja ścieżek, poszukiwanie .env/.git, eksploatacja CVE, testy obciążeniowe. To nie jest pentest ani gwarancja bezpieczeństwa.

## Obserwacje
### [A] HTTPS i certyfikat
- **Stan wykonania:** wykonano
- **Waga:** informacja
- **Zaobserwowano:** HTTPS dostępne, certyfikat zweryfikowany dla hosta.
- **Dowód (zredagowany):** CN=*.example; ważny do=Jan 1 2027; protokół=TLSv1.3
- **Można wnioskować:** Połączenie szyfrowane, certyfikat poprawny.
- **Nie potwierdzono:** Nie oceniano konfiguracji TLS (wersje, szyfry).
- **Sugerowany krok:** —

### [C] Nagłówek: Content-Security-Policy
- **Stan wykonania:** wykonano
- **Waga:** informacja
- **Zaobserwowano:** obecna polityka wymuszająca CSP
- **Dowód (zredagowany):** csp
- **Można wnioskować:** Zdefiniowano politykę CSP.
- **Nie potwierdzono:** Brak CSP nie jest potwierdzonym XSS.
- **Sugerowany krok:** —

### [D] Cookie: sid
- **Stan wykonania:** wykonano
- **Waga:** informacja
- **Zaobserwowano:** Secure=tak, HttpOnly=tak, SameSite=Lax
- **Dowód (zredagowany):** atrybuty cookie (bez wartości)
- **Można wnioskować:** Cookie ma atrybut Secure.
- **Nie potwierdzono:** Nie zapisujemy wartości cookies.
- **Sugerowany krok:** —

## Podsumowanie
**nie zaobserwowano wskazanych problemów.**

Budżet: 3 żądań, 1 przekierowań, 4096 B, 3800 ms.

_Wygenerowano: 2026-10-15T16:20:38.025Z. Raport prywatny, do użytku autora._