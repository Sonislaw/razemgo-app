# RazemGo Dev i Preview

31.10.2026 wyłącznie Dev otrzymał `202610310001_recommendations.sql` , `202610310002_remove_profile_preferences.sql` oraz `202610310003_trip_participants.sql` i `202610310004_trip_participant_guards.sql`: **39 migracji**, opisowe rekomendacje ogłoszeń i ekip oraz nowe odczyty V2. Preview zachowuje **35 migracji** i APK 1.3.0. Zmiana nie wymaga nowych modułów natywnych; Dev korzysta z Metro. [Reguły i weryfikacja rekomendacji](RECOMMENDATIONS.md).

Dwie aplikacje mają osobne identyfikatory, schematy linków logowania i konfiguracje Firebase. Można zainstalować je obok siebie. Współdzielą kod źródłowy i projekt EAS; każda ma osobny profil budowania i środowisko zmiennych EAS. Zmiana kodu ani uruchomienie Metro nie aktualizują samodzielnego APK Preview u testerów.

**Stan po wydaniu 1.3.0:** oba backendy mają **35 migracji**, przez `202610280009_relative_ranking_keys.sql`. Preview otrzymało 12 brakujących migracji i aktualne trzy Edge Functions, z zachowaniem danych testerów. Dev używa profilu `development` z `developmentClient=true` i Metro na porcie 8081. Preview pozostaje samodzielnym APK. Linki i kontrole wydania: [RELEASE_1.3.0.md](RELEASE_1.3.0.md). Niżej zachowano historię wcześniejszych wdrożeń.

| | Dev | Preview |
| --- | --- | --- |
| Nazwa nowego APK | RazemGo Dev | RazemGo Preview |
| Pakiet Androida | `pl.razemgo.app.development` | `pl.razemgo.app.dev` — zachowany z pierwszego APK |
| Link logowania | `razemgo-dev://auth/callback` | `razemgo://auth/callback` |
| Profil / środowisko EAS | `development` | `preview` |
| Konfiguracja lokalna | `.env.local` | `.env.preview.local` |
| Plik Firebase lokalnie | `google-services.development.json` | `google-services.json` |
| Supabase | `kswuakzcnoqgovnwejhb` — razemgo-development | `tueqqnbdvuazdxoqtpvk` — razemgo-dev |

Dotychczasowy projekt Supabase ma nazwę „razemgo-dev”, ale obsługuje zainstalowane Preview. Zachowano jego adres, konta, dane i działające funkcje. Po usunięciu „Sonislaw's Project” przez użytkownika utworzono osobny **razemgo-development** w `eu-west-3` (Paryż), 25.10.2026. Nie włączono płatnego planu.

26.10.2026 aktualny kod przeniesiono do wydania **Preview 1.1.0**. Preview otrzymało migracje `202610250001`–`202610250012` i aktualne Edge Functions; na moment wydania oba backendy miały 20 migracji. Zachowano dane testerów i odrębną konfigurację Auth, Firebase i push. Szczegóły wydania oraz status APK są w [RELEASE_1.1.0.md](RELEASE_1.1.0.md).

Na prośbę użytkownika 26.10.2026 przygotowano **Preview 1.2.0**. Migracje `202610260001_trip_discovery.sql`, `202610260002_group_pagination.sql` i `202610260003_group_trip_pagination.sql` są teraz w obu backendach: każdy ma 23 migracje. Dodają filtrowanie, ranking, licznik i stronicowanie wyjazdów oraz stronicowanie ekip i ogłoszeń w profilu. Listy pobierają po 5 elementów. Zachowano dane testerów; nie kopiowano kont ani przykładowych danych Dev. Zakres i wyniki kontroli opisano w [RELEASE_1.2.0.md](RELEASE_1.2.0.md), a API w [TRIP_DISCOVERY.md](TRIP_DISCOVERY.md) i [GROUPS.md](GROUPS.md).

27.10.2026 dodano wyłącznie do Dev migrację `202610270001_message_reactions.sql` oraz poprawkę stabilności rozmowy. Dev ma teraz **24 migracje**, Preview pozostaje przy **23** i zainstalowanym APK 1.2.0. Obsługę i weryfikację opisuje [CHAT_REACTIONS.md](CHAT_REACTIONS.md).

