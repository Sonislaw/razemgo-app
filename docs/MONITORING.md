# Monitoring błędów RazemGo

## Co jest przygotowane

Integracja Sentry obejmuje błędy JavaScript, nieobsłużone odrzucenia Promise i awarie renderowania ekranów. Raportowane są również obsługiwane błędy operacji: logowania Google/e-mail, przywracania i odświeżania sesji, profilu, wyjazdów, Odkrywaj, zaproszeń, czatu, odczytów, blokad, zgłoszeń, centrum powiadomień i rejestracji push. Komunikaty oraz ponawianie operacji w aplikacji pozostają dostępne.

Własne Edge Functions `delete-account` i `dispatch-push` otrzymały bezpieczne raportowanie i nagłówek `X-Request-Id`. Identyfikator w logu funkcji pozwala znaleźć związane zdarzenie; aplikacja zachowuje go przy błędzie wywołania funkcji. Zwykłe RPC bazy są obserwowane przez klienta; ta integracja nie daje wglądu do wewnętrznych awarii hostowanego Supabase Auth ani pełnych logów PostgreSQL.

SDK ma **wyłączone raportowanie natywne**. Raportowanie JavaScript działa w development APK i na webie po konfiguracji oraz restarcie Metro. Awarie Androida/iOS przed załadowaniem JavaScript, ANR i awarie silnika natywnego nie są objęte tym etapem. Od 28.10.2026 Dev ma plugin Sentry wyłącznie do konfiguracji przesyłania map podczas budowania. Nie włącza on natywnej inicjalizacji (`useNativeInit` domyślnie `false` w przypiętej wersji), a SDK nadal ma `enableNative: false` i `enableNativeCrashHandling: false`. Nie dodano `Sentry.wrap`; raporty JavaScript nadal przechodzą filtr danych. Bez DSN i w podglądzie demo monitoring jest wyłączony.

## Konfiguracja Sentry

