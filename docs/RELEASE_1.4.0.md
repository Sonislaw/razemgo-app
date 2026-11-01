# RazemGo 1.4.0 — uporządkowanie aplikacji

## Zakres

Wydanie przenosi aktualny kod Dev do Preview i obejmuje [poprawki po przeglądzie architektury](ARCHITECTURE_FIXES_2026_10_31.md). Zachowuje wygląd, porcje po pięć i powrót do karty po zamknięciu szczegółów.

- Synchronizacja rozróżnia zmiany skrzynki, powiadomień, ulubionych i własnych wyjazdów; nie pobiera ponownie niezmienionych domen.
- Listy uzgadniają wczytany zakres również po wstawieniu, usunięciu lub zmianie kolejności rekordów między stronami. Katalog ekip korzysta ze wspólnego kontrolera paginacji.
- Nieaktywne ekrany zwalniają obserwacje reakcji i obecności. Cache szczegółów własnych wyjazdów ma limit, niezależny od wcześniej wczytanych stron.
- Ekrany logowania i zgłoszeń korzystają z repozytoriów. Obsługa reakcji wiadomości ma osobny kontroler; kontrola źródeł pilnuje granic warstw.
- Zaktualizowano sześć zgodnych pakietów Expo SDK 58. Aktualizacja Dev wymaga nowego APK.

W Preview pojawiają się też wcześniejsze, zatwierdzone zmiany Dev: obowiązkowy skład konkretnego wyjazdu, wyszukiwanie bez etykiet i rankingu oraz uproszczenie preferencji. Automatyczne powiadomienia o propozycjach pozostają. [Zgodność kontraktów](API_COMPATIBILITY.md).

## Backend

Na Preview wdrożono siedem nowych migracji, od `202610310001_recommendations.sql` do `202610310007_sync_domains.sql`. Poprzednich migracji nie zmieniano. Dev i Preview mają po **42 migracje**. Kod Edge Functions nie zmienił się w tej paczce i nie wymagał ponownego wdrożenia.

Przed wdrożeniem zapisano lokalną, ignorowaną kopię 33 tabel aplikacji i identyfikatorów kont. Porównanie po wdrożeniu potwierdziło zachowanie **34 kont, 34 profili, 158 ogłoszeń, 48 wiadomości, 7 zaproszeń, 5 rozmów, 34 profili publicznych i administratora**. Dotychczasowe pola profili i wyjazdów są niezmienione. Kopia nie zawiera haseł Auth i nie jest sprawdzoną kopią pełnego odtworzenia projektu. Nie kopiowano danych Dev, nie resetowano Preview ani nie zmieniano konfiguracji Google, SMTP lub Firebase.

Weryfikacja po wdrożeniu: RLS na wszystkich tabelach aplikacji, brak uprawnień `anon` do funkcji publicznych, odmowa anonimowym wywołaniom dziewięciu RPC, działające publiczne ustawienia Auth oraz pięć aktywnych harmonogramów. Dispatcher i propozycje wykonały się poprawnie; brak zaległych zadań, błędów poświadczeń i oczekujących receipts. Harmonogramy pozostały bez zmian.

Usunięte preferencje „Kogo chcę poznać?” nie wracają. Historycznym wyjazdom nie przypisujemy składu obecnego profilu. Przy ich edycji trzeba uzupełnić rzeczywistych uczestników. Starsze APK wymagają aktualizacji do publikowania i edycji treści wyjazdów.

## Kontrole

