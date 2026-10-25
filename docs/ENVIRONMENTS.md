# RazemGo Dev i Preview

Dwie aplikacje mają osobne identyfikatory, schematy linków logowania i konfiguracje Firebase. Można zainstalować je obok siebie. Współdzielą kod źródłowy i projekt EAS; każda ma osobny profil budowania i środowisko zmiennych EAS. Zmiana kodu ani uruchomienie Metro nie aktualizują samodzielnego APK Preview u testerów.

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

## Skonfigurowany Dev

1. `.env.local` i środowisko EAS **development** mają URL oraz publiczny klucz nowego Dev. Dotychczasowe wartości zachowano w ignorowanym `.env.preview.local` i środowisku EAS **preview**. Nie wpisuj klucza administracyjnego do zmiennych `EXPO_PUBLIC_*`.
2. Dev ma własną aplikację Android w Firebase, plik `google-services.development.json`, osobny klucz podpisujący APK i przypisany klucz FCM V1. Powiązanie Firebase Preview pozostało bez zmian. Obie aplikacje używają tego samego projektu Firebase i usługi Expo Push, lecz osobnych instalacji oraz kolejek i tokenów przechowywanych w swoich bazach.
3. Wdrożono osiem migracji i funkcje `delete-account`, `dispatch-push`, `monitor-push`. Główny katalog CLI jest powiązany wyłącznie z Dev. Kolejne zmiany wdrażaj jawnie:

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

Nowy pakiet i linki wymagają nowego APK Dev. Dotychczasowy development build używa tego samego pakietu co Preview i nie staje się odrębną aplikacją po samym odświeżeniu Metro. `start:dev` używa schematu `razemgo-dev`, aby QR otwierał właściwą aplikację. Preview działa samodzielnie; Dev wymaga uruchomionego Metro.

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

1. Uruchom lint, TypeScript, testy i kontrole Expo. Przetestuj dwa konta oraz migracje od pustej bazy i na istniejących danych.
2. Sprawdź zakres migracji do Preview: `npm run backend:preview -- plan`. Skrypty tworzą odrębne katalogi robocze CLI w `.expo/`; nie przepinają głównego repozytorium na bazę testerów.
3. W uzgodnionym oknie wdrożenia uruchom `npm run backend:preview -- migrate` i `npm run backend:preview -- deploy`. Te polecenia nie przenoszą kont, wiadomości, sekretów ani konfiguracji Auth. Nowe ustawienia serwera trzeba wdrożyć osobno. Zmiany bazy muszą zachować zgodność ze starym APK do chwili jego wymiany.
4. Uruchom `npm run check:preview -- --online`, a następnie `npm run build:preview`. Sprawdź nowe APK i przekaż testerom link do konkretnego wydania. EAS zwiększa Android versionCode; pakiet Preview i podpis pozostają bez zmian.

Możliwość wyczyszczenia danych testowych nie oznacza automatycznego resetu przy budowaniu APK. Jeśli zmiana wymaga resetu, wykonujemy go jako osobne, świadome wdrożenie z uwzględnieniem kont Auth, cron i sekretów Vault. Nie uruchamiaj `db reset --linked` w ciemno.

Konfiguracja blokuje Dev wskazujący Supabase Preview oraz Preview wskazujący inny backend. Główny link CLI do starej bazy przeniesiono lokalnie do `.expo/environments/preview-cli-temp`, aby zwykłe `supabase db push` nie trafiło przypadkiem do testerów. Nie przywracaj go do głównego katalogu; używaj poleceń z jawnym środowiskiem.

Źródła: [warianty aplikacji Expo](https://docs.expo.dev/build-reference/variants/), [zmienne EAS](https://docs.expo.dev/eas/environment-variables/usage/).
