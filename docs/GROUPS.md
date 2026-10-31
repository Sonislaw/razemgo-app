# Wyszukiwanie ekip

**Bieżący Dev 31.10.2026:** aplikacja korzysta z katalogu V3, uporządkowanego
alfabetycznie. Usunięto etykiety, ranking, sortowanie „Polecane” oraz obliczanie
zgodności. Zwykłe filtry, ulubione, online i strony po pięć są zachowane.
[Aktualne kontrakty](UNRANKED_DISCOVERY.md). Opisy starszych rankingów poniżej
stanowią historię wcześniejszych wersji i kontraktów.

**Aktualizacja Dev 31.10.2026:** odczyty V2 prezentują wspólne zainteresowania i wiek dzieci bez procentowej oceny i komunikatów o brakujących danych. Ranking ekip porównuje faktyczne cechy profili; prywatna sekcja „Kogo chcę poznać?” została wycofana na Dev. [Kontrakty i weryfikacja](RECOMMENDATIONS.md). API V1 nadal obsługuje Preview i starszych klientów.

Funkcja działa w **RazemGo Dev** na osobnym backendzie **`kswuakzcnoqgovnwejhb`** oraz w **Preview 1.2.0** na `tueqqnbdvuazdxoqtpvk`. Migracje `202610260002_group_pagination.sql` i `202610260003_group_trip_pagination.sql` dodają stronicowanie katalogu ekip oraz ogłoszeń w profilu i są wdrożone do obu projektów. Dane testerów zachowano. Szczegóły aktualizacji są w [RELEASE_1.2.0.md](RELEASE_1.2.0.md).

## Praca na prawdziwych kontach Dev

Uruchom `npm run start:dev` i otwórz **RazemGo Dev** z Metro na porcie **8081**. Aplikacja korzysta z `.env.local` i prawdziwego Supabase Dev, przy `EXPO_PUBLIC_ENABLE_DEMO=false`. Wystarczy odświeżyć aplikację — ten etap nie dodaje bibliotek natywnych ani nie zmienia konfiguracji APK.

W **Odkrywaj → Ekipy** wyszukujesz prawdziwe profile Dev. Profile są **domyślnie widoczne**: nowe ekipy pojawiają się po zapisaniu podstawowego profilu, a istniejące ekipy bez zapisanego ustawienia otrzymują tę samą wartość. Właściciel może ukryć ekipę przez **Mój profil → Profil publiczny → Pokaż moją ekipę w wyszukiwarce**. Wcześniejsze świadome wyłączenia widoczności pozostają zachowane.

## Opcjonalny podgląd bez zdalnego backendu

Uruchom `npm run start:demo`. To osobny serwer Metro na porcie **8090**, używający aplikacji **RazemGo Dev** i schematu `razemgo-dev`. Na komputerze otwórz `http://localhost:8090/explore`; na telefonie połącz Dev z adresem tego serwera. Podgląd korzysta z przykładów w pamięci, pomija logowanie i nie czyta `.env.local`. Monitorowanie oraz połączenia z prawdziwym Supabase są wyłączone.

W Odkrywaj wybierz **Ekipy**. Przykłady obejmują rodziny, parę oraz ekipę bez ogłoszeń. Filtry działają lokalnie, można otworzyć profil i przygotować zaproszenie. Zmiany znikają po przeładowaniu. Zapis widoczności do bazy jest w podglądzie wyłączony; nie pokazujemy pozornego potwierdzenia zapisu.

Podgląd `start:demo` nie jest zwykłym trybem pracy nad aplikacją. Po podłączeniu funkcji do Dev serwer demonstracyjny został zatrzymany; standardowo pracujemy przez `start:dev` na porcie 8081.

## Zawartość etapu