1. Załóż konto na [sentry.io](https://sentry.io/) i organizację. Dla tego projektu wybierz region EU podczas tworzenia organizacji, jeżeli odpowiada Twojej konfiguracji usług.
2. Utwórz projekt platformy **React Native**, np. `razemgo-app`. Do błędów funkcji utwórz osobny projekt **Deno**, np. `razemgo-backend`.
3. W projekcie aplikacji przejdź do **Settings → Projects → razemgo-app → Client Keys (DSN)**. Skopiuj DSN. Jest to publiczny adres przyjmowania raportów; nie jest tokenem administracyjnym.
4. Dodaj do ignorowanego pliku `.env.local`:

```dotenv
EXPO_PUBLIC_SENTRY_DSN=https://PUBLIC_KEY@YOUR_INGEST_HOST/PROJECT_ID
EXPO_PUBLIC_APP_ENV=development
EXPO_PUBLIC_MONITORING_IN_DEV=true
```

5. Zrestartuj serwer: `npx expo start --dev-client --clear`. Sam Fast Refresh nie przeładuje zmiennych ani konfiguracji Metro. Nie trzeba przebudowywać obecnego APK do raportów JavaScript.
6. W aplikacji otwórz **Profil → Ustawienia → Diagnostyka deweloperska → Wyślij raport testowy**. W Sentry sprawdź zdarzenie `monitoring.test`. Wyświetlony identyfikator pomaga je znaleźć; samo wygenerowanie identyfikatora nie potwierdza odbioru przez Sentry. Ta karta jest dostępna wyłącznie w trybie deweloperskim z włączonym `EXPO_PUBLIC_MONITORING_IN_DEV`.
7. Do buildów EAS zapisz publiczny DSN i `EXPO_PUBLIC_APP_ENV` w środowisku danego profilu (`development`, `preview`, `production`). W wydaniu produkcyjnym ustaw `EXPO_PUBLIC_APP_ENV=production`; flagę raportów deweloperskich pozostaw `false`. W development buildzie jest wymagane jawne `true`, aby nie wysyłać błędów podczas zwykłej pracy nad kodem.

Panel Sentry pokaże operację, ogólną kategorię, dozwolony kod, szablon ekranu, wersję aplikacji, platformę i dostępny numer systemu. Losowy identyfikator instalacji pozwala grupować raporty z jednej instalacji. Nie pochodzi z konta użytkownika, a jego zapis nie jest warunkiem działania aplikacji ani monitoringu. To identyfikator pseudonimowy; nie oznacza konkretnej osoby ani liczby kont.

## Funkcje Supabase

Kod obu funkcji wdrożono w testowym projekcie `tueqqnbdvuazdxoqtpvk` 24.10.2026. Skonfigurowano osobny projekt Sentry `razemgo-backend` w sekretach Edge Functions: `SENTRY_DSN`, `SENTRY_ENVIRONMENT=development` i `SENTRY_RELEASE=2026-10-24.monitoring-backend-v1`. DSN aplikacji pozostał osobną konfiguracją. Polecenia poniżej służą kolejnemu środowisku lub ponownemu wdrożeniu kodu.

W **Supabase Dashboard → Edge Functions → Secrets** dodaj:

```dotenv
SENTRY_DSN=DSN_Z_PROJEKTU_BACKEND
SENTRY_ENVIRONMENT=development
SENTRY_RELEASE=2026-10-24
```

Następnie, z katalogu projektu i zalogowanego CLI, wykonaj kolejno:

```powershell
npx supabase@latest functions deploy delete-account --use-api --no-verify-jwt
npx supabase@latest functions deploy dispatch-push --use-api --no-verify-jwt
```

Autoryzacja pozostaje w funkcjach: `delete-account` sprawdza JWT przez Supabase Auth, a worker ma własny sekret. Nie uruchamiaj ponownie `configure-push-dispatch.mjs`; ta zmiana nie wymaga rotacji klucza push ani migracji bazy. Bez `SENTRY_DSN` funkcje zachowują bezpieczny log techniczny w panelu Supabase. Nie uruchamiaj usuwania konta jako testu monitoringu na prawdziwym koncie.

### Test wdrożonego backendu

Z zalogowanego CLI, w katalogu projektu:

```powershell
node scripts/check-backend-monitoring.mjs
```

Skrypt sprawdza zgodność podłączonego projektu z adresem Supabase aplikacji i pobiera klucz workera z Vault wyłącznie do pamięci procesu. Nie wypisuje klucza ani nie umieszcza go w aplikacji. Wywołuje `dispatch-push` z nagłówkiem `x-razemgo-diagnostic: sentry-test`: ta ścieżka wymaga klucza serwerowego, jawnego `SENTRY_ENVIRONMENT=development` i jest ograniczona do jednego raportu na minutę na uruchomiony proces funkcji. W produkcji zwraca 404. Nie odczytuje zadań push ani nie uruchamia operacji konta. Błędny nagłówek diagnostyczny nie uruchamia zwykłej wysyłki.

Raport przechodzi przez ten sam filtr danych i SDK co rzeczywiste awarie. Test sprawdza kod HTTP transportu Sentry; samo opróżnienie kolejki SDK nie oznacza odbioru raportu. Odpowiedź pokazuje wyłącznie identyfikatory zdarzenia i żądania oraz status przyjęcia. Dwa wywołania bez prawidłowego klucza sprawdzają odmowę dostępu i nie tworzą zdarzeń. W Sentry wybierz projekt `razemgo-backend`, środowisko `development` i wyszukaj `monitoring.test`.

Weryfikacja z wdrożonej funkcji 24.10.2026: Sentry potwierdziło odbiór HTTP 200, zdarzenie `7de091d5358144d79be9e80c2277df42`, żądanie `f5b72999-e9f0-4210-9636-3edbb941ded8`. Po teście zwykłe wywołanie workera przetworzyło pustą kolejkę, bez wysyłania powiadomień. Test obejmował transport backendu; widoczność w zalogowanym panelu Sentry potwierdza użytkownik.

Ta integracja raportuje nieoczekiwane awarie Edge Functions. Ponawiane błędy dostawcy push są również sprawdzane przez osobną kontrolę co 5 minut. Incydenty kolejki i konfiguracji trafiają do Sentry jako `server.push_health`, a zewnętrzny heartbeat pilnuje uruchomień monitora: [Kontrola push](PUSH_HEALTH.md).

## Dane i ograniczenia

Polityka `shared/monitoring-policy.ts` buduje raport z listy dozwolonych pól. Nie kopiuje całego zdarzenia i nie opiera się wyłącznie na wyszukiwaniu haseł w tekście. Usuwa surowe wiadomości błędów, opisy wyjazdów, teksty rozmów, dane dzieci, e-maile, właścicieli kont, adresy IP z kontekstu, nagłówki, request/response body, dane SQL, breadcrumbs, dowolne dodatkowe konteksty, nazwy urządzeń, lokalne ścieżki i parametry URL. Ślad błędu zawiera nazwę bundla, numery linii/kolumn i typ wyjątku; komunikat jest zastąpiony nazwą operacji i dozwolonym kodem. Nie ma screenshotów, nagrywania sesji, hierarchii widoków, automatycznych logów ani monitoringu wydajności. Dostawca raportów technicznie otrzymuje połączenie sieciowe; usunięcie IP ze zdarzenia nie usuwa go z samego transportu.

Błędne hasło, wygasły kod, niepotwierdzony e-mail, anulowanie OAuth, zwykła walidacja, niedostępny już plan i ograniczenie częstotliwości nie tworzą alarmów. Problemy sieci, timeout, odmowa uprawnień bazy i nieoczekiwane błędy są grupowane według operacji i kodu. Powtórzenie tego samego błędu ma limit jednego raportu na minutę, z dodatkowym limitem dziesięciu raportów na minutę na uruchomiony proces. Liczba zdarzeń w panelu jest zatem próbką problemów, nie dokładnym licznikiem wszystkich nieudanych żądań. Błąd samego monitoringu nie może zablokować operacji użytkownika. Wysyłka działa przez JavaScript; brak trwałej kolejki offline oznacza, że raport przy braku sieci lub szybkim zamknięciu aplikacji może nie dotrzeć.

W panelu Sentry pozostaw włączone dodatkowe filtrowanie danych wrażliwych. Regułę alertu ustaw początkowo na nowy błąd w środowisku `production`; problemy sieci/timeout można analizować zbiorczo, aby nie generować alertu przy każdym rozłączeniu. Włączenie wysyłki produkcyjnej wymaga uzupełnienia informacji o używanym dostawcy i identyfikatorze diagnostycznym w dokumentacji prywatności aplikacji.

## Mapy źródeł i kontrola

`metro.config.js` dodaje Sentry Debug IDs do bundli i map. Nie dodaje danych konta ani treści komponentów do raportów. Do czytelnego śladu błędu z wydania potrzebna jest mapa **dokładnie tego bundla**. Dla eksportu webowego:

```powershell
npx expo export --platform web --source-maps --output-dir .expo/monitoring-web
# W tym terminalu ustaw SENTRY_ORG, SENTRY_PROJECT oraz prywatny SENTRY_AUTH_TOKEN.
npx sentry-expo-upload-sourcemaps .expo/monitoring-web
```

`SENTRY_AUTH_TOKEN` służy wyłącznie do przesyłania map przez narzędzia deweloperskie. Nie zapisuj go w `EXPO_PUBLIC_*`, `app.json`, plikach śledzonych przez Git ani aplikacji. Map nie publikuj jako ogólnodostępnych plików hostingu. Sam poprawny test `monitoring.test` nie dowodzi poprawnej symbolikacji wydania.

### Przygotowana konfiguracja EAS Dev — 28.10.2026

`app.config.js` dodaje plugin `@sentry/react-native/expo` tylko dla wariantu Development, z organizacją **`zgranago`**, projektem **`react-native`** i adresem `https://sentry.io/`. Wariant Preview nie otrzymał tej konfiguracji. Release ma postać `razemgo@<wersja>+<wariant>.<skrót źródeł>`; skrót obejmuje również niezacommitowane zmiany, ale nie pliki środowiska ani sekrety. Debug IDs pozostają w dozwolonym, oczyszczonym zdarzeniu.

Token dodano 28.10.2026. Odczyt metadanych EAS potwierdził obecność `SENTRY_AUTH_TOKEN` w środowisku **Development**, bez odczytywania ani wyświetlania jego wartości. Konfiguracja kolejnych tokenów:

1. Utwórz token Sentry uprawniony do przesyłania map do tej organizacji i projektu.
2. W projekcie Expo RazemGo dodaj `SENTRY_AUTH_TOKEN` jako zmienną **Secret**, wyłącznie dla środowiska **Development**. Nie wklejaj wartości do rozmowy.
3. Zbuduj nowy APK `npm run build:performance` lub `npm run build:dev`. Token dodany po budowie nie prześle automatycznie wcześniejszych map.
4. Sprawdź log uploadu, a następnie odczyt rzeczywistego kontrolowanego błędu z tego konkretnego APK w Sentry.

Po dodaniu tokena usunięto `SENTRY_ALLOW_FAILURE=true` z profilu `performance`: błędy przesyłania map nie są już pomijane. Wcześniejszy APK `8420c65d` zbudowano jeszcze z tym wyjątkiem; jego mapy nie zostały potwierdzone. Nowy [build Dev `b170e37a`](https://expo.dev/accounts/sonislaw/projects/razemgo/builds/b170e37a-3e7b-4f62-b534-e5a1db9327e6) uruchomiono w profilu `performance`, ze środowiskiem Development. **Przyjęcie paczki map przez Sentry jest potwierdzone**: zadanie `SentryUpload` zwróciło `File upload complete (processing pending on server)`, `Upload type: artifact bundle` oraz `Source Map Upload Report`, bez błędu uploadu lub autoryzacji. Przetworzenie po stronie Sentry i czytelność konkretnego kontrolowanego błędu z APK pozostają osobną weryfikacją; same logi uploadu ich nie potwierdzają. Preview nie zmieniono. Pełny raport zmian: [ARCHITECTURE_HARDENING.md](ARCHITECTURE_HARDENING.md).

Build zakończył się `FINISHED` 28.10.2026 o 20:18 UTC. [APK Dev z przesłanymi mapami](https://expo.dev/artifacts/eas/b74DOoHiMdE915jOUmf4fE81c1OAzL3nfRao6iYRomU.apk). Metadane EAS: wersja `1.2.0`, kompilacja `1`, pakiet `pl.razemgo.app.development`. To samodzielny APK bez Metro. Kod wysłano przed dodaniem widocznej wersji w ustawieniach i włączeniem automatycznego numerowania Dev; te zmiany trafią do kolejnego APK. Nie wykonano jeszcze testu tego pliku na telefonie.

Kontrole lokalne:

```powershell
npm run test:monitoring
npm run lint
npm run typecheck
npm test
npm run test:web
npm run test:edge
```

Testy jednostkowe sprawdzają usuwanie danych, kategorie, limity, zachowanie wyników żądań i timeout. Testy przeglądarkowe uruchamiają rzeczywisty SDK z fikcyjnym DSN, przechwytują wysłaną kopertę i sprawdzają brak danych konta oraz prywatnej treści wyjątku. Testy Deno sprawdzają również odmowę dostępu do diagnostyki, wyłączenie jej w produkcji, limit powtórzeń, odrzucenie raportu przez Sentry i niezależność od zwykłego dispatchera. Te testy automatyczne używają atrap transportu. Skrypt `check-backend-monitoring.mjs` wykonuje osobny test rzeczywistej funkcji i prawdziwego projektu Sentry.

Historyczny stan z 24.10.2026: kontrola Expo wskazywała siedem aktualizacji poprawek SDK 58 i pięć ostrzeżeń high w drzewie narzędzi Expo. Od tego czasu wykonano etap 0. Aktualna kontrola zgodności przechodzi; audyt 28.10.2026 wskazuje 3 pozycje high i 5 low, opisane z ograniczeniami aktualizacji w [raporcie technicznym](ARCHITECTURE_HARDENING.md). Nie zastosowano `audit fix --force` ani cofnięcia SDK.

Weryfikacja 24.10.2026: lint i TypeScript przeszły; 225 testów Node, 17 scenariuszy Playwright oraz test transportu SDK Deno przeszły. Eksporty Androida i webu z mapami źródeł zakończyły się powodzeniem. Zdalnie sprawdzono odmowę usuwania konta bez JWT oraz autoryzację i obsługę pustej kolejki workera bez wysyłania push.

Lokalny DSN aplikacji skonfigurowano 24.10.2026 w ignorowanym `.env.local`, z raportowaniem deweloperskim włączonym. Rzeczywisty test przycisku przez SDK webowy otrzymał HTTP 200 od Sentry i potwierdzenie identyfikatora `54d39240512d4b7d8d72fc9ddb59ac58` (`monitoring.test`). Użyto odizolowanej przeglądarki z fikcyjnym backendem; wysłano jeden raport techniczny, bez logowania do prawdziwego konta i bez wysyłania danych Supabase. Następnie użytkownik potwierdził działanie integracji aplikacji. Osobny DSN backendu skonfigurowano i sprawdzono zdalnie zgodnie z sekcją powyżej.

Źródła: [Expo — Sentry](https://docs.expo.dev/guides/using-sentry/), [Sentry — filtrowanie danych](https://docs.sentry.io/platforms/react-native/guides/expo/data-management/sensitive-data/), [Supabase — monitoring funkcji](https://supabase.com/docs/guides/functions/examples/sentry-monitoring).
