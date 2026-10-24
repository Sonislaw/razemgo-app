# Supabase — konta, profile i wyjazdy

Kod aplikacji i migracja są gotowe do podłączenia. Bez konfiguracji aplikacja pokazuje ekran powitalny; nie przełącza się automatycznie na dane przykładowe.

## 1. Projekt testowy

W Supabase Dashboard utwórz projekt `razemgo-dev` w regionie UE (np. Frankfurt). Zapisz hasło bazy poza repozytorium. Konto Supabase lub połączona integracja są potrzebne do rzeczywistego utworzenia projektu.

Skopiuj `.env.example` do `.env.local` i uzupełnij Project URL oraz **Publishable key** z okna Connect. Te wartości są publiczną konfiguracją aplikacji. Kluczy Secret / service role, hasła bazy, hasła SMTP i Google Client Secret nie wpisuj do `EXPO_PUBLIC_*` ani do repozytorium.

```powershell
npx supabase@latest login
npx supabase@latest link --project-ref TWOJ_PROJECT_REF
npx supabase@latest db push
npx supabase@latest functions deploy delete-account
```

Migracja tworzy `travel_groups`, `group_preferences`, polityki RLS i funkcję `save_my_profile`. Identyfikatory ekip powstają w bazie; właściciel wynika z `auth.uid()`. Zapis obu tabel jest jedną transakcją. Na tym etapie inne konta nie odczytują profilu ani preferencji.

## 2. Authentication

W Authentication → Sign In / Providers włącz Email i **Confirm email**, ustaw minimalną długość hasła na **10** znaków, długość kodu na **6**. W URL Configuration ustaw Site URL na `http://localhost:8081` i dodaj dokładne Redirect URLs:

```text
razemgo://auth/callback
razemgo://auth/callback?flow=recovery
http://localhost:8081/auth/callback
http://localhost:8081/auth/callback?flow=recovery
```

Dla podglądu po adresie LAN dodaj analogiczne dwa adresy z adresem komputera. Dla hostowanej wersji webowej dodaj jej HTTPS origin oraz adresy `/auth/callback`. Zmieniaj również Site URL dla środowiska produkcyjnego; unikaj wildcardów w produkcji. `supabase/config.toml` konfiguruje lokalny stack — `db push` nie przenosi ustawień Auth do projektu hostowanego.

W Email Templates skopiuj zawartość `templates/confirmation.html` do Confirm signup, a `templates/recovery.html` do Reset password. Potwierdzenie ma link oraz sześciocyfrowy kod, więc rejestrację można potwierdzić również po otwarciu poczty na innym urządzeniu. Linki PKCE otwieraj na urządzeniu/przeglądarce, z którego rozpoczęto operację. Nie przechowujemy ani nie logujemy haseł, kodów ani tokenów w diagnostyce.

W SMTP Settings podłącz własnego dostawcę SMTP, zweryfikowany adres nadawcy i domenę. Ustaw nazwę nadawcy `RazemGo`. Domyślna wysyłka Supabase działa tylko do adresów członków organizacji i nie wystarcza do testów z użytkownikami. Weryfikację domeny oraz dane SMTP wykonuje właściciel usługi; nie wyłączaj potwierdzania e-maila jako obejścia.

## 3. Google

W Google Auth Platform utwórz ekran zgody dla RazemGo oraz klienta OAuth typu **Web application**. Dodaj adres callback **Supabase**, pokazany przy dostawcy Google (zwykle `https://PROJECT_REF.supabase.co/auth/v1/callback`), do Authorized redirect URIs. Adres aplikacji `razemgo://…` wpisujemy w Supabase, nie jako Google callback.

Wklej Client ID i Client Secret do ustawień Google w Supabase i włącz dostawcę. W trybie testowym Google dodaj adresy testerów. Korzystamy z przeglądarki systemowej i PKCE, z podstawowymi zakresami `openid email profile`; aplikacja nie potrzebuje dostępu do poczty ani Dysku Google.

Istniejące potwierdzone konto e-mail z tym samym adresem powinno zostać połączone przez Supabase z Google. Sprawdź to na koncie testowym przed udostępnieniem aplikacji. Nie wdrażamy ręcznego łączenia różnych adresów. Osoba z kontem utworzonym przez Google może ustawić hasło po zalogowaniu, w ustawieniach konta.