- Odkrywaj ma widoki **Wyjazdy / Ekipy**. Kryteria tych widoków są niezależne. Wyszukiwanie ekip zaczyna się z wyzerowanymi filtrami i obejmuje wszystkie rodzaje ekip.
- Wyszukiwanie po nazwie pomija różnice w polskich znakach. Filtry obejmują rodzaj ekipy, wiek dzieci, sposób podróżowania, zainteresowania, psa/kota i aktywne ogłoszenia. Opcje jednej kategorii łączymy jako „lub”, kategorie jako „i”. Domyślna kolejność to „Polecane”; można wybrać alfabetyczną. Lista pobiera po 5 profili. „Pokaż więcej ekip” pobiera kolejną piątkę, a podczas żądania pokazuje „Wczytywanie ekip” i kręciołek oraz blokuje ponowne kliknięcie. Błąd zachowuje wcześniejsze profile i pozwala ponowić tę samą stronę, bez duplikatów.
- `list_ranked_public_groups(filters, sort_mode, after_cursor, page_size)` obsługuje strony 1–20 i zwraca `items`, `total_count`, `has_more`, `cursor`. Aplikacja jawnie wybiera 5; starsze wywołania bez `page_size` zachowują domyślną wartość 20. Nagłówek pokazuje pełną liczbę dopasowań. Filtry i ranking są stosowane przed limitem strony.
- Powrót z innej zakładki zaczyna listę od pierwszych 5 profili. Filtry i sortowanie pozostają zachowane, także po przełączeniu Wyjazdy / Ekipy. Wejście w profil z karty lub przycisku „Profil” zapamiętuje bieżącą listę; powrót odświeża wszystkie wcześniej wczytane porcje i zachowuje pozycję przewinięcia, również po obejrzeniu ogłoszenia w profilu.
- Nazwa ekipy jest wpisywana w panelu filtrów. Przycisk „Pokaż wyniki · N” aktualizuje liczbę podczas zmieniania kryteriów, po 250 ms przerwy. RPC `count_public_groups` zlicza wszystkie pasujące profile, z tymi samymi zasadami widoczności, blokad i zawieszenia kont co lista. Nie ogranicza licznika do wczytanych profili i nie pobiera ich danych. Podczas liczenia pojawia się „…”, a błąd pozwala ponowić zliczanie lub zastosować filtry. Opóźnione odpowiedzi dla poprzednich ustawień są ignorowane.
- Przełącznik **Tylko online** jest domyślnie wyłączony i zeruje się razem z pozostałymi filtrami. Gdy jest włączony, lista oraz licznik uwzględniają tylko ekipy z aktywnym połączeniem aplikacji. Warunek jest sprawdzany w bazie przed sortowaniem i limitem strony, przy tych samych regułach sesji i wygasania co kropki na avatarach. Aktywny widok i otwarty panel z tym filtrem odświeżają dane co 15 sekund. Odświeżenie listy zachowuje liczbę wczytanych stron i nie usuwa kart na czas pobierania. Podgląd demonstracyjny nie symuluje aktywnych sesji.
- Serduszko zapisuje prywatne ulubione ekipy i wyjazdy. Filtr **Tylko ulubione** działa osobno w obu widokach i łączy się z pozostałymi kryteriami. Katalog Ekip i jego licznik filtrują ulubione w SQL przed stronicowaniem. Szczegóły zapisu, uprawnień i weryfikacji opisuje [FAVORITES.md](FAVORITES.md).
- Profil ekipy pokazuje avatar, opis publiczny, skład, sposób podróżowania, zainteresowania, zwierzęta i tylko aktywne publiczne ogłoszenia. Nie zawiera miejsca zamieszkania, e-maila, identyfikatora właściciela ani prywatnych preferencji dopasowań.
- **Profil ekipy → Ogłoszenia ekipy** pobiera pierwsze 5 wyjazdów. „Pokaż więcej wyjazdów” pobiera kolejnych 5; podczas żądania pokazuje „Wczytywanie ogłoszeń”, kręciołek i blokuje kolejne kliknięcie. Nagłówek pokazuje pełną liczbę aktywnych ogłoszeń. Błąd zachowuje karty i pozwala ponowić tę samą stronę. Powrót ze szczegółów wyjazdu odświeża wcześniej obejrzane porcje bez usuwania kart i zachowuje przewinięcie. Nowe otwarcie profilu zaczyna od 5.
- Nowe przeciążenie `get_public_group(target_group_id, after_cursor, page_size)` zwraca profil, pełną liczbę ogłoszeń, ograniczoną tablicę `trips`, `has_more` i `cursor`. Strony mają 1–20 elementów, aplikacja wybiera 5. Kolejność to najnowsza publikacja, następnie ID; kursor działa również po usunięciu jego wyjazdu i jest przypisany do oglądającego konta oraz ekipy. Indeks po ekipie i publikacji pozwala ograniczyć wyniki przed budowaniem kart. Dotychczasowe wywołanie z jednym argumentem pozostaje dostępne dla starszych klientów. Obie wersje zachowują reguły widoczności, kontaktów, blokad i moderacji; nowe wywołanie wymaga aktywnej sesji.
- **Mój profil → Profil publiczny** udostępnia opis i ustawienie widoczności, domyślnie włączone. Wyłączenie widoczności nie usuwa publicznych ogłoszeń ani już nawiązanych kontaktów. Edycja pozostałych danych ekipy nie włącza ponownie ukrytego profilu.
- Kontakt z profilu nie wymaga wyjazdu. Pierwsza wiadomość trafia do **Zaproszeń**; dopiero akceptacja tworzy rozmowę. Istniejące zaproszenia i rozmowy z daną ekipą są wykorzystywane ponownie. Historia kontaktu nie zmienia się w fikcyjny wyjazd.
- Blokady obu stron i zawieszenie konta obowiązują w wyszukiwarce, profilach i czacie. Zgłoszenia profilu trafiają do istniejącego panelu moderacji z kopią publicznego opisu. Zaproszenia i wiadomości korzystają z obecnej kolejki powiadomień oraz push; ten etap nie zmienia wdrożonych funkcji wysyłki.

