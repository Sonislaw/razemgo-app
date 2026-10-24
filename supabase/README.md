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

Oddzielny podgląd istniejącego UI można uruchomić lokalnie z `EXPO_PUBLIC_ENABLE_DEMO=true` w `.env.local`. Wymaga restartu Metro, nie korzysta z prawdziwego konta i nigdy nie włącza się w buildzie release. Przy testach backendu ustaw `false`. Zaproszenia, czat, push i historia powiadomień są podłączone do Supabase; kolejne etapy to monitoring, obsługa moderacji i pilotaż.

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

Filtry i sortowanie pracują na pobranych publicznych rekordach. Pobieranie jest stronicowane po 500 rekordów. Aktualizacja ogłoszeń następuje przy wejściu na ekran i wznowieniu aplikacji. Skrzynka ma osobną subskrypcję Realtime opisaną poniżej; push oraz centrum powiadomień opisano w sekcjach 10–11.

`npm test` obejmuje też `trips-backend.test.mjs` (PostgreSQL/PGlite: dwa konta, anon, RLS, projekcja, transakcyjność, cykl życia i cascade) oraz `trip-data.test.mjs` (adaptery i ranking). `npm run test:web` sprawdza tworzenie wyjazdu, błąd zapisu, restart, drugie urządzenie, publiczną listę drugiego konta, prywatne duplikaty, statusy, usuwanie i ponawianie pobierania. Webowe API jest kontrolowane w testach, bez zapisów do rzeczywistych kont.

Zdalną kontrolę migracji można wykonać przez `npx supabase@latest db query --linked --file scripts/check-trips-remote.sql`. Skrypt zakłada dwie tymczasowe tożsamości wewnątrz transakcji, sprawdza uprawnienia i kończy się `ROLLBACK`. Nie wysyła e-maili ani nie pozostawia kont lub ogłoszeń.

## 9. Zaproszenia, czat i bezpieczeństwo

Zastosuj `202610240003_messaging.sql` poleceniem `npx supabase@latest db push --linked`. Migracja tworzy `contact_invitations`, `conversations`, `chat_messages`, `conversation_reads`, `group_blocks`, `account_reports` i `mailbox_updates`. Nie wymaga nowych zmiennych środowiska, klucza serwerowego w aplikacji ani nowych modułów natywnych.

Operacje zapisu odbywają się wyłącznie przez RPC. Aktor jest ustalany z `auth.uid()`, nigdy z przesłanego identyfikatora nadawcy. RLS chroni odczyty uczestników, a bezpośrednie modyfikacje tabel są zabronione. Funkcje `SECURITY DEFINER` mają pusty `search_path`, jawne kontrole uczestnictwa i ograniczone granty; również domyślne granty `anon` są odbierane. Prywatny schemat `messaging_private` nie powinien być dodawany do exposed schemas API.