27.10.2026 Dev otrzymał również `202610270002_background_proposals.sql` i nową wersję `dispatch-push`: **25 migracji**, automatyczne propozycje co minutę i zbiorcze push w oknach pięciominutowych. Preview nadal ma **23 migracje** i nie otrzymał tego wdrożenia. Szczegóły: [PROPOSAL_NOTIFICATIONS.md](PROPOSAL_NOTIFICATIONS.md).

27.10.2026 w etapie 0 wdrożono na Dev `202610270003_proposal_health.sql` i nowy `monitor-push`: **26 migracji**. Monitor wykrywa także zatrzymanie procesora propozycji oraz zaległe zadania. Rzeczywisty odczyt potwierdził ograniczenie diagnostyki do roli serwerowej, aktywne harmonogramy, automatyczne wykonanie monitora i brak zaległości. Preview pozostaje przy **23 migracjach** i APK 1.2.0 (5). Etap 0 aktualizuje również sześć pakietów SDK 58, dlatego ma osobny build APK Dev; szczegóły w [STAGE_0.md](STAGE_0.md).

## Skonfigurowany Dev

28.10.2026 Dev otrzymał migracje `202610280001`–`202610280009` i aktualne trzy Edge Functions: **35 migracji**. Zmiany dodają lekkie podsumowania, strony skrzynki i własnych wyjazdów, kontrolę cache, optymalizację rankingu i blokady limitów zapisów. Następnie przeniesiono je do Preview 1.3.0. Profil EAS **`performance`** nadal tworzy samodzielny release APK z backendem Development i pakietem Dev; do bieżącej pracy używaj **`development`** i `npm run start:dev`. [Raport techniczny](ARCHITECTURE_HARDENING.md).

1. `.env.local` i środowisko EAS **development** mają URL oraz publiczny klucz nowego Dev. Dotychczasowe wartości zachowano w ignorowanym `.env.preview.local` i środowisku EAS **preview**. Nie wpisuj klucza administracyjnego do zmiennych `EXPO_PUBLIC_*`.
2. Dev ma własną aplikację Android w Firebase, plik `google-services.development.json`, osobny klucz podpisujący APK i przypisany klucz FCM V1. Powiązanie Firebase Preview pozostało bez zmian. Obie aplikacje używają tego samego projektu Firebase i usługi Expo Push, lecz osobnych instalacji oraz kolejek i tokenów przechowywanych w swoich bazach.
3. Na moment wydania 1.3.0 oba środowiska mają po 35 migracji, w tym reakcje na wiadomości, automatyczne propozycje i monitoring opisany w [STAGE_0.md](STAGE_0.md). Dostępne są funkcje `delete-account`, `dispatch-push`, `monitor-push`. Główny katalog CLI jest powiązany wyłącznie z Dev. Kolejne zmiany wdrażaj jawnie:

   ```powershell
   npm run backend:dev -- link
   npm run backend:dev -- plan
   npm run backend:dev -- migrate
   npm run backend:dev -- deploy
   ```

   `link` przypisuje główny katalog CLI do Dev, dzięki czemu dotychczasowe skrypty konfiguracji push i diagnostyki wskazują jego bazę. Dla Preview ta akcja jest zablokowana. Pozostałe polecenia używają odrębnych katalogów roboczych CLI.

4. Google i potwierdzanie e-maila są włączone. Dev dopuszcza `razemgo-dev://auth/callback` oraz `razemgo-dev://auth/callback?flow=recovery`. Użytkownik potwierdził dopisanie `https://kswuakzcnoqgovnwejhb.supabase.co/auth/v1/callback` w Google Cloud, z zachowaniem callbacku Preview. Konta i profile nie były kopiowane — pierwsze logowanie tworzy nowe konto Dev i wymaga uzupełnienia profilu.

   **Client Secret musi pochodzić z Google Cloud i odpowiadać ustawionemu Client ID.** Oba środowiska korzystają obecnie z tego samego klienta OAuth; przy zmianie jego sekretów sprawdź konfigurację obu projektów Supabase. API Supabase zwraca dla `external_google_secret` skrót, którego nie można kopiować do innego projektu jako sekretu. Automatyczne kopiowanie sekretów w skrypcie przygotowawczym jest wyłączone. Zmiana tych ustawień backendu nie wymaga nowego APK.
