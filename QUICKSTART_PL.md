# VibeScout — instrukcja uruchomienia (dla osoby bez doświadczenia)

Ta instrukcja prowadzi krok po kroku. VibeScout to **lokalny** program: działa na Twoim komputerze, panel widać w przeglądarce pod adresem `http://127.0.0.1:4317`. Nic nie jest wystawiane do internetu.

> **Ważne, uczciwe zastrzeżenia:**
> - VibeScout wykonuje **ograniczone, publiczne** sprawdzenia stron. **To nie jest pentest ani gwarancja bezpieczeństwa.** Brak zaobserwowanych problemów nie oznacza, że aplikacja jest bezpieczna.
> - Program działa tylko, gdy jest uruchomiony, a komputer jest włączony i nie śpi. Zamknięcie karty przeglądarki nie zatrzymuje backendu; zatrzymanie procesu/uśpienie komputera — tak.
> - Sam kod na GitHubie to nie jest działający serwer.

---

## 1. Czego potrzebujesz

- **macOS** (działa też na Intel Macu i starszym systemie) — oraz **Node.js w wersji 20 lub 22** (zalecana 22 LTS).
- Sprawdź, czy masz Node:
  ```bash
  node -v
  ```
  Jeśli pokaże `v20.x` lub `v22.x` — jest dobrze. Jeśli polecenie nie działa lub wersja jest starsza niż 20, zainstaluj Node 22 LTS:
  - najprościej: pobierz instalator ze strony <https://nodejs.org> (wersja **LTS**), zainstaluj, zamknij i otwórz Terminal ponownie.
  - (Program nie zmienia ustawień Twojego systemu i nie aktualizuje go samodzielnie.)

## 2. Pobranie projektu

Masz dwie możliwości:

- **Folder od autora** — jeśli dostałeś gotowy folder `VibeScout`, po prostu go otwórz w Terminalu:
  ```bash
  cd ~/Downloads/VibeScout
  ```
- **Z GitHuba** (jeśli masz tam repozytorium):
  ```bash
  git clone https://github.com/proce55or/VibeScout.git
  cd VibeScout
  ```

## 3. Instalacja (jednorazowo)

W folderze projektu wpisz:

```bash
npm install
```

To pobierze biblioteki. Potrwa chwilę.

> Jeśli zobaczysz błąd dotyczący `better-sqlite3` (kompilacja), zainstaluj narzędzia programistyczne Apple i spróbuj ponownie:
> ```bash
> xcode-select --install
> npm install
> ```

## 4. Uruchomienie

Najprościej — skrypty dla macOS (klikalne w Finderze lub z Terminala):

```bash
./start.command     # buduje (jeśli trzeba) i uruchamia, otwiera panel w przeglądarce
./stop.command      # zatrzymuje TYLKO proces tej aplikacji
```

Albo ręcznie:

```bash
npm run build       # jednorazowo po instalacji i po każdej aktualizacji
npm start           # uruchamia program
```

Następnie otwórz w przeglądarce: **http://127.0.0.1:4317**

### Chcesz najpierw zobaczyć, jak to wygląda, bez sieci?

Tryb demo używa danych syntetycznych i **wyłącza** kontrole sieciowe:

```bash
VIBESCOUT_DEMO=1 npm start
```

Kliknij **Start** w panelu — zobaczysz przykładowe projekty, klasyfikację i raporty, bez żadnych prawdziwych żądań.

## 5. Jak używać panelu

1. **Panel → Przebieg:** wybierz źródła (domyślnie Hacker News), ustaw zakres dat i limity, kliknij **Start**.
2. Program sam przejdzie łańcuch: pobranie ogłoszeń → klasyfikacja → kolejka → kontrole A–F → raport → powiadomienie. Możesz **Pauza/Wznów/Stop**.
3. **Lista projektów:** filtruj po źródle, pochodzeniu, pewności, statusie i wyniku kontroli. Kliknij projekt, by zobaczyć dowody, obserwacje i pobrać raport (HTML / Markdown / JSON).
4. **Źródła i dane:** dodaj kanały RSS, wyklucz domeny, dodaj projekt ręcznie, zaimportuj listę z CSV/JSON (z podglądem przed dodaniem).
5. **Powiadomienia:** trwałe, widoczne także po ponownym otwarciu panelu.

## 6. Zatrzymywanie

- W oknie Terminala, gdzie działa program: naciśnij **Ctrl + C**.
- Albo uruchom `./stop.command` (zatrzyma wyłącznie proces VibeScout, po numerze PID z pliku `vibescout.pid`).

## 7. Aktualizacja

```bash
git pull            # jeśli pobierasz z GitHuba
npm install         # gdyby doszły nowe biblioteki
npm run build
npm start
```

## 8. Gdzie są moje dane

- Dane robocze (baza SQLite, powiadomienia) są **poza** folderem projektu, w katalogu aplikacji systemu:
  `~/Library/Application Support/VibeScout`.
- Domyślna retencja: **30 dni** (stare projekty i raporty są usuwane). Możesz też usuwać dane ręcznie w panelu.
- Raporty o cudzych aplikacjach, logi i baza **nie trafiają** do repozytorium / na GitHub.

## 9. Typowe problemy

- **„Panel dostępny tylko lokalnie"** — otwieraj wyłącznie `http://127.0.0.1:4317` (nie przez inny adres/hosta).
- **Port zajęty** — zmień port: `VIBESCOUT_PORT=4318 npm start`.
- **Pusto po Starcie, a konektor zgłasza błąd** — zajrzyj do zakładki **Powiadomienia** i do stanu konektorów w **Źródła i dane**. Zerowa liczba wyników nie ukrywa problemów — błędy są pokazywane.
- **„Osiągnięto dobowy limit kontroli"** — to celowe zabezpieczenie (domyślnie 20 aplikacji/dobę). Reszta zostaje w kolejce na kolejny przebieg.
- **Nie działa `better-sqlite3`** — patrz uwaga w punkcie 3 (`xcode-select --install`).

## 10. Konfiguracja (opcjonalnie)

Skopiuj `.env.example` do `.env` i zmień wartości (port, limity, retencja, katalog danych). Opcjonalny adapter LLM jest **domyślnie wyłączony** — wersja podstawowa działa bez żadnego klucza API.

---

Masz pytanie lub coś nie działa? Zajrzyj do [`docs/CHECKS_PL.md`](./docs/CHECKS_PL.md) (co dokładnie sprawdzamy i jak czytać wyniki) oraz [`ARCHITECTURE.md`](./ARCHITECTURE.md).
