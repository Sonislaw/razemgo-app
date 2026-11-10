# Pogoda na wyjazd — Dev

Sekcja występuje w szczegółach własnych i cudzych wyjazdów, przed mapą.
Pokazuje dostępne dni z Google Weather API: temperaturę maksymalną i minimalną
w °C, największe prawdopodobieństwo opadów w ciągu dnia/nocy, łączną ilość
opadów, wiatr i porywy w km/h. Brakujące pomiary oznaczamy kreską.
Dni można przewijać poziomo. Podpis wskazuje Google Maps i czas aktualizacji
w strefie miejsca docelowego.

Google udostępnia prognozę dzienną na maksymalnie 10 dni, licząc od dziś.
Dla odległego terminu pokazujemy „Prognoza będzie dostępna bliżej wyjazdu”.
Jeśli API obejmuje część wyjazdu, pokazujemy tę część z wyjaśnieniem.
Uwzględniamy dzień powrotu. Dla trwającego wyjazdu pokazujemy pozostałe dni,
bez pozorowania dostępu do historii. Brak terminu, brak punktu oraz zakończony
wyjazd mają osobne komunikaty. Przy samym kraju lub regionie potrzebna jest
konkretna miejscowość; nie przedstawiamy pogody w centrum dużego obszaru
jako prognozy dla całego obszaru. Pierwsza wersja nie dodaje danych klimatycznych.

Ostrzeżenia pochodzą z `publicAlerts:lookup`. Pokazujemy aktualnie opublikowane
komunikaty, których okres obowiązywania pokrywa się z wyjazdem, ze źródłem
i bezpiecznym odnośnikiem HTTPS. Nie przenosimy dzisiejszego alertu na przyszły
termin. Błąd odczytu ostrzeżeń nie ukrywa prognozy i nie udaje braku zagrożeń.

## Konfiguracja Google i Supabase

1. W projekcie Google Cloud `razemgo-cfbe2` włącz **Weather API**
   (`weather.googleapis.com`); wymagane są aktywne rozliczenia.
2. Utwórz osobny klucz serwerowy i ogranicz jego dozwolone API do **Weather API**.
   Ograniczenie do aplikacji Android/HTTP referrer nie pasuje do funkcji serwerowej.
   Klucza Android Maps nie zmieniaj.
3. W [sekretach Supabase Dev](https://supabase.com/dashboard/project/kswuakzcnoqgovnwejhb/functions/secrets)
   dodaj `GOOGLE_WEATHER_API_KEY`. Nie dodawaj tego klucza do zmiennych
   `EXPO_PUBLIC_*`, aplikacji, repozytorium ani wiadomości.
4. Funkcja `trip-weather` odczytuje sekret po stronie serwera. Do odświeżania
   wygasłej geometrii Google używa istniejącego `GOOGLE_PLACES_API_KEY`.
5. Przeglądarka domyślnie obsługuje lokalne źródła na porcie 8081.
   Dodatkowe źródła można jawnie wskazać w `WEATHER_ALLOWED_WEB_ORIGINS`.

## Backend

Migracja `202611100001_trip_weather.sql` dodaje prywatne limity i cache oraz:

- `get_my_trip_weather_context(target_trip_id)` — sesja i aktywny profil,
  dostęp do własnego wyjazdu lub widocznego ogłoszenia; daty i punkt z bazy;
- `get_trip_weather_cache` i `put_trip_weather_cache` — wyłącznie serwer;
- zadanie `razemgo-expire-weather` — usuwanie wygasłych odpowiedzi co 10 minut.

Funkcja Edge przyjmuje tylko `{tripId}`. Nie pozwala podawać dowolnych
współrzędnych, URL ani dat. Uwzględnia blokady, moderację i widoczność ogłoszeń.
Limit to 30 odczytów na minutę i 300 dziennie na konto, także przy trafieniu
w cache. Brak dostępu jest sprawdzany przed odczytem wspólnej pamięci.

Prognoza i ostrzeżenia dla tego samego punktu są współdzielone przez 10 minut.
Usunięcie fizycznego wpisu następuje podczas najbliższego cyklu czyszczenia,
zwykle do 20 minut od pobrania; wygasły wpis nigdy nie jest zwracany.
Cache nie przechowuje identyfikatorów wyjazdów ani danych użytkowników.
HTTP ma `Cache-Control: no-store`. Klucz Google i treści błędów dostawcy
nie trafiają do klienta. Ekran odświeża pogodę po powrocie na ekran, wznowieniu
aplikacji i co 10 minut podczas korzystania. Wylogowanie unieważnia żądania.
Odległe terminy i duże obszary nie powodują zapytań do Google.

## Weryfikacja

`npm run test:weather` sprawdza daty, strefy czasowe, częściowy zakres,
sumowanie opadów, brakujące pomiary, ostrzeżenia, autoryzację i prywatność,
geometrię miejsc Google/ręcznych, limity i wygasanie cache na migracjach PostgreSQL.
Test Edge sprawdza rzeczywistą obsługę HTTP z atrapami Google/Supabase,
nieprawidłowe żądania, buforowanie, błąd dostawcy i ukrywanie klucza.
`scripts/browser/trip-weather.spec.mjs` sprawdza retry, przewijanie, alerty,
odległy termin, region i własny wyjazd przy 320 i 390 px.

Wdrożenie dotyczy tylko Dev. Nie wymaga nowych bibliotek natywnych ani APK.
Rzeczywista prognoza wymaga skonfigurowanego klucza i włączonego API.

10.11.2026: migracja i funkcja `trip-weather` wdrożone na Dev; sekret
`GOOGLE_WEATHER_API_KEY` skonfigurowany. Test z rzeczywistym Google Weather API
potwierdził trzy dni prognozy dla punktu w Gdańsku, strefę Europe/Warsaw,
działający odczyt ostrzeżeń oraz ponowne użycie cache. Tymczasowe konto i jego
nieopublikowany szkic usunięto. Przeszły cztery testy Node/PostgreSQL, test
HTTP Edge, dwa scenariusze przeglądarkowe, lint, TypeScript i kontrola źródeł.
Typy trzech nowych RPC wyprowadzono z katalogu PostgreSQL na migracjach.

Źródła: [prognoza dzienna](https://developers.google.com/maps/documentation/weather/daily-forecast),
[ostrzeżenia](https://developers.google.com/maps/documentation/weather/weather-alerts),
[konfiguracja klucza](https://developers.google.com/maps/documentation/weather/get-api-key),
[atrybucja](https://developers.google.com/maps/documentation/weather/policies),
[przechowywanie danych](https://cloud.google.com/maps-platform/terms/maps-service-terms#21-weather-api).