5. Własny SMTP nie był skonfigurowany w dotychczasowym projekcie. Dev korzysta z domyślnej wysyłki Supabase i jej ograniczeń. API nowego projektu odrzuca zmianę szablonów e-maila bez własnego SMTP, więc nie skopiowano polskich szablonów. Do szerszych testów rejestracji e-mailem skonfiguruj SMTP w Dev; Google nie zależy od tej wysyłki.
6. Dev ma nowy, niezależny klucz dispatchera w Vault i sekretach funkcji, harmonogram wysyłki co minutę i kontrolę co pięć minut. Backend raportuje w Sentry jako **`dev`**, monitor **`razemgo-push-health-dev`**. Preview historycznie raportuje jako **`development`**, monitor **`razemgo-push-health`** — nie zmieniono jego wdrożenia. Reguły alertów dla Dev wymagają osobnego wyboru środowiska `dev`. Aplikacja mobilna Dev raportuje do projektu aplikacji jako `development`, a Preview jako `preview`.
7. Sprawdź konfigurację i uruchom Dev:

   ```powershell
   npm run check:dev
   npm run build:dev
   npm run start:dev
   ```

APK Dev używa osobnego pakietu i instaluje się obok Preview. `start:dev` używa schematu `razemgo-dev`, aby QR otwierał właściwą aplikację. Preview działa samodzielnie; Dev wymaga uruchomionego Metro. Zmiana modułów natywnych, pakietu lub konfiguracji pluginów wymaga nowego APK Dev; samo odświeżenie Metro aktualizuje kod JavaScript.

Rolę administratora nadaj po pierwszym zalogowaniu do Dev: `node scripts/manage-admin.mjs grant ADRES_POTWIERDZONEGO_KONTA`. Administratorzy nie są kopiowani między bazami.

## Pierwsze APK Dev

