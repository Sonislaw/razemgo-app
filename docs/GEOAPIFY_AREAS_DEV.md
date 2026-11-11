# Geoapify — obszary „Szukam pomysłu”, Dev

Pole „Obszar poszukiwań” w kreatorze i edycji „Szukam pomysłu” oraz pole
„Gdzie chcecie pojechać?” w filtrach tej zakładki Odkrywaj korzystają wyłącznie
z Geoapify Address Autocomplete. Filtry „Mam plan”, w tym na mapie, zachowują
Google Places. Mapa w szczegółach nadal używa Google Maps.

## Konfiguracja

Sekret `GEOAPIFY_API_KEY` jest skonfigurowany wyłącznie w Supabase Dev
`kswuakzcnoqgovnwejhb`. Nie dodawać go do `EXPO_PUBLIC_*`, APK ani plików
śledzonych przez Git. Funkcja Edge `search-areas` weryfikuje użytkownika
i istniejący limit wyszukiwań 60/minutę oraz 1000/dzień na konto.
Sprawdza metodę, długość i pola żądania, dozwolone źródła przeglądarkowe
(`AREAS_ALLOWED_WEB_ORIGINS`, z fallbackiem na `PLACES_ALLOWED_WEB_ORIGINS`).
Błędy dostawcy i URL zawierający klucz nie są przekazywane do klienta.

## Wyszukiwanie i koszty

- Minimum 3 znaki i 500 ms przerwy w pisaniu; anulowanie nieaktualnych żądań.
- `type=locality`, `lang=pl`, preferencja Polski bez ograniczania innych krajów.
  Rzeczywiste testy potwierdziły kraje, województwa, miasta oraz wsie.
- Serwer odrzuca budynki, ulice, obiekty, kody pocztowe i nieznane typy.
- Autocomplete dostarcza nazwę, współrzędne i dostępny bbox. Wybranie wyniku
  nie uruchamia Place Details ani dodatkowego Geoapify API.
- Lokalne 20 fraz w panelu; wspólny cache wyników w bazie przez 24 godziny.
  Klucz to SHA-256 znormalizowanej frazy, język i wersja formatu; nie ID konta.
  Blokada PostgreSQL współdzieli pojedyncze pobranie między instancjami Edge.
  Wygasanie 60 s, ochrona starego właściciela i 10 s przerwy po błędzie
  wykorzystują istniejący mechanizm `sharedApiCache`.
- Osobny globalny budżet ogranicza wywołania Geoapify do 4 na sekundę zegarową;
  brak miejsca w budżecie powoduje krótkie, ograniczone oczekiwanie.
- Błąd lub brak wyniku umożliwia ponowienie i ręczne dodanie obszaru.
  Nie powoduje awaryjnego przełączenia na Google.

## Zapis i odczyt

Migracja `202611110001_geoapify_search_areas.sql` dodaje prywatny katalog
`geoapify_private.areas`, cache zapytań i budżet dostawcy. Tylko serwer
może je zapisywać. Klient przekazuje identyfikator wybranego obszaru, a baza
zastępuje pozostałe pola kanonicznym wynikiem z katalogu. Nieznane ID są
odrzucane; klient nie może podmienić nazwy ani współrzędnych wyniku Geoapify.

`place_data` ma osobne źródło `geoapify`, zakres `area`, nazwę, rodzaj, kraj,
region, środek i dostępny bbox. Dane pozostają z ogłoszeniem również po
wygaśnięciu cache podpowiedzi. Listy, szczegóły, pomocnik opisu, kopiowanie,
kontekst rozmowy i ponowna edycja odczytują tę nazwę z bazy. `useLivePlace`
nie uruchamia Google Places dla tego źródła. Geometria działa w dopasowaniach,
filtrach po własnym wyjeździe i powiadomieniach propozycji. „Mam plan” nie
przyjmuje obszaru Geoapify jako konkretnego celu.

Mapa Google używa zapisanego środka oraz orientacyjnego koła wyznaczonego
z bbox, z minimum 3 km. To podgląd obszaru, nie dokładna granica administracyjna.
Nie uruchamia geokodowania ani Place Details dla zapisanego obszaru Geoapify.
Przy podpowiedziach, lokalizacji i mapie są odnośniki atrybucji Geoapify i OSM.
Globalna mapa Odkrywaj nadal pokazuje wyłącznie „Mam plan”.

