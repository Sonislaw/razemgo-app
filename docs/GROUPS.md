# Wyszukiwanie ekip — aplikacja Dev

Nowy etap działa w aplikacji **RazemGo Dev** na jej osobnym backendzie **`kswuakzcnoqgovnwejhb`**. Migracje `202610250001_group_discovery.sql`, `202610250002_default_group_visibility.sql`, `202610250003_group_compatibility.sql` i `202610250004_group_result_count.sql` wdrożono wyłącznie do Dev 25.10.2026. Preview, jego baza i zainstalowane APK testerów pozostały bez zmian.

## Praca na prawdziwych kontach Dev

Uruchom `npm run start:dev` i otwórz **RazemGo Dev** z Metro na porcie **8081**. Aplikacja korzysta z `.env.local` i prawdziwego Supabase Dev, przy `EXPO_PUBLIC_ENABLE_DEMO=false`. Wystarczy odświeżyć aplikację — ten etap nie dodaje bibliotek natywnych ani nie zmienia konfiguracji APK.

W **Odkrywaj → Ekipy** wyszukujesz prawdziwe profile Dev. Profile są **domyślnie widoczne**: nowe ekipy pojawiają się po zapisaniu podstawowego profilu, a istniejące ekipy bez zapisanego ustawienia otrzymują tę samą wartość. Właściciel może ukryć ekipę przez **Mój profil → Profil publiczny → Pokaż moją ekipę w wyszukiwarce**. Wcześniejsze świadome wyłączenia widoczności pozostają zachowane.

## Opcjonalny podgląd bez zdalnego backendu

Uruchom `npm run start:demo`. To osobny serwer Metro na porcie **8090**, używający aplikacji **RazemGo Dev** i schematu `razemgo-dev`. Na komputerze otwórz `http://localhost:8090/explore`; na telefonie połącz Dev z adresem tego serwera. Podgląd korzysta z przykładów w pamięci, pomija logowanie i nie czyta `.env.local`. Monitorowanie oraz połączenia z prawdziwym Supabase są wyłączone.

W Odkrywaj wybierz **Ekipy**. Przykłady obejmują rodziny, parę oraz ekipę bez ogłoszeń. Filtry działają lokalnie, można otworzyć profil i przygotować zaproszenie. Zmiany znikają po przeładowaniu. Zapis widoczności do bazy jest w podglądzie wyłączony; nie pokazujemy pozornego potwierdzenia zapisu.

Podgląd `start:demo` nie jest zwykłym trybem pracy nad aplikacją. Po podłączeniu funkcji do Dev serwer demonstracyjny został zatrzymany; standardowo pracujemy przez `start:dev` na porcie 8081.

## Zawartość etapu