[Pobierz RazemGo Dev 1.0.0 (1)](https://expo.dev/artifacts/eas/npzArKRcfEn1n43nAUDyr3GGfG662gcQGptMAq8-OUM.apk). [Build EAS](https://expo.dev/accounts/sonislaw/projects/razemgo/builds/be2b8c07-2f05-4cbf-8a96-7f4fd8717fbf) zakończył się `FINISHED` 25.10.2026.

Po pobraniu zweryfikowano manifest APK: `pl.razemgo.app.development`, nazwa `RazemGo Dev`, wersja `1.0.0`, versionCode `1`, tryb deweloperski, Dev Launcher i schemat `razemgo-dev`. Zasoby zawierają właściwą konfigurację nowej aplikacji Firebase, bez identyfikatora aplikacji Firebase Preview. APK ma 285 794 474 bajty; SHA-256: `1034dcec829cf9ba9e644f0e0cc1a774f5f30633fdab4b445588115bb45fda73`.

Zainstaluj obok obecnego Preview, uruchom `npm run start:dev` i połącz Dev z adresem Metro pokazanym w terminalu. Telefon i komputer powinny być w tej samej sieci Wi-Fi. Pierwsze logowanie Google w Dev prowadzi do utworzenia profilu ekipy.

## Weryfikacja 25.10.2026

Przeszły lint, TypeScript, 261 testów Node, 22 testy Playwright, cztery testy Edge Functions z dziesięcioma krokami oraz wszystkie 20 kontroli Expo Doctor. Zależności odpowiadają SDK 58. Sześć transakcyjnych kontroli SQL na prawdziwym Dev potwierdziło wyjazdy, wiadomości, moderację, historię powiadomień i push; ich zmiany zostały wycofane.

Test API na trzech tymczasowych kontach potwierdził logowanie hasłem, zaproszenia, akceptację, czat, ponowienia, odczyty, blokowanie, zgłoszenia i izolację Realtime. Konta oraz powiązane dane testowe usunięto. Preview odrzuca klucz API Dev. Publiczne ustawienia Auth obu środowisk odpowiadają poprawnie, a przekierowanie Google Dev prowadzi do nowego callbacku Supabase.

Metro udostępnia manifest pakietu Dev i bundle Androida z adresem nowego backendu, bez adresu Preview. Potwierdzono także automatyczne uruchomienie kontroli push przez cron oraz heartbeat Sentry z HTTP 200. Użytkownik potwierdził na telefonie poprawne logowanie Google w Dev i Preview po ustawieniu właściwych danych klienta OAuth. Odbiór push w nowej aplikacji Dev nadal wymaga potwierdzenia na telefonie; testy na komputerze go nie zastępują.

## Codzienna praca i publikacja dla testerów

Pracujemy w Dev. Nowe funkcje i migracje testujemy na jego danych. Preview nadal korzysta z zatwierdzonego APK i własnej bazy. Przy gotowym wydaniu:

Przed nowym wydaniem podnieś wersję: `npm run version:patch` dla poprawek, `npm run version:minor` dla nowych funkcji lub `npm run version:major` dla wydania niezgodnego wstecz. Polecenie aktualizuje jednocześnie `package.json`, `package-lock.json` oraz `app.json`; nie tworzy commita ani tagu. Ponowienie tej samej niezmienionej wersji po błędzie budowy nie wymaga kolejnego podbijania wersji. `npm run version:check` kontroluje spójność; uruchamia się też przed poleceniami `build:dev`, `build:performance`, `build:preview` oraz w CI.

Na dole **Profil → Ustawienia** widoczna jest nazwa aplikacji, wersja i numer kompilacji, np. `RazemGo Dev` / `Wersja 1.2.1 · kompilacja 2`. Android/iOS odczytuje te wartości z zainstalowanego APK/IPA; samo przeładowanie kodu przez Metro nie zmienia numeru zainstalowanej aplikacji. Web wyświetla wersję z konfiguracji, bez fikcyjnego numeru kompilacji. EAS używa `autoIncrement=true` również dla Development i dziedziczącego po nim profilu `performance`; Preview zachowuje własny dotychczasowy licznik i pakiet. Zmiana konfiguracji przyszłych buildów nie aktualizuje istniejących APK.

Weryfikacja stopki 28.10.2026: lint, TypeScript, zgodność trzech plików wersji oraz dwa istniejące scenariusze Playwright przeszły; ślad DOM potwierdził tekst wersji `1.2.0`. Na odizolowanej kopii sprawdzono aktualizacje patch/minor/major i odmowę niespójnych wersji. `expo-application ~58.1.2` jest zgodne z SDK 58; moduł tej wersji był już obecny w logu autolinkowania APK Dev `b170e37a`. Globalna kontrola `expo install --check` wskazała tymczasem 12 nowych zalecanych aktualizacji poprawek istniejących zależności Expo. Nie włączono ich do zmiany stopki i wersjonowania; wymagają osobnej kontroli przed kolejnym wydaniem natywnym.

1. Uruchom lint, TypeScript, testy i kontrole Expo. Przetestuj dwa konta oraz migracje od pustej bazy i na istniejących danych.
2. Sprawdź zakres migracji do Preview: `npm run backend:preview -- plan`. Skrypty tworzą odrębne katalogi robocze CLI w `.expo/`; nie przepinają głównego repozytorium na bazę testerów.
3. W uzgodnionym oknie wdrożenia uruchom `npm run backend:preview -- migrate` i `npm run backend:preview -- deploy`. Te polecenia nie przenoszą kont, wiadomości, sekretów ani konfiguracji Auth. Nowe ustawienia serwera trzeba wdrożyć osobno. Zmiany bazy muszą zachować zgodność ze starym APK do chwili jego wymiany.
4. Uruchom `npm run check:preview -- --online`, a następnie `npm run build:preview`. Sprawdź nowe APK i przekaż testerom link do konkretnego wydania. EAS zwiększa Android versionCode; pakiet Preview i podpis pozostają bez zmian.

Możliwość wyczyszczenia danych testowych nie oznacza automatycznego resetu przy budowaniu APK. Jeśli zmiana wymaga resetu, wykonujemy go jako osobne, świadome wdrożenie z uwzględnieniem kont Auth, cron i sekretów Vault. Nie uruchamiaj `db reset --linked` w ciemno.

Konfiguracja blokuje Dev wskazujący Supabase Preview oraz Preview wskazujący inny backend. Główny link CLI do starej bazy przeniesiono lokalnie do `.expo/environments/preview-cli-temp`, aby zwykłe `supabase db push` nie trafiło przypadkiem do testerów. Nie przywracaj go do głównego katalogu; używaj poleceń z jawnym środowiskiem.

Źródła: [warianty aplikacji Expo](https://docs.expo.dev/build-reference/variants/), [zmienne EAS](https://docs.expo.dev/eas/environment-variables/usage/).
