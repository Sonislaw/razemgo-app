# Etap 0 — Dev

Zakres: aktualizacje poprawek SDK 58, komunikaty kontaktów, skróty prywatności, monitoring propozycji i automatyczne kontrole. Nie obejmuje zapisanych wyszukiwań ani wydania Preview.

## Aplikacja

| Pakiet | Wcześniej | Teraz |
| --- | --- | --- |
| `expo` | 58.0.19 | 58.0.20 |
| `@expo/ui` | 58.0.23 | 58.0.24 |
| `expo-auth-session` | 58.0.14 | 58.0.15 |
| `expo-dev-client` | 58.0.15 | 58.0.16 |
| `expo-router` | 58.0.26 | 58.0.27 |
| `expo-web-browser` | 58.0.6 | 58.0.7 |

Pakiety zaktualizowano przez `npx expo install`. Instalator wymagał jawnego wpisu pluginu `expo-web-browser`; dodano go do `app.json`, zachowując dynamiczną konfigurację wariantów. Zmiany natywne wymagają nowego APK Dev.

Eksporty Androida i webu nadal zgłaszają ostrzeżenie resolvera `expo-router` dotyczące `build/global-state/router-store`. Oba kończą się poprawnie. Nie zmieniamy sposobu rozwiązywania modułów ani zawartości `node_modules`, żeby maskować ostrzeżenie zależności.

W szczegółach własnego wyjazdu sekcja i licznik opisują kontakty powstałe po zaakceptowaniu zaproszeń. Nie potwierdzają udziału w wyjeździe. W ustawieniach są rzeczywiste skróty do profilu publicznego i zablokowanych ekip; usunięto zapowiedzi niedostępnych ustawień. Historyczne opisy prototypu przeniesiono z README do `docs/archive/`.

## Monitoring propozycji

Migracja `202610270003_proposal_health.sql` rozszerza dotychczasowe RPC `get_push_health()`. Istniejące pola i kontrola dostaw pozostają dostępne. Nowe pola:

- `proposal_pending`, `proposal_overdue`: liczba zadań i liczba zadań oczekujących ponad dziesięć minut.
- `proposal_schedule_ok`: aktywne zadanie `razemgo-proposals` z harmonogramem co minutę.
- `proposal_tick_ok`: sukces procesora w ostatnich pięciu minutach. Pierwsze pięć minut po instalacji daje czas na pierwszy sukces; świeży błąd nie zastępuje sukcesu.
- `last_proposal_tick`: czas ostatniego sukcesu lub `null`. Przyszłe czasy nie są uznawane za sukces.

`first_queued_at` przechowuje początkowy czas oczekiwania niezależnie od `queued_at` używanego do kolejności pracy. Starsze zadania otrzymują swój dotychczasowy czas. Zmiana wyjazdu i kontynuowanie zadania po limicie 200 wyników nie odmładzają go. Migracja nie przetwarza propozycji, nie tworzy alertów dla użytkowników i nie odtwarza zaległych powiadomień.

| Kod Sentry | Warunek |
| --- | --- |
| `PROPOSAL_SCHEDULE_INVALID` | Brak aktywnego harmonogramu co minutę lub inny harmonogram. |
| `PROPOSAL_PROCESSOR_STOPPED` | Brak sukcesu przez ponad pięć minut, po okresie początkowym. |
| `PROPOSAL_QUEUE_STALLED` | Zadanie oczekuje ponad dziesięć minut od pierwszego dodania. |

Istniejący `monitor-push` sprawdza również te dane co pięć minut. Wykrycie przekroczenia progu następuje przy najbliższym sprawdzeniu, nie dokładnie w chwili przekroczenia. Alarmy korzystają z dotychczasowej rezerwacji na dwie minuty, godzinnego limitu przyjętych raportów i pięciominutowego odstępu po nieudanym zgłoszeniu. Sentry otrzymuje tylko kod incydentu i bezpieczny kontekst. Nie odczytujemy do raportu poleceń Cron ani danych ekip.

Nowy monitor wymaga wszystkich pól propozycji. Brak migracji powoduje nieudany heartbeat, zamiast udawać zdrowy system. Stary monitor może odczytać rozszerzoną odpowiedź w trakcie wdrożenia, dlatego najpierw wdrażamy migrację, potem funkcję.

## GitHub Actions

Workflow `.github/workflows/ci.yml` uruchamia się dla push, pull requestów i ręcznie. Używa Node 24 i `npm ci`, ma wyłącznie uprawnienie `contents: read`, nie zachowuje poświadczeń checkout i nie używa sekretów repozytorium.

Dwa zadania wykonują kontrole kodu/bazy/Edge Functions/eksportów oraz scenariusze przeglądarkowe. Przeglądarka Chromium jest instalowana przez Playwright. Nieudane scenariusze zachowują ślady i zrzuty z `.expo/auth-web-results/` przez siedem dni. Do artefaktów nie trafia cały katalog `.expo`, pliki środowisk ani lokalne raporty prawdziwych kont.

CI nie uruchamia migracji, EAS Build, wysyłki push ani wdrożenia funkcji. Node i PGlite pracują lokalnie, przeglądarka używa kontrolowanego API, a testy Edge przechwytują transport. Workflow zacznie wykonywać się na GitHub po wysłaniu zmiany do repozytorium.

## Kontrole i granice weryfikacji