## 4. Usuwanie konta

Funkcja `delete-account` samodzielnie sprawdza JWT przez `auth.getUser()`. `verify_jwt = false` wyłącza wyłącznie starszy mechanizm gatewaya; żądanie bez ważnego JWT otrzyma 401. Identyfikator usuwanego konta pochodzi z JWT, nigdy z parametrów żądania.

Funkcja korzysta z `SUPABASE_URL`, `APP_SUPABASE_PUBLISHABLE_KEY` i `APP_SUPABASE_SECRET_KEY`. Obsługuje też wbudowane po stronie Edge Functions `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`, jeśli projekt je udostępnia. Klucze administracyjne są wyłącznie sekretami funkcji. Nowy klucz ustaw w Edge Function Secrets jako `APP_SUPABASE_SECRET_KEY`; nie dodawaj go do env aplikacji. Nazwy własnych sekretów nie zaczynają się od zarezerwowanego prefiksu `SUPABASE_`.

`ALLOWED_WEB_ORIGINS` to lista originów oddzielona przecinkami. Domyślnie dozwolony jest `http://localhost:8081`; dodaj używane adresy LAN/hostingu. Natywna aplikacja nie wysyła przeglądarkowego Origin. Po usunięciu Auth user baza usuwa profil i preferencje kaskadowo, a aplikacja czyści lokalną sesję.

## 5. Android i EAS

```powershell
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest build --profile development --platform android
npm run start:dev
```

Zainstaluj APK z EAS na telefonie i otwórz development server. Google oraz linki `razemgo://` testujemy w development buildzie. Expo Go może służyć do podglądu UI i logowania hasłem/kodem potwierdzenia, ale nie do pełnego przepływu Google. Identyfikator Androida dla tej wersji testowej: `pl.razemgo.app.dev`.

Do buildów EAS dodaj publiczne zmienne Supabase do środowiska EAS używanego przez dany profil. Brak tych wartości nie zostaje zastąpiony produkcyjną bazą ani przykładowym kontem. Nie dodawaj sekretów serwerowych do środowiska aplikacji.

## 6. Dane przykładowe i kolejne etapy

Rzeczywiste konta zapisują profil i wyjazdy w Supabase. Nowe konto zaczyna bez własnych wyjazdów i rozmów. Odkrywaj pokazuje publiczne, aktualne plany innych użytkowników. Pięć przykładów na ekranie powitalnym nie jest dodawanych do danych konta.

Oddzielny podgląd istniejącego UI można uruchomić lokalnie z `EXPO_PUBLIC_ENABLE_DEMO=true` w `.env.local`. Wymaga restartu Metro, nie korzysta z prawdziwego konta i nigdy nie włącza się w buildzie release. Przy testach backendu ustaw `false`. Następne etapy: zaproszenia i czat → powiadomienia i pilotaż.

## 7. Kontrole

```powershell
npm run lint
npm run typecheck
npm test
npx expo install --check
npx expo-doctor
npx deno check supabase/functions/delete-account/index.ts
npx expo export --platform android --output-dir .expo/supabase-android
npx expo export --platform web --output-dir .expo/supabase-web
```

`test:auth` sprawdza walidację, callbacki, bezpieczne przechowywanie dużych sesji i mapowanie profilu. `test:backend` wykonuje prawdziwą migrację PostgreSQL w PGlite z minimalnym kontraktem `auth.users`/`auth.uid()`: RLS dla dwóch użytkowników i anon, walidację z pominięciem UI, transakcyjność oraz cascade. To nie jest test zdalnego Supabase Auth ani telefonu.

Przepływy webowe sprawdza `npm run test:web`. Przed pierwszym uruchomieniem zainstaluj przeglądarkę poleceniem `npx playwright install chromium`. Alternatywnie ustaw `PLAYWRIGHT_CHANNEL=chrome`, aby użyć zainstalowanego Chrome. Test uruchamia osobny Metro na porcie 8085, wymusza fikcyjne parametry backendu tylko w procesie testowym i przechwytuje odpowiedzi API. Obejmuje logowanie, potwierdzenie, onboarding, zapis i odtworzenie profilu, zmianę konta, błędy API, callback Google, reset hasła i potwierdzenie usunięcia. Nie łączy się z rzeczywistym Google ani Supabase.