- Odkrywaj ma widoki **Wyjazdy / Ekipy**. Kryteria tych widoków są niezależne. Wyszukiwanie ekip zaczyna się z wyzerowanymi filtrami i obejmuje wszystkie rodzaje ekip.
- Wyszukiwanie po nazwie pomija różnice w polskich znakach. Filtry obejmują rodzaj ekipy, wiek dzieci, sposób podróżowania, zainteresowania, psa/kota i aktywne ogłoszenia. Opcje jednej kategorii łączymy jako „lub”, kategorie jako „i”. Domyślna kolejność to najwyższa zgodność profili; można wybrać alfabetyczną. API stronicuje po 20 profili.
- Nazwa ekipy jest wpisywana w panelu filtrów. Przycisk „Pokaż wyniki · N” aktualizuje liczbę podczas zmieniania kryteriów, po 250 ms przerwy. RPC `count_public_groups` zlicza wszystkie pasujące profile, z tymi samymi zasadami widoczności, blokad i zawieszenia kont co lista. Nie ogranicza licznika do pierwszych 20 wyników i nie pobiera danych profili. Podczas liczenia pojawia się „…”, a błąd pozwala ponowić zliczanie lub zastosować filtry. Opóźnione odpowiedzi dla poprzednich ustawień są ignorowane.
- Przełącznik **Tylko online** jest domyślnie wyłączony i zeruje się razem z pozostałymi filtrami. Gdy jest włączony, lista oraz licznik uwzględniają tylko ekipy z aktywnym połączeniem aplikacji. Warunek jest sprawdzany w bazie przed sortowaniem i limitem 20 wyników, przy tych samych regułach sesji i wygasania co kropki na avatarach. Aktywny widok i otwarty panel z tym filtrem odświeżają dane co 15 sekund. Odświeżenie listy zachowuje liczbę wczytanych stron i nie usuwa kart na czas pobierania. Podgląd demonstracyjny nie symuluje aktywnych sesji.
- Serduszko zapisuje prywatne ulubione ekipy i wyjazdy. Filtr **Tylko ulubione** działa osobno w obu widokach i łączy się z pozostałymi kryteriami. Katalog Ekip i jego licznik filtrują ulubione w SQL przed stronicowaniem. Szczegóły zapisu, uprawnień i weryfikacji opisuje [FAVORITES.md](FAVORITES.md).
- Profil ekipy pokazuje avatar, opis publiczny, skład, sposób podróżowania, zainteresowania, zwierzęta i tylko aktywne publiczne ogłoszenia. Nie zawiera miejsca zamieszkania, e-maila, identyfikatora właściciela ani prywatnych preferencji dopasowań.
- **Mój profil → Profil publiczny** udostępnia opis i ustawienie widoczności, domyślnie włączone. Wyłączenie widoczności nie usuwa publicznych ogłoszeń ani już nawiązanych kontaktów. Edycja pozostałych danych ekipy nie włącza ponownie ukrytego profilu.
- Kontakt z profilu nie wymaga wyjazdu. Pierwsza wiadomość trafia do **Zaproszeń**; dopiero akceptacja tworzy rozmowę. Istniejące zaproszenia i rozmowy z daną ekipą są wykorzystywane ponownie. Historia kontaktu nie zmienia się w fikcyjny wyjazd.
- Blokady obu stron i zawieszenie konta obowiązują w wyszukiwarce, profilach i czacie. Zgłoszenia profilu trafiają do istniejącego panelu moderacji z kopią publicznego opisu. Zaproszenia i wiadomości korzystają z obecnej kolejki powiadomień oraz push; ten etap nie zmienia wdrożonych funkcji wysyłki.

## Zgodność profili

Karty ekip i profil szczegółowy pokazują procent zgodności oraz krótkie powody. Obliczenie uwzględnia **obie strony** i odbywa się w bazie; aplikacja nie otrzymuje prywatnych tablic preferencji ani ich opisu.

| Kryterium | Waga |
| --- | --- |
| Preferowany rodzaj ekipy | 35 |
| Preferowany wiek dzieci | 30 |
| Wspólne zainteresowania | 25 |
| Sposób podróżowania | 10 |

Rodzaj i wiek oceniamy w obu kierunkach, po połowie wagi. Puste preferencje oznaczają dowolność; kategorię uwzględniamy, gdy przynajmniej jedna ekipa podała preferencję. Niepodany wiek dzieci pomijamy jako brak danych. Zainteresowania porównujemy symetrycznie: `2 × liczba wspólnych / łączna liczba zainteresowań obu ekip`. Zwierzęta, ogłoszenia, daty i lokalizacje nie wpływają na tę ocenę.

Wynik to suma punktów podzielona przez sumę wag ocenionych kryteriów. Procent pokazujemy dopiero przy co najmniej **60 punktach dostępnej wagi**. W przeciwnym razie widnieje „Za mało danych do oceny”. Jeżeli brakuje części potrzebnych kryteriów, wynik ma dopisek „Ograniczone dane”. Kategoria wieku jest potrzebna tylko wtedy, gdy któraś ekipa podała preferowany wiek. Procent opisuje zgodność dostępnych kryteriów, nie prawdopodobieństwo udanej znajomości.

Nowe RPC `list_ranked_public_groups` sortuje wszystkie pasujące, dostępne profile **przed** pobraniem strony. Przy remisie obowiązuje nazwa i ID; profile bez oceny są na końcu, także za prawidłowym wynikiem 0%. Niska zgodność nie wyklucza profilu. Kursor zawiera wynik i tryb sortowania. Dotychczasowe alfabetyczne RPC `list_public_groups` zachowano dla zgodności. `get_public_group` zwraca ten sam wynik co lista. Lokalny model służy wyłącznie podglądowi demonstracyjnemu; testy sprawdzają zgodność jego wyników z rzeczywistym SQL.

## Sprawdzenie

`npm run test:groups` uruchamia testy modelu i pełny zestaw migracji w lokalnym PostgreSQL PGlite. Sprawdza izolację kont, RLS/RPC, domyślną widoczność i zachowanie wyłączeń, filtry, stronicowanie, brak wycieku prywatnych preferencji, kontakt bez wyjazdu, ponowienia, blokady, moderację, kolejkę push i zgodność dotychczasowego API wyjazdów. Nie wymaga danych ani połączenia z Supabase.