## Rekomendacje ekip

Dev pokazuje etykiety „Wspólne zainteresowania” lub „Podobny wiek dzieci” oraz konkretne powody. Nie pokazuje procentów ani ocen brakujących danych. Etykiety opierają się na rzeczywistych cechach profili i nie blokują kontaktu.

Sekcja „Kogo chcę poznać?” została usunięta z profilu i edycji. Rodzaj poszukiwanej ekipy oraz wiek dzieci wybiera się w filtrach. Ranking „Polecane” porównuje rzeczywisty rodzaj ekipy (waga 35), wiek dzieci obu ekip, jeśli jest podany (30), wspólne zainteresowania (25) i sposób podróżowania (10). Zwierzęta nie wykluczają kontaktu. Ranking zachowuje stronicowanie i kolejność przed pobraniem strony; przy remisie decydują nazwa i ID. Pełne uzasadnienia powstają tylko dla zwracanej strony.

Starsze API pozostaje dostępne ze zgodnym kształtem odpowiedzi. Wycofane wartości `group_preferences` są czyszczone i nie sterują odczytami Dev. [Kontrakty, kontekst i testy](RECOMMENDATIONS.md).

## Sprawdzenie

`npm run test:groups` uruchamia testy modelu i pełny zestaw migracji w lokalnym PostgreSQL PGlite. Sprawdza izolację kont, RLS/RPC, domyślną widoczność i zachowanie wyłączeń, filtry, stronicowanie, brak wycieku prywatnych preferencji, kontakt bez wyjazdu, ponowienia, blokady, moderację, kolejkę push i zgodność dotychczasowego API wyjazdów. Nie wymaga danych ani połączenia z Supabase.

`npm run test:web` używa osobnego Metro na porcie 8085 i przechwytuje żądania do lokalnego API. Scenariusze obejmują filtry, profil bez ogłoszeń, przerwaną odpowiedź zaproszenia, akceptację i czat na dwóch kontach, nieudany zapis widoczności oraz brak migracji. Nie wysyła danych do zdalnych projektów.