Po podłączeniu usług sprawdź na dwóch kontach: rejestrację i mail, potwierdzenie linkiem/kodem, Google, połączenie Google z kontem e-mail, restart aplikacji, ten sam profil na drugim urządzeniu, edycję i błędy sieci, reset hasła, wylogowanie i usunięcie konta. Osobno odnotuj wyniki w development buildzie Androida i w przeglądarce.

## 8. Wyjazdy i Odkrywaj

Migracja `202610240001_trips.sql` tworzy `trip_plans`, walidacje i polityki RLS oraz funkcje `save_my_trip`, `change_my_trip_status`, `duplicate_my_trip`, `delete_my_trip`, `list_public_trips`. Zastosuj ją przez `npx supabase@latest db push --linked`. Nie przenosi ona danych demonstracyjnych.

Migracja `202610240002_trip_permissions.sql` odbiera także jawne domyślne granty Supabase dla roli `anon`. Wymagane są obie migracje. Samego `REVOKE ... FROM PUBLIC` nie traktujemy jako odebrania uprawnień nadanych bezpośrednio roli.

Własne rekordy są dostępne tylko właścicielowi ekipy. Odkrywaj korzysta z jawnej projekcji publicznych, opublikowanych i niezakończonych planów innych ekip. Funkcja nie zwraca identyfikatora konta, e-maila ani prywatnych preferencji profilu. Wylogowany lub usunięty użytkownik nie może jej używać. Usunięcie konta usuwa wyjazdy kaskadowo.

Daty są dokładne w obu trybach. Tolerancja istnieje tylko w filtrach. Publikacja wymaga wybranej lokalizacji, jednego sposobu podróżowania, poprawnych dat oraz opisu 20–1000 znaków; „Mam plan” wymaga miejscowości lub wsi. Szkic może być niepełny. Baza wymusza te reguły również przy bezpośrednich żądaniach API.

Kreator zachowuje jeden losowy klucz utworzenia planu. Funkcja zapisu oraz unikalny indeks właściciela i klucza sprawiają, że ponowienie po utracie odpowiedzi serwera nie tworzy drugiego ogłoszenia. Właściwy identyfikator wyjazdu nadal nadaje baza.

Wynik zgodności liczymy lokalnie z dostępnych kryteriów: daty (waga 30), miejsce (20), klimat (10), zainteresowania (20), preferowany wiek dzieci (15), rodzaj ekipy (10), preferencje drugiej strony dotyczące ekipy (10) i wieku (10), transport (5), zwierzęta (5). Brak kryterium pomija jego wagę. Wynik jest normalizowany do 0–100; zwierzęta nie wykluczają propozycji. Dla kilku własnych planów wybierany jest jeden najlepiej pasujący. Wybranie konkretnego planu ma pierwszeństwo.

Filtry i sortowanie pracują na pobranych publicznych rekordach. Pobieranie jest stronicowane po 500 rekordów. Aktualizacja następuje przy wejściu na ekran i wznowieniu aplikacji; nie jest to jeszcze Supabase Realtime ani push. Rozmowy i zaproszenia pozostają kolejnym etapem.

`npm test` obejmuje też `trips-backend.test.mjs` (PostgreSQL/PGlite: dwa konta, anon, RLS, projekcja, transakcyjność, cykl życia i cascade) oraz `trip-data.test.mjs` (adaptery i ranking). `npm run test:web` sprawdza tworzenie wyjazdu, błąd zapisu, restart, drugie urządzenie, publiczną listę drugiego konta, prywatne duplikaty, statusy, usuwanie i ponawianie pobierania. Webowe API jest kontrolowane w testach, bez zapisów do rzeczywistych kont.

Zdalną kontrolę migracji można wykonać przez `npx supabase@latest db query --linked --file scripts/check-trips-remote.sql`. Skrypt zakłada dwie tymczasowe tożsamości wewnątrz transakcji, sprawdza uprawnienia i kończy się `ROLLBACK`. Nie wysyła e-maili ani nie pozostawia kont lub ogłoszeń.
