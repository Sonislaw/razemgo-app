# Wyszukiwanie wyjazdów po stronie Supabase

**Aktualizacja Dev 31.10.2026:** aplikacja korzysta z odczytów V3 bez obliczania zgodności, etykiet i rankingu. Wyjazdy są wyświetlane od najnowszych; filtry i stronicowanie po pięć pozostają dostępne. [Aktualne kontrakty i weryfikacja](UNRANKED_DISCOVERY.md). Poniższy opis liczbowego rankingu i API V1 pozostaje historią dla Preview i starszych klientów.

Funkcja działa w **RazemGo Dev** (`kswuakzcnoqgovnwejhb`) oraz od wydania **Preview 1.2.0** w backendzie testerów (`tueqqnbdvuazdxoqtpvk`). Migracja `202610260001_trip_discovery.sql` jest wdrożona do obu projektów. Zachowano starsze API i dane testerów. Kontrolę wydania opisano w [RELEASE_1.2.0.md](RELEASE_1.2.0.md).

## Zachowanie aplikacji

- Odkrywaj pobiera pierwsze 5 pasujących wyjazdów. „Pokaż więcej wyjazdów” pobiera kolejnych 5 (ostatnia porcja może być mniejsza). Aplikacja nie pobiera całego katalogu w tle.
- Typ ogłoszenia, klimat, miejsce, zakres dat z tolerancją, rodzaj ekipy, wiek dzieci, zwierzęta i ulubione filtruje baza, przed sortowaniem i limitem strony. Wybory jednej kategorii łączą się jako „lub”, różne kategorie jako „i”.
- „Domyślnie” oznacza najnowszą publikację, następnie ID. Zgodność jest obliczana w bazie dla całego pasującego zbioru, przed stronicowaniem; przy remisie decyduje publikacja i ID. Zachowano dotychczasowe wagi, powody, zwykłe punktowanie zwierząt i wybór jednego najlepszego własnego planu. Wynik na karcie pochodzi z tego samego obliczenia co sortowanie.
- Nagłówek wyników i przycisk w filtrach pokazują pełną liczbę dopasowań, nie liczbę wczytanych kart. Licznik w filtrach wysyła zapytanie po 250 ms przerwy; stare odpowiedzi są ignorowane. Nieudany odczyt udostępnia ponowienie, bez fikcyjnego zera.
- Błąd kolejnej strony zachowuje już wczytane karty i kursor. Ponowienie pobiera tę samą stronę. Zmiana kryteriów oraz powrót z innej zakładki (także z zakładki Ekipy) zaczynają listę od pierwszych 5 ogłoszeń, bez odtwarzania wcześniejszych stron. Filtry i sortowanie pozostają zachowane.
- Wejście z karty w szczegóły wyjazdu lub profil ekipy zachowuje pozycję listy. Powrót odświeża wszystkie wcześniej wczytane porcje, pozostawiając je widoczne podczas pobierania. Działa też przejście wyjazd → profil → wyjazd → lista. Zamiar powrotu jest jednorazowy i przypisany do bieżącego konta oraz zapytania. Ręczne odświeżenie i wznowienie aplikacji na otwartym ekranie również zachowują liczbę wcześniej obejrzanych stron.
- Start niezależnie pobiera tylko najnowsze cudze ogłoszenie i porównuje je z własnymi planami. Nie dziedziczy kryteriów otwartego Odkrywaj.
- Szczegóły wyjazdu pobierają wskazany ID niezależnie od strony i filtrów listy. Działają linki z powiadomień i profilu ekipy, także do ogłoszenia spoza aktualnych wyników.
- Licznik propozycji w szczegółach własnego planu korzysta z zapytania zliczającego, nie z zawartości wczytanej strony.

## API i uprawnienia

`search_public_trips(filters, sort_mode, after_cursor, page_size)` zwraca `items`, `total_count`, `has_more`, `cursor`. API obsługuje strony 1–20; Start wybiera 1, lista 5. Wspólny rozmiar porcji listy określa `TRIP_SEARCH_PAGE_SIZE`. `count_public_trips(filters)` stosuje te same warunki bez limitu strony. `get_discovery_trip(target_trip_id, filters)` zwraca pojedynczy dostępny wyjazd i zgodność; kryteria wpływają na ocenę, lecz nie ukrywają szczegółów dostępnego ogłoszenia.