Codzienną pracę prowadzimy w Dev. Preview aktualizujemy wyłącznie w ramach zatwierdzonego wydania; ostatnim takim wdrożeniem jest 1.2.0. Testy na fizycznych telefonach raportujemy oddzielnie od kontroli API i przeglądarki. Poniższe wyniki z 25.10 opisują wcześniejsze wdrożenie Dev; bieżące wyniki Preview są w dokumencie wydania.

### Wynik weryfikacji 25.10.2026

Przeszły lint, TypeScript, **276 testów Node**, **25 scenariuszy Playwright**, cztery testy Deno z dziesięcioma krokami oraz eksport bundla Androida. Nowe scenariusze SQL obejmują również blokowanie i odblokowanie publicznej ekipy przed pierwszym zaproszeniem. Podgląd na porcie 8090 sprawdzono w przeglądarce o szerokości 390 px; podczas przejścia z listy ekip do profilu nie wykonał żadnych żądań poza localhost. Zrzuty kontrolne znajdują się w ignorowanym katalogu `.expo/`.

Po wdrożeniu migracji wykonano również test rzeczywistych API Auth i PostgREST na **trzech tymczasowych kontach Dev**. Potwierdzono filtry, zapis widoczności, profil bez ogłoszeń, blokowanie przed kontaktem, ponowienia zaproszenia, akceptację, czat, odczyty, dostęp z drugiej sesji, zgłoszenie oraz odmowę dostępu trzeciemu kontu. Konta, powiązane profile i testowe zgłoszenie usunięto, a ich usunięcie zweryfikowano. Nie zmieniano profili istniejących użytkowników. Techniczny wynik testu znajduje się w ignorowanym pliku `.expo/environments/groups-dev-check.local.json`.

Po restarcie Metro na porcie 8081 sprawdzono również manifest oraz rzeczywisty bundle Androida: pakiet `pl.razemgo.app.development`, wariant `development`, schemat `razemgo-dev`, adres Supabase Dev i nowe API `send_profile_invitation`. Bundle nie zawiera adresu Supabase Preview ani klucza podglądu demonstracyjnego; `.env.local` ma wyłączone dane przykładowe.

Nie testowano nowego przepływu na fizycznym telefonie ani rzeczywistego dostarczenia push dla kontaktu z profilu. Test SQL potwierdził utworzenie zdarzenia w lokalnej kolejce. Nie wdrażano nowych Edge Functions, aktualizacji OTA ani APK. Baza Preview nie była celem żadnego polecenia tego wdrożenia.

Po dodaniu zgodności profili przeszły lint, TypeScript, **287 testów Node** oraz **cztery scenariusze Playwright dotyczące ekip**, w tym widok 320 px, wynik 0%, brak oceny, informacja o niepełnych danych i zmiana sortowania. Testy SQL potwierdziły sortowanie przed limitem 20 wyników, stronicowanie przez remisy i brak ocen, filtry, blokady oraz ochronę prywatnych preferencji.

Po wdrożeniu `202610250003_group_compatibility.sql` rzeczywiste API Dev potwierdziło zmianę wyniku po edycji preferencji drugiej ekipy, symetrię wyniku, brak procentu przy niewystarczających danych, neutralność zwierząt oraz obie kolejności sortowania. Trzy konta i testowe zgłoszenie usunięto po weryfikacji. Sprawdzono również nowy endpoint w rzeczywistym bundlu Androida serwowanym przez Metro Dev na porcie 8081. Testu tej zmiany na fizycznym telefonie jeszcze nie wykonano.

Licznik wyników filtrów przeszedł lint, TypeScript, **288 testów Node** oraz scenariusze Playwright obejmujące zmianę kryteriów, wynik 0, opóźnione odpowiedzi i ponowienie po błędzie. Testy SQL sprawdzają zgodność licznika ze wszystkimi stronami wyników, także powyżej 20 profili, oraz uprawnienia i blokady. Po wdrożeniu `202610250004_group_result_count.sql` rzeczywiste API Dev potwierdziło licznik, ukrywanie profili i odmowę dostępu bez logowania. Tymczasowe konta i zgłoszenie usunięto po kontroli.
