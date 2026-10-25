# Wyszukiwanie ekip — aplikacja Dev

Nowy etap działa w aplikacji **RazemGo Dev** na jej osobnym backendzie **`kswuakzcnoqgovnwejhb`**. Migracje `202610250001_group_discovery.sql` oraz `202610250002_default_group_visibility.sql` wdrożono wyłącznie do Dev 25.10.2026. Preview, jego baza i zainstalowane APK testerów pozostały bez zmian.

## Praca na prawdziwych kontach Dev

Uruchom `npm run start:dev` i otwórz **RazemGo Dev** z Metro na porcie **8081**. Aplikacja korzysta z `.env.local` i prawdziwego Supabase Dev, przy `EXPO_PUBLIC_ENABLE_DEMO=false`. Wystarczy odświeżyć aplikację — ten etap nie dodaje bibliotek natywnych ani nie zmienia konfiguracji APK.

W **Odkrywaj → Ekipy** wyszukujesz prawdziwe profile Dev. Profile są **domyślnie widoczne**: nowe ekipy pojawiają się po zapisaniu podstawowego profilu, a istniejące ekipy bez zapisanego ustawienia otrzymują tę samą wartość. Właściciel może ukryć ekipę przez **Mój profil → Profil publiczny → Pokaż moją ekipę w wyszukiwarce**. Wcześniejsze świadome wyłączenia widoczności pozostają zachowane.

## Opcjonalny podgląd bez zdalnego backendu

Uruchom `npm run start:demo`. To osobny serwer Metro na porcie **8090**, używający aplikacji **RazemGo Dev** i schematu `razemgo-dev`. Na komputerze otwórz `http://localhost:8090/explore`; na telefonie połącz Dev z adresem tego serwera. Podgląd korzysta z przykładów w pamięci, pomija logowanie i nie czyta `.env.local`. Monitorowanie oraz połączenia z prawdziwym Supabase są wyłączone.

W Odkrywaj wybierz **Ekipy**. Przykłady obejmują rodziny, parę oraz ekipę bez ogłoszeń. Filtry działają lokalnie, można otworzyć profil i przygotować zaproszenie. Zmiany znikają po przeładowaniu. Zapis widoczności do bazy jest w podglądzie wyłączony; nie pokazujemy pozornego potwierdzenia zapisu.

Podgląd `start:demo` nie jest zwykłym trybem pracy nad aplikacją. Po podłączeniu funkcji do Dev serwer demonstracyjny został zatrzymany; standardowo pracujemy przez `start:dev` na porcie 8081.

## Zawartość etapu

- Odkrywaj ma widoki **Wyjazdy / Ekipy**. Kryteria tych widoków są niezależne. Wyszukiwanie ekip zaczyna się od rodzin; można wybrać wszystkie rodzaje ekip.
- Wyszukiwanie po nazwie pomija różnice w polskich znakach. Filtry obejmują rodzaj ekipy, wiek dzieci, sposób podróżowania, zainteresowania, psa/kota i aktywne ogłoszenia. Opcje jednej kategorii łączymy jako „lub”, kategorie jako „i”. Kolejność jest alfabetyczna; API stronicuje po 20 profili.
- Profil ekipy pokazuje avatar, opis publiczny, skład, sposób podróżowania, zainteresowania, zwierzęta i tylko aktywne publiczne ogłoszenia. Nie zawiera miejsca zamieszkania, e-maila, identyfikatora właściciela ani prywatnych preferencji dopasowań.
- **Mój profil → Profil publiczny** udostępnia opis i ustawienie widoczności, domyślnie włączone. Wyłączenie widoczności nie usuwa publicznych ogłoszeń ani już nawiązanych kontaktów. Edycja pozostałych danych ekipy nie włącza ponownie ukrytego profilu.
- Kontakt z profilu nie wymaga wyjazdu. Pierwsza wiadomość trafia do **Zaproszeń**; dopiero akceptacja tworzy rozmowę. Istniejące zaproszenia i rozmowy z daną ekipą są wykorzystywane ponownie. Historia kontaktu nie zmienia się w fikcyjny wyjazd.
- Blokady obu stron i zawieszenie konta obowiązują w wyszukiwarce, profilach i czacie. Zgłoszenia profilu trafiają do istniejącego panelu moderacji z kopią publicznego opisu. Zaproszenia i wiadomości korzystają z obecnej kolejki powiadomień oraz push; ten etap nie zmienia wdrożonych funkcji wysyłki.

## Sprawdzenie

`npm run test:groups` uruchamia testy modelu i pełny zestaw migracji w lokalnym PostgreSQL PGlite. Sprawdza izolację kont, RLS/RPC, domyślną widoczność i zachowanie wyłączeń, filtry, stronicowanie, brak wycieku prywatnych preferencji, kontakt bez wyjazdu, ponowienia, blokady, moderację, kolejkę push i zgodność dotychczasowego API wyjazdów. Nie wymaga danych ani połączenia z Supabase.

`npm run test:web` używa osobnego Metro na porcie 8085 i przechwytuje żądania do lokalnego API. Scenariusze obejmują filtry, profil bez ogłoszeń, przerwaną odpowiedź zaproszenia, akceptację i czat na dwóch kontach, nieudany zapis widoczności oraz brak migracji. Nie wysyła danych do zdalnych projektów.

Migracja jest już wdrożona **wyłącznie do Dev**. Do weryfikacji na urządzeniach pozostaje próba na dwóch telefonach. Nie uruchamiać `backend:preview migrate` ani publikacji Preview w ramach bieżącej pracy deweloperskiej.

### Wynik weryfikacji 25.10.2026

Przeszły lint, TypeScript, **276 testów Node**, **25 scenariuszy Playwright**, cztery testy Deno z dziesięcioma krokami oraz eksport bundla Androida. Nowe scenariusze SQL obejmują również blokowanie i odblokowanie publicznej ekipy przed pierwszym zaproszeniem. Podgląd na porcie 8090 sprawdzono w przeglądarce o szerokości 390 px; podczas przejścia z listy ekip do profilu nie wykonał żadnych żądań poza localhost. Zrzuty kontrolne znajdują się w ignorowanym katalogu `.expo/`.

Po wdrożeniu migracji wykonano również test rzeczywistych API Auth i PostgREST na **trzech tymczasowych kontach Dev**. Potwierdzono filtry, zapis widoczności, profil bez ogłoszeń, blokowanie przed kontaktem, ponowienia zaproszenia, akceptację, czat, odczyty, dostęp z drugiej sesji, zgłoszenie oraz odmowę dostępu trzeciemu kontu. Konta, powiązane profile i testowe zgłoszenie usunięto, a ich usunięcie zweryfikowano. Nie zmieniano profili istniejących użytkowników. Techniczny wynik testu znajduje się w ignorowanym pliku `.expo/environments/groups-dev-check.local.json`.

Po restarcie Metro na porcie 8081 sprawdzono również manifest oraz rzeczywisty bundle Androida: pakiet `pl.razemgo.app.development`, wariant `development`, schemat `razemgo-dev`, adres Supabase Dev i nowe API `send_profile_invitation`. Bundle nie zawiera adresu Supabase Preview ani klucza podglądu demonstracyjnego; `.env.local` ma wyłączone dane przykładowe.

Nie testowano nowego przepływu na fizycznym telefonie ani rzeczywistego dostarczenia push dla kontaktu z profilu. Test SQL potwierdził utworzenie zdarzenia w lokalnej kolejce. Nie wdrażano nowych Edge Functions, aktualizacji OTA ani APK. Baza Preview nie była celem żadnego polecenia tego wdrożenia.
