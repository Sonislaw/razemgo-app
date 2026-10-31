# Wyszukiwanie bez etykiet i rankingu — Dev

## Zachowanie

Dev nie prezentuje etykiet dopasowania, procentów ani uzasadnień. Karty Start,
Odkrywaj, powitania i ogłoszeń ekipy pokazują zwykłe dane ogłoszenia. Profile
pokazują zainteresowania i wiek dzieci bez ukrywania ich pod rekomendacją.

- Wyjazdy są uporządkowane według publikacji od najnowszych; remisy rozstrzyga ID.
- Ekipy są uporządkowane alfabetycznie według znormalizowanej nazwy, potem ID.
- Usunięto sortowanie „Polecane” i niepotrzebne kontrolki zmiany kolejności.
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

## Powiadomienia i środowiska

Na wyraźne życzenie użytkownika automatyczne propozycje w dzwonku i push
pozostają aktywne. Zachowano kolejkę, harmonogram, monitoring i licznik propozycji
w szczegółach własnego wyjazdu. Zaproszenia, wiadomości, ulubione i reakcje
pozostają dostępne.

Zmiany dotyczą wyłącznie Dev. Preview zachowuje swoją aplikację, bazę i dane.
Migracja nie zmienia kont ani treści ogłoszeń i nie wymaga nowego APK Dev.

## Weryfikacja

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
