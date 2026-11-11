# Geoapify i Google Places — lokalizacja „Mam plan”, Dev

Krok 2 kreatora i edycji „Mam plan” ma dwa wymagane pola:

1. „Miejscowość / wieś”: Geoapify Address Autocomplete z `type=city`, wyłącznie
   miejscowości i wsie. Wyniki innych typów są odrzucane także na serwerze.
   Ręczny wpis również dotyczy miejscowości lub wsi; region i kraj są jej
   danymi pomocniczymi, bez opcji wyboru ich jako rodzaju obszaru.
2. „Konkretne miejsce”: pojawia się po wybraniu miejscowości. Google Places
   Autocomplete otrzymuje `locationRestriction` z granic Geoapify (lub okrąg
   20 km przy braku bbox). Serwer pobiera miejscowość z prywatnego katalogu,
   nie przyjmuje granic przesłanych przez klienta. Podpowiedzi dotyczą kempingów
   i innych konkretnych miejsc. Szczegóły są pobierane dopiero po wyborze,
   z tym samym tokenem sesji. Można też podać pełny adres lub pin ręcznie.

Oba pola są wymagane do publikacji. Niekompletny szkic może zachować sam obszar.
Zmiana obszaru usuwa poprzednie konkretne miejsce; potwierdzenie tego samego
obszaru zachowuje wybór. Zmiana na „Szukam pomysłu” odrzuca konkretne miejsce.
Ręczny obszar bez znanych granic otwiera formularz ręcznego miejsca zamiast
wysyłać wyszukiwanie w dowolnej lokalizacji.

## Konfiguracja

Pierwszy wybór i ręczny adres wykorzystują `GEOAPIFY_API_KEY` w Supabase Dev.
Drugie pole korzysta z istniejącego `GOOGLE_PLACES_API_KEY` poprzez funkcję
`places`. Klucze pozostają wyłącznie po stronie serwera.

Przy osobnym kluczu: MyProjects → projekt → API Keys → generator Places API
→ Try. Nowy klucz zapisać wyłącznie jako `GEOAPIFY_PLACES_API_KEY` w Supabase
Dev. Bez tego sekretu funkcja korzysta z istniejącego `GEOAPIFY_API_KEY`.
Nie umieszczać klucza w `EXPO_PUBLIC_*`, APK ani repozytorium.

## Zapis i koszty

- `places` uwierzytelnia konto i weryfikuje wybraną miejscowość przed wysłaniem
  zapytania do Google. Odrzuca nieznane obszary, regiony i kraje.
- Minimum 3 znaki, debounce 500 ms, anulowanie poprzedniego zapytania.
- Google Autocomplete: cache 20 fraz w ramach sesji, klucz uwzględnia miejscowość.
  Geoapify: 24 godziny na serwerze, współdzielone pomiędzy kontami.
  Autocomplete rozdziela cache miejscowości od szerszego wyszukiwania
  obszarów w „Szukam pomysłu”, które nadal dopuszcza regiony i kraje.
- Google Place Details jest pobierane tylko dla wybranej podpowiedzi.
- `trip_plans.search_area_data` przechowuje pierwszy wybór, `place_data`
  konkretne miejsce. Dane Geoapify są trwałym zapisem nazwy, regionu, kraju,
  punktu i granic; dane Google zachowują dotychczasowe zasady ID i cache.
- Karty wyjazdów pokazują miejscowość z bazy, bez Google Place Details.
  Nazwa konkretnego miejsca i adres pojawiają się w szczegółach. Filtry
  korzystają z zapisanej miejscowości również po wygaśnięciu geometrii Google.
- Ręczny adres jest geokodowany przez Geoapify raz, a punkt zapisany w bazie.
  `coordinateSource` odróżnia położenie z adresu od pinu użytkownika. Zmiana
  adresu odświeża punkt pochodzący z adresu; ponowne otwarcie go nie odświeża.
- Google Maps nadal rysuje mapy. Weather API działa osobno, gdy termin jest
  w zasięgu prognozy. Filtry „Mam plan” używają wyłącznie Geoapify `type=city`.
- Stare miejsca Geoapify pozostają czytelne. Dawny endpoint wyszukiwania
  jest zachowany dla wcześniejszych klientów; aktualny formularz go nie wywołuje.
- Starsze ogłoszenia i ich dane Google pozostają czytelne. Nowy formularz
  wymaga miejscowości przy edycji, jeśli poprzedni zapis jej nie zawierał. Starsze
  API nadal mogą wykonywać operacje na starszych ogłoszeniach.

## Weryfikacja

`scripts/geoapify-places.test.mjs`: parser, walidacja, kanoniczność, uprawnienia,
zapis obu pól, szkice, duplikowanie, geometria pogody i wygaśnięcie cache.
`supabase/functions/geoapify-places/handler.test.ts`: HTTP, błędy dostawcy,
prywatność klucza, ograniczenie obszaru i współdzielenie 20 równoległych żądań.
`supabase/functions/places/handler.test.ts`: Google Autocomplete w granicach
miejscowości, odrzucanie nieznanych obszarów i wspólny token Place Details.
`scripts/browser/planned-geoapify.spec.mjs`: 320/390 px, wymagane pola, edycja,
zmiana miejscowości, retry, ręczny adres i pin; karty bez Google Places,
pełna nazwa kempingu w szczegółach.