- `send_contact_invitation` przyjmuje publiczny, aktywny wyjazd innej ekipy i opcjonalny własny aktywny plan. Jedno otwarte zaproszenie na parę i ogłoszenie, klucz ponowienia oraz limit pięciu nowych zaproszeń do tej samej ekipy w godzinę ograniczają duplikaty. Zamknięte zaproszenie można zastąpić nowym w granicach limitu.
- `respond_contact_invitation` pozwala odbiorcy zaakceptować lub odrzucić, a nadawcy wycofać zaproszenie. Akceptacja atomowo tworzy jedną rozmowę, odczyty obu stron i pierwszą wiadomość z treści zaproszenia. Ponowne wywołanie nie tworzy kolejnej rozmowy.
- `send_chat_message` nadaje nadawcę i czas na serwerze. Wiadomość ma do 2000 znaków. Klucz ponowienia pozostaje ten sam przy retry, również po utracie odpowiedzi po zapisie. Interfejs pokazuje wysyłanie, błąd z ponowieniem, wysłanie i odczyt.
- `get_my_mailbox` zwraca podsumowanie: kontakty, zaproszenia, ostatnie wiadomości, dokładne liczniki nieprzeczytanych i odczyty. Historia jest pobierana przez `get_conversation_messages` po 50 rekordów z kursorem sekwencji; przycisk wczytuje starsze. Metadane kontaktu ograniczono do nazwy, avatara i liczby dorosłych. Dane dzieci i preferencje profilu nie są automatycznie dołączane do czatu.
- `mark_conversation_read` przesuwa odczyt do konkretnej istniejącej wiadomości w danej rozmowie. Nie oznacza późniejszych wiadomości jako odczytanych i nie cofa istniejącego odczytu. Licznik dolnej zakładki korzysta ze skrzynki, niezależnie od liczby pobranych stron rozmowy. Dzwonek pokazuje nieodczytane wpisy centrum powiadomień, również propozycje wyjazdów.
- `set_group_block` zatrzymuje nowe zaproszenia i wysyłanie po obu stronach. Każdy usuwa wyłącznie swoją blokadę; blokada drugiej strony nadal działa. Oczekujące zaproszenia zostają zamknięte, historia zaakceptowanej rozmowy pozostaje dostępna. Zablokowane ekipy nie widzą wzajemnych ogłoszeń w `list_public_trips`.
- `report_conversation` zapisuje powód i serwerową kopię ostatnich 20 wiadomości jako materiał dla administratora. Raporty i ich treść nie są udostępnione bezpośrednio przez API. Autor widzi potwierdzenie i własną listę zgłoszeń. Nie ma automatycznej decyzji ani panelu moderacji; administrator obsługuje tabelę `account_reports` w Supabase. Materiał zgłoszenia pozostaje po usunięciu konta z wyzerowanymi kluczami obcymi. Przed pilotażem trzeba ustalić retencję i procedurę obsługi.

Kopie kierunku, terminu i opisu w zaproszeniu są niezmienne. Usunięcie/wstrzymanie ogłoszenia nie usuwa zaakceptowanej rozmowy; odnośnik do już niedostępnego ogłoszenia może pokazać stan niedostępności. Usunięcie konta usuwa jego kontakty, rozmowy, wiadomości i blokady kaskadowo. Stan klienta i subskrypcja są czyszczone przy zmianie konta. Niewysłane wiadomości pozostają w pamięci bieżącej sesji, nie są jeszcze kolejką offline na dysku.

Realtime publikuje wyłącznie `mailbox_updates`: licznik zmiany przypisany do ekipy, chroniony RLS. Nie publikujemy wiadomości, list blokad ani odczytów. Subskrypcja używa `postgres_changes_options.wait`, aby potwierdzenie kanału oznaczało również gotową replikację. Po zdarzeniu aplikacja pobiera aktualną skrzynkę i historię. Po ponownym połączeniu oraz powrocie na pierwszy plan synchronizuje dane; odświeżanie co 20 sekund i ręczny przycisk stanowią mechanizm zapasowy. Korzystamy z [Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes) i [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security). Nie są to powiadomienia push po zamknięciu aplikacji.

Kontrole: `npm test` obejmuje migrację i próby obejścia API dla trzech kont oraz anon, idempotencję, blokady obu stron, odczyty, stronicowanie, zachowanie kontekstu po usunięciu planu i cascade. `npm run test:web` obejmuje zaproszenie → akceptację → czat, drugie urządzenie, utratę odpowiedzi, retry, błędy pobierania, historię, blokadę i zgłoszenie (przechwycone API). Zdalny test SQL: `npx supabase@latest db query --linked --file scripts/check-messaging-remote.sql`; kończy się `ROLLBACK` bez pozostawienia kont i danych. Polecenia Supabase CLI uruchamiaj kolejno, ponieważ korzystają ze wspólnej tymczasowej roli logowania.

Opcjonalnie `node scripts/check-messaging-live.mjs` wykonuje rzeczywisty test Auth/API/WebSocket na podłączonym projekcie testowym. Tworzy trzy chwilowe konta przez CLI, bez wysyłania maili, sprawdza izolację, równoczesne ponowienie wysyłki, odczyty i zdarzenia Realtime, a następnie usuwa konta oraz wszystkie dane testu (również raport). Wymaga zalogowanego CLI i zgodności podłączonego projektu z `.env.local`. Dane uwierzytelniające testu są losowe, nie są wypisywane i nie trafiają do repozytorium. W razie niepowodzenia sprzątania pozostaje plik SQL z samymi identyfikatorami do ponowienia usunięcia. Nie uruchamiaj tego skryptu na projekcie produkcyjnym.

## 10. Push