`npm run test:web` używa osobnego Metro na porcie 8085 i przechwytuje żądania do lokalnego API. Scenariusze obejmują filtry, profil bez ogłoszeń, przerwaną odpowiedź zaproszenia, akceptację i czat na dwóch kontach, nieudany zapis widoczności oraz brak migracji. Nie wysyła danych do zdalnych projektów.

Migracja jest już wdrożona **wyłącznie do Dev**. Do weryfikacji na urządzeniach pozostaje próba na dwóch telefonach. Nie uruchamiać `backend:preview migrate` ani publikacji Preview w ramach bieżącej pracy deweloperskiej.

### Wynik weryfikacji 25.10.2026

Przeszły lint, TypeScript, **276 testów Node**, **25 scenariuszy Playwright**, cztery testy Deno z dziesięcioma krokami oraz eksport bundla Androida. Nowe scenariusze SQL obejmują również blokowanie i odblokowanie publicznej ekipy przed pierwszym zaproszeniem. Podgląd na porcie 8090 sprawdzono w przeglądarce o szerokości 390 px; podczas przejścia z listy ekip do profilu nie wykonał żadnych żądań poza localhost. Zrzuty kontrolne znajdują się w ignorowanym katalogu `.expo/`.

Po wdrożeniu migracji wykonano również test rzeczywistych API Auth i PostgREST na **trzech tymczasowych kontach Dev**. Potwierdzono filtry, zapis widoczności, profil bez ogłoszeń, blokowanie przed kontaktem, ponowienia zaproszenia, akceptację, czat, odczyty, dostęp z drugiej sesji, zgłoszenie oraz odmowę dostępu trzeciemu kontu. Konta, powiązane profile i testowe zgłoszenie usunięto, a ich usunięcie zweryfikowano. Nie zmieniano profili istniejących użytkowników. Techniczny wynik testu znajduje się w ignorowanym pliku `.expo/environments/groups-dev-check.local.json`.

Po restarcie Metro na porcie 8081 sprawdzono również manifest oraz rzeczywisty bundle Androida: pakiet `pl.razemgo.app.development`, wariant `development`, schemat `razemgo-dev`, adres Supabase Dev i nowe API `send_profile_invitation`. Bundle nie zawiera adresu Supabase Preview ani klucza podglądu demonstracyjnego; `.env.local` ma wyłączone dane przykładowe.

Nie testowano nowego przepływu na fizycznym telefonie ani rzeczywistego dostarczenia push dla kontaktu z profilu. Test SQL potwierdził utworzenie zdarzenia w lokalnej kolejce. Nie wdrażano nowych Edge Functions, aktualizacji OTA ani APK. Baza Preview nie była celem żadnego polecenia tego wdrożenia.

Po dodaniu zgodności profili przeszły lint, TypeScript, **287 testów Node** oraz **cztery scenariusze Playwright dotyczące ekip**, w tym widok 320 px, wynik 0%, brak oceny, informacja o niepełnych danych i zmiana sortowania. Testy SQL potwierdziły sortowanie przed limitem 20 wyników, stronicowanie przez remisy i brak ocen, filtry, blokady oraz ochronę prywatnych preferencji.

Po wdrożeniu `202610250003_group_compatibility.sql` rzeczywiste API Dev potwierdziło zmianę wyniku po edycji preferencji drugiej ekipy, symetrię wyniku, brak procentu przy niewystarczających danych, neutralność zwierząt oraz obie kolejności sortowania. Trzy konta i testowe zgłoszenie usunięto po weryfikacji. Sprawdzono również nowy endpoint w rzeczywistym bundlu Androida serwowanym przez Metro Dev na porcie 8081. Testu tej zmiany na fizycznym telefonie jeszcze nie wykonano.

Licznik wyników filtrów przeszedł lint, TypeScript, **288 testów Node** oraz scenariusze Playwright obejmujące zmianę kryteriów, wynik 0, opóźnione odpowiedzi i ponowienie po błędzie. Testy SQL sprawdzają zgodność licznika ze wszystkimi stronami wyników, także powyżej 20 profili, oraz uprawnienia i blokady. Po wdrożeniu `202610250004_group_result_count.sql` rzeczywiste API Dev potwierdziło licznik, ukrywanie profili i odmowę dostępu bez logowania. Tymczasowe konta i zgłoszenie usunięto po kontroli.