Nowe testy obejmują rzeczywistą migrację na istniejącej kolejce, granice progów, okres początkowy, błędne i brakujące harmonogramy, kontynuację po 200 wynikach, rezerwacje alarmów, retry, ochronę danych i odmowę dostępu dla `anon` i `authenticated`. Testy Edge sprawdzają również raport propozycji w Sentry i brak migracji. Dwa scenariusze przeglądarkowe sprawdzają skróty prywatności oraz kontakty w wyjeździe.

Testy Google/PKCE w przeglądarce korzystają z kontrolowanego dostawcy. Weryfikacja prawdziwego Google, systemowej klawiatury i FCM wymaga telefonu; nie jest zastępowana przez eksport ani testy komputerowe.

`npm audit` wykrywa trzy pozycje o wysokiej istotności związane z jednym zgłoszeniem Zod w zależnościach Expo CLI. Wersje Zod przed i po tej aktualizacji są takie same. Sugerowane `npm audit fix --force` cofa Expo do SDK 54, dlatego go nie stosujemy. Ten istniejący problem narzędzia wymaga zgodnej poprawki zależności upstream; nie oznacza trzech nowych podatności wprowadzonych przez tę paczkę.

## Wdrożenie

Docelowy projekt: wyłącznie Supabase Dev `kswuakzcnoqgovnwejhb`. Preview `tueqqnbdvuazdxoqtpvk` zachowuje swoje migracje, funkcje, konfigurację i APK.

1. Kontrole lokalne i `npm run backend:dev -- plan`: oczekiwana jest jedna nowa migracja.
2. `npm run backend:dev -- migrate`.
3. Wdrożenie wyłącznie `monitor-push`, następnie odczyt agregatów i kontrola autoryzacji/heartbeat.
4. Nowy build EAS `development`, kontrola manifestu, pakietu, schematu i zasobów Firebase.
5. Instalacja APK Dev na telefonie oraz Google, powrót do aplikacji, klawiatura i push.

## Wynik kontroli i wdrożenia — 27.10.2026

- Lint, TypeScript, **446 testów Node** oraz **4 testy Edge Functions z 12 krokami** przeszły.
- Pełny przebieg przeglądarki miał **56 poprawnych scenariuszy i jeden nieudany**. Ślad potwierdził odbiór 50 i kolejnych 15 wiadomości; najstarsza była poza oknem renderowania listy. Test poprawiono tak, żeby po doładowaniu przewijał historię, zachowując wymaganą stabilność czytanego miejsca. Ponowny przebieg wszystkich trzech scenariuszy wiadomości przeszedł. Wszystkie **57 różnych scenariuszy** zostało zweryfikowanych; nie jest to deklaracja jednego przebiegu 57/57.
- Dwa scenariusze etapu 0 dodatkowo ponowiono po dopracowaniu powrotu z ustawień prywatności; oba przeszły. Wejście do zablokowanych ekip z ustawień wraca teraz do ustawień, a dotychczasowe wejście z rozmów zachowuje swój powrót.
- Expo Doctor: **20/20**; `expo install --check`: zależności zgodne. Kontrola izolacji Dev przeszła.
- Końcowe eksporty Androida i webu przeszły. Zawierają adres backendu Dev i nie zawierają adresu backendu Preview.
- Czyste `npm ci` w osobnym, ignorowanym katalogu przeszło; Sentry CLI, natywny resolver ESLint i Expo CLI działają po świeżej instalacji. Nie zastępowano głównego `node_modules`. YAML workflow został lokalnie sprawdzony; sam GitHub Actions uruchomi się po pushu.
- Wdrożono wyłącznie nową migrację i `monitor-push` do Dev. API potwierdziło **26 migracji**, brak zaległości i aktywny procesor. Rola `authenticated` nie ma dostępu do diagnostyki, a anonimowy REST otrzymuje **401 / 42501**. Wywołanie monitora potwierdziło przyjęty heartbeat Sentry **HTTP 200**, bez alarmów.
- Kolejna kontrola bazy potwierdziła automatyczne wykonanie monitora z harmonogramu o **20:20 UTC**, niezależnie od wcześniejszego ręcznego sprawdzenia. Dane kontrolne są w ignorowanym `.expo/stage-zero-live-check.local.json`, bez sekretów i treści użytkowników.
- Nie wykonano żadnego wdrożenia ani resetu Preview. Nie uruchamiano etapu 1.

### APK Dev

[Build EAS 1.2.0 (1)](https://expo.dev/accounts/sonislaw/projects/razemgo/builds/a1cd5a61-ce0f-4d7b-bd15-8c11369bf17b) został zlecony jako `development`, dla Androida. Na czas sporządzenia tego wpisu oczekuje w kolejce EAS.

Na komputerze uruchomiono ukryty proces `.expo/watch-stage-zero-apk.mjs`. Sprawdza wyłącznie to istniejące zlecenie; nie tworzy następnych buildów. Po zakończeniu pobiera APK i weryfikuje pakiet `pl.razemgo.app.development`, wersję, schemat `razemgo-dev`, Dev Launcher, właściwe zasoby Firebase oraz zgodność podpisu z wcześniejszym APK Dev. Wynik zapisuje w ignorowanym `.expo/stage-zero-apk-watch.local.json`: dopiero `stage: verified` oznacza pomyślną inspekcję. Wtedy zawiera również link do APK, rozmiar i SHA-256. Proces kończy się po wyniku lub po 90 minutach oczekiwania; nie instaluje aplikacji i nie edytuje śledzonych plików repozytorium.

Google na prawdziwym koncie, systemowa klawiatura i fizyczny odbiór push na nowym APK pozostają oddzielną kontrolą na urządzeniach. W tej sesji nie ma podłączonego telefonu do wykonania tych prób.
