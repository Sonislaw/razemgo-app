# Monitoring błędów RazemGo

## Co jest przygotowane

Integracja Sentry obejmuje błędy JavaScript, nieobsłużone odrzucenia Promise i awarie renderowania ekranów. Raportowane są również obsługiwane błędy operacji: logowania Google/e-mail, przywracania i odświeżania sesji, profilu, wyjazdów, Odkrywaj, zaproszeń, czatu, odczytów, blokad, zgłoszeń, centrum powiadomień i rejestracji push. Komunikaty oraz ponawianie operacji w aplikacji pozostają dostępne.

Własne Edge Functions `delete-account` i `dispatch-push` otrzymały bezpieczne raportowanie i nagłówek `X-Request-Id`. Identyfikator w logu funkcji pozwala znaleźć związane zdarzenie; aplikacja zachowuje go przy błędzie wywołania funkcji. Zwykłe RPC bazy są obserwowane przez klienta; ta integracja nie daje wglądu do wewnętrznych awarii hostowanego Supabase Auth ani pełnych logów PostgreSQL.

Na tym etapie SDK ma **wyłączoną warstwę natywną**. Raportowanie JavaScript działa w obecnym development APK i na webie po konfiguracji oraz restarcie Metro. Awarie Androida/iOS przed załadowaniem JavaScript, ANR i awarie silnika natywnego nie są objęte tym etapem. Nie dodajemy pluginu natywnego Sentry, automatycznej inicjalizacji ani `Sentry.wrap`, żeby żaden raport natywny nie ominął filtra JavaScript. Bez DSN i w podglądzie demo monitoring jest wyłączony.

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

Ta integracja raportuje nieoczekiwane awarie Edge Functions. Ponawiane błędy dostawcy push pozostają stanami kolejki. Automatyczna kontrola zaległych zadań i zatrzymania harmonogramu to kolejny etap monitoringu.

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

`SENTRY_AUTH_TOKEN` służy wyłącznie do przesyłania map przez narzędzia deweloperskie. Nie zapisuj go w `EXPO_PUBLIC_*`, `app.json`, plikach śledzonych przez Git ani aplikacji. Map nie publikuj jako ogólnodostępnych plików hostingu. Automatyczny upload map natywnego buildu EAS nie jest włączony bez pluginu natywnego; jego kontrolowana konfiguracja i pełne raporty natywne to osobny etap. Sam poprawny test `monitoring.test` nie dowodzi poprawnej symbolikacji wydania.

Kontrole lokalne:

```powershell
npm run test:monitoring
npm run lint
npm run typecheck
npm test
npm run test:web
npx deno check --node-modules-dir=none --no-lock supabase/functions/delete-account/index.ts supabase/functions/dispatch-push/index.ts
npx deno test --node-modules-dir=none --no-lock --allow-env --allow-net --allow-sys --allow-read supabase/functions/_shared/monitoring.test.ts supabase/functions/dispatch-push/handler.test.ts
```

Testy jednostkowe sprawdzają usuwanie danych, kategorie, limity, zachowanie wyników żądań i timeout. Testy przeglądarkowe uruchamiają rzeczywisty SDK z fikcyjnym DSN, przechwytują wysłaną kopertę i sprawdzają brak danych konta oraz prywatnej treści wyjątku. Testy Deno sprawdzają również odmowę dostępu do diagnostyki, wyłączenie jej w produkcji, limit powtórzeń, odrzucenie raportu przez Sentry i niezależność od zwykłego dispatchera. Te testy automatyczne używają atrap transportu. Skrypt `check-backend-monitoring.mjs` wykonuje osobny test rzeczywistej funkcji i prawdziwego projektu Sentry.

Kontrola Expo nadal wskazuje siedem dostępnych aktualizacji poprawek istniejących pakietów SDK 58. Pozostawiono ich dotychczasowe wersje. `npm audit` zgłasza także pięć istniejących ostrzeżeń o wysokiej wadze w drzewie zależności Expo; automatyczna sugestia obniża główną wersję Expo, więc nie zastosowano `audit fix --force` w ramach integracji monitoringu. Nie dotyczą one dodanego SDK Sentry.

Weryfikacja 24.10.2026: lint i TypeScript przeszły; 225 testów Node, 17 scenariuszy Playwright oraz test transportu SDK Deno przeszły. Eksporty Androida i webu z mapami źródeł zakończyły się powodzeniem. Zdalnie sprawdzono odmowę usuwania konta bez JWT oraz autoryzację i obsługę pustej kolejki workera bez wysyłania push.

Lokalny DSN aplikacji skonfigurowano 24.10.2026 w ignorowanym `.env.local`, z raportowaniem deweloperskim włączonym. Rzeczywisty test przycisku przez SDK webowy otrzymał HTTP 200 od Sentry i potwierdzenie identyfikatora `54d39240512d4b7d8d72fc9ddb59ac58` (`monitoring.test`). Użyto odizolowanej przeglądarki z fikcyjnym backendem; wysłano jeden raport techniczny, bez logowania do prawdziwego konta i bez wysyłania danych Supabase. Następnie użytkownik potwierdził działanie integracji aplikacji. Osobny DSN backendu skonfigurowano i sprawdzono zdalnie zgodnie z sekcją powyżej.

Źródła: [Expo — Sentry](https://docs.expo.dev/guides/using-sentry/), [Sentry — filtrowanie danych](https://docs.sentry.io/platforms/react-native/guides/expo/data-management/sensitive-data/), [Supabase — monitoring funkcji](https://supabase.com/docs/guides/functions/examples/sentry-monitoring).
