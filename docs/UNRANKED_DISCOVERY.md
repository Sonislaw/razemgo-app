# Wyszukiwanie bez etykiet i rankingu — Dev

## Zachowanie

Dev nie prezentuje etykiet dopasowania, procentów ani uzasadnień. Karty Start,
Odkrywaj, powitania i ogłoszeń ekipy pokazują zwykłe dane ogłoszenia. Profile
pokazują zainteresowania i wiek dzieci bez ukrywania ich pod rekomendacją.

- Wyjazdy domyślnie są uporządkowane według publikacji od najnowszych; remisy rozstrzyga ID.
  Od 09.11.2026 ikona obok „Zapisane” pozwala też wybrać termin rozpoczęcia
  rosnąco lub malejąco. Przy tym samym terminie decydują najnowsza publikacja i ID.
- Ekipy są uporządkowane alfabetycznie według znormalizowanej nazwy, potem ID.
- Sortowanie „Polecane” pozostaje usunięte.
- Filtry pozostają jawne i niezależne od profilu oglądającego. Rozmiar strony
  pozostaje równy 5, a powrót ze szczegółów zachowuje pozycję listy.
- „Znajdź towarzystwo” ustawia kryteria terminu i regionu konkretnego wyjazdu.
  Nie uruchamia rankingu ani porównania zainteresowań czy profili.
- Start pobiera najnowsze ogłoszenie. Szczegóły otwierają wskazane ID, bez
  kontekstu porównania ani przejmowania filtrów Odkrywaj.

## Backend

Nowa migracja `202610310005_unranked_discovery.sql` dodaje sześć odczytów:

- `search_public_trips_v3(filters, after_cursor, page_size)`
- `get_discovery_trip_v3(target_trip_id)`
- `refresh_public_trip_results_v3(trip_ids, filters)`
- `list_public_groups_v3(filters, after_cursor, page_size)`
- `get_public_group_v3(target_group_id, after_cursor, page_size)`
- `refresh_public_group_results_v3(group_ids, filters)`

V3 nie wywołuje funkcji zgodności, nie odczytuje preferencji porównania i nie
zwraca `score`, `rank`, `compatibility` ani `recommendation`. Kursory mają wersję
3 i są związane z kontem, kryteriami lub przeglądaną ekipą. Cache ma osobny klucz.
Zachowano autoryzację, widoczność, blokady, moderację i walidację kryteriów.

V1/V2 i dawne migracje pozostają dla zainstalowanych klientów. Ich modele
referencyjne znajdują się wyłącznie w `scripts/support/legacy-matching` i nie
są importowane przez aplikację. Dawne pola preferencji pozostają neutralnymi
polami starszego kontraktu zapisu, bez wpływu na bieżące listy.

Migracja `202611090001_trip_date_sorting.sql`, wdrożona na Dev, rozszerza
`search_public_trips_v3` o opcjonalne `filters.sort_order`: `newest` (domyślne),
`date_asc`, `date_desc`. Sortowanie obejmuje cały pasujący zbiór przed limitem
strony. Kursor dat zawiera `start_date`; jego klucz obejmuje również sortowanie.
Rewizja uwzględnia zmianę terminu, aby odświeżenie zachowało właściwą kolejność.
Podpis funkcji i domyślny kontrakt starych klientów pozostają zgodne.

Wybór sortowania jest oddzielony od kryteriów: nie zmienia filtrów ani nazwy
wczytanego zestawu i pozostaje zachowany po powrocie ze szczegółów. Zmiana
kolejności zaczyna listę od pierwszych pięciu wyników. Start nadal niezależnie
pobiera najnowsze ogłoszenie; mapa i licznik wyników nie przejmują sortowania.

## Powiadomienia i środowiska

Na wyraźne życzenie użytkownika automatyczne propozycje w dzwonku i push
pozostają aktywne. Zachowano kolejkę, harmonogram, monitoring i licznik propozycji
w szczegółach własnego wyjazdu. Zaproszenia, wiadomości, ulubione i reakcje
pozostają dostępne.

Zmiany dotyczą wyłącznie Dev. Preview zachowuje swoją aplikację, bazę i dane.
Migracja nie zmienia kont ani treści ogłoszeń i nie wymaga nowego APK Dev.

## Weryfikacja

09.11.2026: przeszło 14 testów Node/PGlite, w tym kolejność terminów przed
limitem strony, remisy, błędne sortowanie i kursory oraz zmiana terminu.
Przeszły scenariusze Playwright sortowania i pustej listy przy 320 i 390 px
(cztery scenariusze), lint, TypeScript i kontrola granic modułów/sekretów.
Testy potwierdzają zachowanie filtrów, reset stron, kompletne doładowanie
13 wyników i niezależny wybór najnowszego ogłoszenia na Starcie. Plan migracji
potwierdził aktualną bazę Dev, a kontrola SQL w transakcji tylko do odczytu
potwierdziła obecność wdrożonej migracji i nowego kontraktu funkcji.

Testy PostgreSQL zastępują dawne funkcje dopasowania funkcjami zgłaszającymi
błąd i potwierdzają działanie wszystkich sześciu odczytów V3. Sprawdzają też
porcje 5+3 oraz 5+5+2, filtry, odświeżanie, izolację kursorów, blokady,
widoczność i brak anonimowego dostępu. Testy przeglądarkowe obejmują brak
etykiet i sortowania polecanego oraz zachowanie list, profili i kontaktu.

31.10.2026: przeszło 537 testów Node/PGlite, lint, TypeScript, kontrola granic
modułów/sekretów oraz eksporty Android i web. Przeszły 24 scenariusze list i
wyjazdów oraz 45 pozostałych regresji. Jeden scenariusz ponawiania historii czatu
w szerokim przebiegu przegrał wyścig z automatycznym odświeżeniem: wiadomości
były już widoczne, a przycisk ponowienia zniknął przed kliknięciem. Bez zmiany
kodu scenariusz przeszedł oddzielnie. Nie jest to potwierdzenie testu telefonu.

Migrację wdrożono wyłącznie do `kswuakzcnoqgovnwejhb` (40 migracji). Kontrola
odczytów na istniejącej sesji Dev potwierdziła sześć działających odczytów V3,
brak pól personalizacji, porcje do pięciu oraz brak anonimowych uprawnień.
Harmonogram `razemgo-proposals` pozostaje aktywny. Kontrola nie tworzyła kont
ani ogłoszeń. Preview nie było odczytywane ani modyfikowane. Typy sześciu RPC
wyprowadzono z katalogu lokalnego PostgreSQL/PGlite; pełna kontrola kanonicznym
generatorem CLI nadal wymaga lokalnego Supabase/Dockera.