- Lint, TypeScript, granice źródeł, kontrola sekretów i zgodność wersji: poprawne.
- **547/547 testów Node/PGlite**, **71/71 scenariuszy Playwright**, **5 testów Edge Functions z 12 krokami**. Pełny przebieg weryfikacyjny CI zakończył się poprawnie, łącznie z przeglądarką i eksportami.
- Expo Doctor **20/20**, pakiety zgodne z SDK 58, eksport Androida i webu poprawny.
- Rzeczywisty lokalny Supabase w CI: wszystkie migracje od pustej bazy, zgodność generowanych typów, Auth, PostgREST, izolacja kont, strony V3 i starsze kontrakty — poprawne. [Przebieg weryfikacyjny](https://github.com/Sonislaw/razemgo-app/actions/runs/41248069374).
- Eksport webowy z konfiguracją Preview: logowanie, chronione trasy, brak narzędzi Dev i filtrowany raport Sentry. API i telemetria w tej próbie były przechwycone.
- Metro na 8081: wersja 1.4.0, aplikacja Dev, aktualne odczyty V3 i właściwy backend; bez adresu backendu Preview i prywatnego tokena Sentry.

W pięciu wirtualnych minutach bez zmian nie pobierano ponownie skrzynki, historii, ulubionych ani listy własnych wyjazdów. Pojedyncza zmiana powiadomienia wywołała jeden odczyt tej domeny. Pomiary SQL wykonano na danych syntetycznych w PGlite. Nie ponawiano testu 200 sesji HTTP ani pomiarów hostowanego Preview.

Audyt zależności: brak high/critical; 27 wpisów moderate związanych z narzędziami Glob/Minimatch. Metro nadal zgłasza ostrzeżenie o wewnętrznym imporcie `expo-router` przez zależność Sentry i korzysta z rozwiązywania ścieżki plikowej; bundlowanie przechodzi. Nie modyfikowano plików dostawców w `node_modules`.

## Aplikacje Android

| | Preview | Dev |
| --- | --- | --- |
| Wersja | 1.4.0 | 1.4.0 |
| Numer kompilacji | 7 | 3 |
| Pakiet | `pl.razemgo.app.dev` | `pl.razemgo.app.development` |
| Działanie | Samodzielnie, bez Metro | Development Client z Metro |
| Build EAS | [7b2d5fc4](https://expo.dev/accounts/sonislaw/projects/razemgo/builds/7b2d5fc4-8d66-4a96-951a-96c693c4dfc4) | [35c3573d](https://expo.dev/accounts/sonislaw/projects/razemgo/builds/35c3573d-d06c-4d0d-945c-87efff4878e7) |
| APK | [Pobierz Preview](https://expo.dev/artifacts/eas/qzC8ScWDBEmp0ejO5FhiiS91xeQ_X2bYP3XDe800STk.apk) | [Pobierz Dev](https://expo.dev/artifacts/eas/OkBc8_8DSx4qUDoveek5kArSf-bps7-FKRKnelSgmm8.apk) |

Dev zakończył się `FINISHED` 31.10.2026 o 22:31 UTC. Pobrany APK ma wersję 1.4.0 (3), `debuggable=true`, Dev Launcher, schemat `razemgo-dev` i zasoby Firebase Dev bez zasobów Preview. Podpis jest identyczny jak w Dev 1.3.0. Rozmiar: 286 008 150 B, SHA-256 pliku: `218bb0bd24ad586b6533748fad6cf14f2750d75af92265b60cc145f7c230bdd2`.

Preview zakończyło się `FINISHED` 31.10.2026 o 22:35 UTC. Pobrany APK ma wersję 1.4.0 (7), `debuggable=false`, lokalny bundle JS i brak Dev Launchera. Potwierdzono konfigurację backendu, callback i zasoby Firebase Preview oraz brak backendu i zasobów Firebase Dev. Natywna inicjalizacja Sentry pozostaje wyłączona. Podpis jest identyczny jak w Preview 1.3.0: SHA-256 certyfikatu `940e42096e575610a5ccb398147c85237e9261066684f5b7a2f1c59d32ed9757`. Rozmiar APK: 122 103 918 B, SHA-256 pliku: `ec7e60fd07cda741f35404ca3898dcb86e11a0f25aee2aef0c9fd069f6acee56`.

W logach Preview potwierdzono udany upload map źródeł do Sentry, bez błędów uwierzytelnienia. Development korzysta z wariantu debug i Metro; nie potwierdzamy dla niego uploadu produkcyjnego bundla. Symbolikację konkretnego zdarzenia z telefonu trzeba sprawdzić osobno.

Instaluj APK na odpowiadającej mu aplikacji, bez odinstalowywania. Dev i Preview pozostają osobne. Metro Dev działa na porcie 8081; adres komputera w tej sieci to `http://192.168.1.27:8081` i może zmienić się wraz z siecią. Dalsza praca odbywa się na Dev.

Na fizycznym telefonie pozostają do sprawdzenia: aktualizacja APK, Google i powrót z przeglądarki, klawiatura, przewijanie oraz odbiór i otwieranie push. Natywne raporty awarii Sentry pozostają wyłączone ze względu na brak filtra odpowiadającego filtrowaniu prywatnych danych w JavaScript. Monitoring JS/backendu pozostaje aktywny.