Kursor jest oparty na wyniku, czasie publikacji i ID oraz powiązany z zalogowaną ekipą, kryteriami i sortowaniem. Nie korzysta z przesunięć numerowanych stron. Powtórzone ID nie duplikują kart. Błędny kursor lub kryteria są odrzucane z `22023`.

Lokalizacja zachowuje ID wybranej miejscowości. Region obejmuje wyjazdy w województwie, a kraje odpowiadają obecnemu katalogowi miejsc w aplikacji: Polska i przykładowa Słowenia. Obsłużono starsze nazwy „Pomorze” i „Dolny Śląsk”. Swobodne wyszukiwanie tekstu pomija polskie znaki i traktuje `%` oraz `_` dosłownie.

Wszystkie endpointy wymagają aktywnej sesji i profilu. Uwzględniają obustronne blokady, zawieszenia kont, moderację oraz publikację, widoczność i termin planu. Ukrycie samego profilu nie ukrywa jego publicznych wyjazdów. Na Dev preferencje dawnej sekcji profilu „Kogo chcę poznać?” są wycofane. Kryteria wyszukiwania pochodzą z filtrów lub konkretnego własnego wyjazdu. Pomocniki w `discovery_private` są niedostępne dla `anon` i `authenticated`. Starszy `list_public_trips` pozostaje zgodny z dotychczasowymi klientami.

Żądania aplikacji są przypinane do tokenu konkretnego konta. Zmiana konta, filtrów lub ekranu unieważnia spóźnione odpowiedzi. Podgląd demonstracyjny nadal filtruje lokalnie; zwykły Dev korzysta z nowych RPC, bez automatycznego powrotu do pobierania całego katalogu.

## Weryfikacja

- 372 testy Node, w tym rzeczywiste migracje PostgreSQL/PGlite: ponad 20 wyjazdów, remisy, sortowanie całego zbioru, wszystkie filtry i licznik, tolerancja dat, zgodność z dotychczasowym modelem, ulubione, bezpośrednie linki, prywatność, brak sesji i dostęp anonimowy.
- Testy magazynu listy: ograniczona liczba pobrań, ponowienia, usuwanie duplikatów, odświeżanie obejrzanych stron, reset do pierwszej strony po powrocie, spóźnione odpowiedzi oraz izolacja kont.
- 14 różnych scenariuszy Playwright: strony 20/40/45, błąd następnej strony i ponowienie, pełny licznik filtrów, sortowanie oraz szczegóły spoza bieżących wyników, a także istniejące ulubione, reakcje, logowanie, Ekipy i powiadomienia. Osobny scenariusz sprawdza błąd licznika. Scenariusz pełnego cyklu wyjazdu ponowiono po błędzie sieci przeglądarki przy przeładowaniu; ponowny przebieg przeszedł.
- Rzeczywiste API Dev na dwóch tymczasowych kontach i 25 wyjazdach potwierdziło strony 20+5, zgodność przed limitem, licznik, daty, ulubione, szczegóły i blokady. Konta oraz wyjazdy usunięto, bez rejestrowania urządzeń i wysyłania fizycznych push.

Scenariusze stronicowania sprawdzają 5/10/13 kart, ponowienie nieudanej strony i wskaźnik ładowania, pełny licznik, sortowanie i bezpośredni link do szczegółów. Sprawdzają też reset po zmianie zakładki oraz zachowanie 10 kart i dokładnego przewinięcia po powrocie z wyjazdu, profilu ekipy i zagnieżdżonej nawigacji.

Lint i TypeScript przeszły bez ostrzeżeń. Manifest i rzeczywisty bundle Androida na porcie 8081 potwierdziły pakiet, schemat i backend Dev oraz trzy nowe RPC, bez adresu backendu Preview. Zmiana nie dodaje bibliotek ani konfiguracji natywnej. Wystarczy odświeżyć aplikację Dev. Testy instalacji i wyglądu na fizycznym telefonie pozostają osobną kontrolą.
