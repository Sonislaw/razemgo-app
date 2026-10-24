# Push — wiadomości i zaproszenia

Pierwszy etap obejmuje trzy alerty: otrzymane zaproszenie, akceptację zaproszenia i nową wiadomość. Kliknięcie prowadzi do otrzymanych zaproszeń lub konkretnego czatu, także po zimnym starcie i odtworzeniu sesji. Alert jest przeznaczony dla konkretnej ekipy; zalogowanie na inne konto nie otwiera jego rozmowy.

## Android: konfiguracja Firebase

Stan środowiska testowego na 24.10.2026: projekt Firebase `razemgo-cfbe2` odpowiada pakietowi `pl.razemgo.app.dev`. Plik aplikacji jest zapisany w EAS jako sekret typu file `GOOGLE_SERVICES_JSON` w środowisku `development`; klucz konta serwisowego jest przypisany do FCM V1 w Credentials. Uwierzytelnienie Google i żądanie FCM z `validate_only: true` zwróciły HTTP 200, bez dostarczenia wiadomości. Użytkownik potwierdził odbiór push na dwóch fizycznych telefonach. Kroki poniżej służą odtworzeniu konfiguracji lub przygotowaniu kolejnego środowiska.

[Development build z obsługą push i ikoną RazemGo](https://expo.dev/accounts/sonislaw/projects/razemgo/builds/f4b645de-1a9c-4317-9d55-54df42c60b01) zakończył się statusem `FINISHED` 24.10.2026. Instaluj APK z tego buildu lub nowszego, a następnie połącz aplikację z Metro.

Push wymagają nowego development buildu. W poprzednim APK aplikacja nadal działa, a ustawienia pokazują potrzebę aktualizacji. Expo Go i web nie rejestrują tokenów w tej implementacji.

1. Utwórz projekt w [Firebase Console](https://console.firebase.google.com/). Dodaj aplikację Android z pakietem **`pl.razemgo.app.dev`** — musi odpowiadać `app.json`.
2. Pobierz plik **`google-services.json`** z ustawień tej aplikacji. Umieść go w katalogu głównym repozytorium (jest ignorowany przez Git), albo ustaw `GOOGLE_SERVICES_JSON` na ścieżkę do pliku. `app.config.js` obsługuje obie możliwości.
3. Dla buildu EAS dodaj ten plik jako zmienną typu **file** o nazwie **`GOOGLE_SERVICES_JSON`** w środowisku **development**. Można to zrobić w panelu EAS Environment Variables albo przez `npx eas-cli@latest env:set --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --visibility secret --environment development`.
4. W Firebase: **Project settings → Service accounts → Generate new private key**. Prywatnego JSON-a nie dodawaj do repozytorium ani do zmiennych `EXPO_PUBLIC_*`.
5. Uruchom `npx eas-cli@latest credentials -p android`, wybierz profil **development** i opcję **Google Service Account → Manage your Google Service Account Key for Push Notifications (FCM V1)**. Wgraj wygenerowany klucz. Alternatywnie użyj [panelu Credentials projektu EAS](https://expo.dev/accounts/sonislaw/projects/razemgo/credentials).
6. Zbuduj i zainstaluj nowe APK:

```powershell
npx eas-cli@latest build --platform android --profile development
npx expo start --dev-client
```

7. W aplikacji otwórz **Profil → Ustawienia → Powiadomienia na telefonie → Włącz powiadomienia** i zaakceptuj zgodę systemową. Krótka zachęta jest także w Wiadomościach. Przy odmowie można przejść do ustawień telefonu. Włączenie zostaje potwierdzone po uzyskaniu tokena i zapisaniu go w Supabase.

Instrukcje źródłowe: [konfiguracja FCM V1](https://docs.expo.dev/push-notifications/fcm-credentials/), [Expo Notifications dla SDK 58](https://docs.expo.dev/versions/v58.0.0/sdk/notifications/). Nie należy mylić pliku aplikacji `google-services.json` z prywatnym kluczem konta serwisowego FCM. Google OAuth do logowania jest odrębną konfiguracją.

Kod i biblioteka są przygotowane także na iOS; uruchomienie push na iOS wymaga osobno bundle identifier, konfiguracji Apple/APNs i właściwego buildu. Ten etap jest wdrażany i sprawdzany przede wszystkim dla Androida.

### Ikona Androida

Plugin `expo-notifications` wskazuje `assets/icons/notifications/notification-icon.png`: biały znak RazemGo na przezroczystym tle, 96 × 96 px, z marginesem. Android wykorzystuje maskę alfa; pełnokolorowa ikona z nieprzezroczystym tłem dałaby prostokąt. Turkusowy kolor `#087FA4` pozostaje w konfiguracji pluginu. Zasób jest używany zarówno przez Firebase w tle, jak i Expo Notifications na pierwszym planie.

Ikonę można odtworzyć z istniejącego `zgrana-symbol.svg` poleceniem `npm exec --yes --package=sharp -- node scripts/render-notification-icon.cjs`. Zmiana tej konfiguracji wymaga nowego APK; Reload nie aktualizuje zasobów natywnych. Po instalacji usuń wcześniejsze powiadomienia i sprawdź ikonę przy nowym push, także na pasku stanu oraz w jasnym i ciemnym panelu powiadomień.

## Serwer Supabase

Migracja **`202610240004_push_notifications.sql`** tworzy rejestr urządzeń oraz prywatną kolejkę. Nowe zdarzenia są dodawane transakcyjnie wraz z wiadomością lub zaproszeniem. Początkowy tekst skopiowany z zaproszenia do rozmowy nie generuje drugiego alertu.

Instalacja ma losowy identyfikator i klucz w SecureStore; baza przechowuje hash klucza. Rejestracja wiąże telefon z ekipą wynikającą z `auth.uid()` i aktualną sesją Auth. Identyfikatora nadawcy/odbiorcy nie można podmienić przez API. Tokenów nie można odczytać przez publiczne API. Wylogowanie wyrejestrowuje instalację; usunięcie sesji lub konta usuwa jej token i dostawy kaskadowo. Zmiana konta usuwa stare oczekujące dostawy danego telefonu.

Wyłączenie w ustawieniach dotyczy tego urządzenia. Zgoda systemowa nie jest automatycznie odwoływana; zapisana lokalnie decyzja blokuje ponowną rejestrację do ręcznego włączenia. Nie dodano jeszcze osobnych preferencji dla poszczególnych typów powiadomień.

Worker **`dispatch-push`**:

- Jest chroniony osobnym kluczem serwerowym `PUSH_DISPATCH_SECRET`; klient mobilny nie zna tego klucza. RPC do odbierania i kończenia zadań są dostępne wyłącznie dla `service_role`.
- Rezerwuje zadania blokadą i losowym kluczem próby. Równoczesne procesy nie pobierają tego samego aktywnego zadania. Niedokończona próba może zostać odzyskana po dwóch minutach.
- Przed wysyłką sprawdza blokadę obu stron, stan zaproszenia, odczyt wiadomości, istnienie sesji i aktualne konto przypisane do telefonu. Alerty ważne są do 24 godzin. Nowa instalacja nie otrzymuje historycznych zdarzeń.
- Wysyła do Expo porcje maksymalnie 30 alertów, zapisuje ticket i po 15 minutach sprawdza receipt. Brak receipt jest ponawiany bez ponownego wysłania alertu. Przejściowe błędy mają narastający odstęp i limit ośmiu prób.
- `DeviceNotRegistered` usuwa tylko ten token, którego dotyczyła próba; odświeżony token pozostaje. Błędne credentials nie usuwają telefonu.
- Treści alertów są ogólne. Nie zawierają tekstu rozmowy, nazwiska, danych dzieci ani lokalizacji. Payload zawiera wyłącznie typ, wersję i identyfikatory potrzebne do bezpiecznej nawigacji.
- Stabilne `collapseId` i Android `tag` ograniczają duplikaty i grupują alerty tej samej rozmowy. Po niejednoznacznej awarii sieci system ponawia wysyłkę, więc nie deklaruje dostarczenia dokładnie raz.
- Status `sent` oznacza potwierdzenie przekazania przez Expo do dostawcy, a nie potwierdzenie zobaczenia alertu na telefonie. Odczyt czatu pozostaje osobnym stanem.

Wdrożenie na podłączonym projekcie testowym:

```powershell
npx supabase@latest db push --linked
npx supabase@latest functions deploy dispatch-push --use-api --no-verify-jwt
node scripts/configure-push-dispatch.mjs
```

Ostatni skrypt generuje losowy klucz i zapisuje go w sekretach Edge Functions oraz Supabase Vault. Konfiguruje `pg_net` do budzenia workera po dodaniu zdarzenia i `pg_cron` do ponowień co minutę. Pusta kolejka nie wywołuje Edge Function. Osobne zadanie nocne usuwa zdarzenia po siedmiu dniach od wygaśnięcia. Tymczasowe pliki z kluczem są ignorowane przez Git i usuwane po konfiguracji. Powtórne uruchomienie rotuje klucz. Polecenia Supabase CLI wykonuj kolejno.

Jeśli projekt Expo ma włączone dodatkowe zabezpieczenie Push Service, zapisz wymagany **`EXPO_ACCESS_TOKEN`** jako sekret Edge Function. Nie umieszczaj go w aplikacji. Domyślne środowiskowe klucze administracyjne Supabase są odczytywane wyłącznie przez funkcję serwerową.

Dokumentacja: [wysyłanie i receipts Expo](https://docs.expo.dev/push-notifications/sending-notifications/), [harmonogram funkcji Supabase](https://supabase.com/docs/guides/functions/schedule-functions).

## Kontrole i test telefonu

```powershell
npm run test:notifications
npm run lint
npm run typecheck
npm run test:web
npx deno check supabase/functions/dispatch-push/index.ts
npx supabase@latest db query --linked --file scripts/check-push-remote.sql
node scripts/check-push-dispatch.mjs
```

Testy logiki i bazy sprawdzają trzy zdarzenia, uprawnienia, sesje, zmianę konta, retry, blokady, odczyty przed wysyłką, aktualizację tokena, receipts i dozwolone trasy. Test zdalny działa wewnątrz transakcji zakończonej `ROLLBACK`; także zaplanowane w niej wywołania `pg_net` są cofane, więc nie wysyła próbnych push. Nie jest to test otrzymania powiadomienia na fizycznym telefonie.

`check-push-dispatch.mjs` sprawdza rzeczywistą autoryzację funkcji i przetworzenie pustej kolejki. Odmawia działania przy aktywnych dostawach, aby kontrola zdrowia nie wysyłała prawdziwych powiadomień. Klucz odczytany z Vault nie jest wypisywany ani zapisywany w repozytorium.

Po dodaniu FCM i zainstalowaniu nowego APK:

1. Konto A publikuje wyjazd, konto B wysyła zaproszenie. A otrzymuje alert; kliknięcie otwiera otrzymane zaproszenia.
2. A akceptuje. B otrzymuje alert; kliknięcie otwiera utworzoną rozmowę.
3. A wysyła nową wiadomość. B dostaje alert przy aplikacji w tle i zamkniętej. Sprawdź też zimny start, odtworzenie sesji i przywrócenie z tła.
4. W otwartej rozmowie z tą ekipą nie powinno być dodatkowego bannera. Odczyt przed wysyłką i blokada powinny zatrzymać jeszcze oczekujący alert.
5. Sprawdź odmowę zgody, włączenie w ustawieniach systemu, wyłączenie w aplikacji, drugi telefon tego samego konta i wylogowanie. Alert ze starego konta nie może otworzyć rozmowy nowego konta.

Na Androidzie zwykłe zamknięcie aplikacji różni się od systemowego **Wymuś zatrzymanie**; ten ostatni stan może zatrzymać odbieranie do ponownego uruchomienia ([wyjaśnienie Firebase](https://firebase.google.com/docs/cloud-messaging/flutter/receive-messages)). Test na urządzeniu musi uwzględnić ustawienia oszczędzania baterii producenta.