Migracja `202610240004_push_notifications.sql` i funkcja `dispatch-push` obsługują alerty o wiadomościach, otrzymaniu zaproszenia i akceptacji. Zdarzenia są dodawane w bazie, więc wysyłka działa bez uruchomionej aplikacji. Klucze serwerowe i tokeny urządzeń nie są publiczne. Szczegóły wdrożenia workera, Vault/cron, Firebase/FCM, nowego buildu i kontroli: **[PUSH.md](PUSH.md)**.

## 11. Centrum powiadomień i preferencje

Migracja `202610240005_notification_center.sql` dodaje `notifications`, `notification_preferences` i prywatne funkcje `notifications_private`. Schemat prywatny nie jest udostępniany w API. RLS pozwala odczytać wyłącznie własne dane, ukrywa wpisy zablokowanych kontaktów, a zapisy przechodzą przez RPC z właścicielem wynikającym z sesji. Historia nie zawiera treści wiadomości ani danych dzieci.

- `get_my_notifications` zwraca stronę historii, dokładny licznik nieodczytanych, ustawienia konta i czas pobrania. Stabilny kursor `(created_at,id)` pozwala pobierać starsze wpisy. Interfejs udostępnia wszystkie/nieodczytane, retry i stany niedostępnych treści.
- `mark_my_notifications_read` oznacza wskazane własne wpisy lub wszystkie do czasu ostatniego pobrania. Nowsze wpisy pozostają nieodczytane. Odczyt powiadomienia nie zmienia odczytu czatu; odczyt czatu potwierdza odpowiadające mu wpisy historii. Rozwiązanie zaproszenia również potwierdza jego powiadomienie.
- `save_my_notification_preference` zapisuje pojedyncze ustawienie `messages` albo `invitations`, bez nadpisywania drugiego pola przez równoczesny zapis z innego telefonu. Preferencje dotyczą całego konta. Wyłączenie zatrzymuje oczekujące dostawy kategorii; ponowne włączenie nie odtwarza dawnych alertów. Już przekazanych żądań dostawcy nie da się cofnąć.
- Nowe zaproszenia, akceptacje i wiadomości tworzą historię atomowo, także bez urządzenia i z wyłączonym push. Usuwanie starych zadań kolejki push nie kasuje historii. Blokada kontaktu ukrywa historię obu stron i wygasza stan nieodczytanych; usunięcie konta usuwa jego wpisy kaskadowo.
- Propozycje są dopisywane przy pobraniu pierwszej strony, także po powrocie aplikacji na pierwszy plan. Korzystają z dat, regionu, rodzaju ekipy i przedziałów wieku tak jak wyszukiwanie z własnego wyjazdu. Jedna para własny/cudzy wyjazd daje jeden wpis. Na raz odświeżenie dopisuje do 100 nowych par. To propozycje w aplikacji; nie uruchamiają push przy zamkniętej aplikacji.

Odczyty i preferencje używają istniejącego licznika `mailbox_updates`, bez publikowania treści przez Realtime. Powrót na pierwszy plan, odświeżanie co 20 sekund i ręczne ponowienie uzupełniają subskrypcję. Zmiana konta usuwa stan klienta. Zapis jest potwierdzany odpowiedzią bazy.

W istniejącym środowisku z działającym push wystarczy kolejno:

```powershell
npx supabase@latest db push --linked
npx supabase@latest db query --linked --file scripts/check-notification-center-remote.sql
```

Nie trzeba ponownie wdrażać workera, rotować sekretów ani przebudowywać APK. Po wdrożeniu odśwież aplikację w Metro. Migracja przenosi dostępne niedawne zdarzenia kolejki oraz oczekujące zaproszenia i nieodczytane wiadomości do historii bez wysyłania historycznych push.

`npm test` sprawdza migrację w PostgreSQL/PGlite: izolację kont, odczyty, preferencje obu kategorii, kolejkę, propozycje, paginację, blokady i cascade. `npm run test:web` sprawdza historię i ustawienia w dwóch sesjach przeglądarki, ponowienia i niezależność od odczytu czatu. Zdalny skrypt SQL kończy się `ROLLBACK`, nie zostawia kont i nie wysyła push. Testów tych nie należy utożsamiać z testem dwóch fizycznych telefonów; scenariusze są w [PUSH.md](PUSH.md).