Istniejące publikacje Google/legacy zachowują dotychczasowy odczyt. Nie ma
automatycznego zgadywania odpowiedników w Geoapify ani zbiorowej modyfikacji
ogłoszeń użytkowników. Ponowny wybór obszaru w edycji zapisuje nowe źródło.

11.11.2026, na osobne polecenie użytkownika: wszystkie 23 ogłoszenia
„Szukam pomysłu” na Dev usunięto i zastąpiono 23 nowymi na kontach
demonstracyjnych, z unikatowymi opisami i obszarami Geoapify (16 miejscowości,
4 województwa, 3 kraje). Sprawdzono pięć stron wyników Odkrywaj oraz dane do map.
31 ogłoszeń „Mam plan” zachowano. Pliki robocze tej wymiany usunięto.

## Porządki po integracji

Kreator ma jeden przełącznik `areasOnly`: kieruje od razu do panelu Geoapify.
Panel Google i jego repozytorium nie mają już trybu wyszukiwania samych obszarów,
nieużywanych parametrów ani kopii formularza ręcznego obszaru. Serwer `places`
odrzuca nieobsługiwane pola, w tym dawny parametr `areasOnly`, przed wywołaniem
Google. Filtry Odkrywaj wybierają dostawcę według aktywnego typu ogłoszenia:
Geoapify dla „Szukam pomysłu”, Google dla „Mam plan”. W obu trybach dostępne
jest wyszukiwanie krajów i regionów. Odczyt zapisanych danych Google, bieżący
cache geometrii i historia migracji nadal są potrzebne do pozostałych funkcji
oraz istniejących środowisk.
Typ `SelectedPlace` zawiera tylko trzy rzeczywiście obsługiwane źródła:
`google`, `geoapify`, `manual`; formaty starszych lokalizacji obsługuje osobny
słownik. Wynik Geoapify nie może zawierać `googlePlaceId`.

Porządki wdrożono na Dev do `places`, `search-areas` i `trip-weather`.
Przeszły 29 testów Node/PostgreSQL, 4 testy HTTP Edge oraz 27 scenariuszy UI,
lint, TypeScript i kontrola źródeł. Rzeczywisty Dev odrzucił dawne żądania
obszarów do Google kodem 400, poprawnie odczytał Geoapify i potwierdził ważność
danych wszystkich 23 ogłoszeń „Szukam pomysłu”. Tymczasowe konto kontrolne
usunięto. Porządki nie wymagały migracji ani nowego APK.

## Weryfikacja i wdrożenie

- `npm run test:areas`: parser, zapis, geometria mapy, canonicalizacja,
  uprawnienia, filtry, kopiowanie, kontekst rozmowy, dopasowania i wygaśnięcie.
- Test HTTP Edge: autoryzacja, limity, odrzucanie ulic/POI, ukrywanie klucza,
  20 równoległych żądań różnych użytkowników = 1 wywołanie dostawcy.
- Scenariusze Playwright: wybór, pełna nazwa po przeładowaniu aplikacji,
  brak wywołań Places/Geoapify podczas odczytu karty i mapy, ręczny obszar
  oraz retry bez fallbacku Google, przy 320 i 390 px.
- 11.11.2026: migracja i funkcja wdrożone tylko na Dev. Rzeczywiste API
  zwróciło Kozienice, Białowieżę, województwo mazowieckie i Polskę wraz z bbox.
  Drugie konto odczytało ten sam zestaw wyników; prywatny szkic zachował nazwę
  i punkt. Oba tymczasowe konta i szkic usunięto. Typy nowych RPC wyprowadzono
  z katalogu migracji PostgreSQL; pełny generator CLI lokalnie wymaga Dockera.

Zmiana działa przez Metro; nie wymaga nowej biblioteki natywnej ani APK.

Źródła: [Autocomplete](https://apidocs.geoapify.com/docs/geocoding/address-autocomplete/),
[przechowywanie wyników](https://www.geoapify.com/address-autocomplete/#:~:text=Affordable%20and%20Permissive),
[atrybucja](https://www.geoapify.com/terms-and-conditions/).
