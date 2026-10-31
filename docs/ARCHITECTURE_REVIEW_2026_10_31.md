# Przegląd architektury RazemGo — 31.10.2026

## Wniosek

Obecny stos Expo / React Native / Expo Router / Supabase odpowiada potrzebom aplikacji. Największy sens mają teraz celowane prace nad poprawnością paginacji, zakresem synchronizacji, podziałem stanu i aktualnością kontroli jakości.

Wiele prac z poprzedniego przeglądu jest już wykonanych: wspólny transport, anulowanie i granice kont, koordynator synchronizacji, paginacja, selektory magazynów, generowane typy oraz odroczona inicjalizacja miejscowości. Nie traktuję ich jako brakujących funkcji.

Najważniejszym potwierdzonym problemem jest zachowywanie starego kursora po połączeniu nowej pierwszej strony z poprzednio wczytanymi rekordami. Może to pominąć nowy wynik pomiędzy stronami aż do rozpoczęcia listy od nowa.

## Zakres i sposób sprawdzenia

- Kod aplikacji: start i logowanie, profil, wyjazdy, Odkrywaj, ekipy, rozmowy, ulubione, reakcje, obecność, powiadomienia, moderacja, mapy i wspólne komponenty.
- Wszystkie 40 migracji; szczególnie ich końcowe definicje po zmianach z 31.10.
- Rzeczywisty Supabase **Dev `kswuakzcnoqgovnwejhb`**: odczyt katalogu, uprawnień, zbiorczych statystyk i harmonogramów. Zapytania SQL pracowały w transakcjach tylko do odczytu. Bez odczytywania treści rozmów, nazw kont, sekretów i poleceń Cron.
- Testy Node/PGlite, Edge Functions i interfejsu; lokalna próba aktualnych odczytów V3 na danych syntetycznych.
- Preview nie było odczytywane ani zmieniane. Nie wdrażano migracji, funkcji ani APK. Kod produktu pozostaje bez zmian.

Nie wykonywałem nowego testu 200 równoległych sesji HTTP, pomiarów Android/Hermes, fizycznego logowania Google ani odtwarzania kopii zapasowej. Przegląd nie potwierdza przepustowości hostowanego planu dla 200 sesji.

## Stan architektury

Przepływ odpowiedzialności jest zasadniczo poprawny:

`ekran → kontroler / hook / magazyn → repozytorium / mapper → backendRequest → Supabase RPC / RLS`.

| Obszar | Stan |
| --- | --- |
| Żądania | Wspólny limit czasu, anulowanie, kontrola konta i jawne ponawianie odczytów. |
| Konta | Magazyny odtwarzane przy zmianie użytkownika; dane poprzedniego konta nie są wspólnym globalnym cache. |
| Listy | FlatList, okno renderowania, porcje po 5 i zachowywanie pozycji. |
| Rozmowy | Aktywna historia odświeżana osobno; liczba zachowanych pełnych historii ograniczona. |
| Baza | RLS, jawne role RPC, sprawdzanie blokad i moderacji po stronie serwera. |
| Zapis | Istnieją klucze idempotencji, ograniczenia i blokady chroniące wybrane równoległe operacje. |
| Monitoring | Filtrowanie prywatnych danych, limity raportów, osobny monitor push i propozycji. |
| CI | Lint, typy, testy logiki/SQL, Edge, Playwright, eksporty i lokalny Supabase. |

## Ustalenia i zalecenia

### 1. Wysoki priorytet: cache i kursor mogą pomijać wyniki

Źródła:

- [paged-resource.ts](../src/lib/paged-resource.ts), scalanie w `load()` i zachowanie `previous.cursor`.
- [groups-discovery.tsx](../src/features/groups/groups-discovery.tsx), ciche odświeżanie i zachowanie kursora poprzedniej listy.

Przy powrocie do listy pobierana jest nowa pierwsza strona, a pozostałe wcześniej wczytane ID są sprawdzane i zachowywane. To skutecznie usuwa niedostępne elementy, lecz nie odnajduje nowego rekordu, który znalazł się pomiędzy pierwszą stroną a starym końcem listy. Dalsze pobieranie zaczyna się za starym kursorem.

Kontrolowana reprodukcja wspólnego mechanizmu:

1. Wczytanie 10 z 15 uporządkowanych elementów.
2. Dodanie szesnastego elementu pomiędzy szóstym i siódmym.
3. Odświeżenie pierwszej strony i znanych ID.
4. Dokończenie paginacji.
5. Wynik: **15 wczytanych, 16 dostępnych, `hasMore=false`**; nowego elementu brakuje.

Alfabetyczna lista ekip ma ten sam sposób scalania. Zmiana nazwy ekipy może także przemieścić rekord względem starego kursora. Wspólny mechanizm obsługuje również listy z innymi kluczami sortowania, dlatego poprawka powinna obejmować jego kontrakt.

Zalecenie: jawnie rozróżnić odświeżanie znanych rekordów od sprawdzania kompletności zakresu wyników. Przy zmianie składu lub kolejności zbioru ponownie uzgodnić zakres do kotwicy powrotu albo użyć wersjonowanego obrazu wyników. Zachować pozycję według ID i przesunięcia karty. Samo sprawdzenie starych ID i zachowanie starego kursora nie zapewnia kompletności.

Odbiór: nowe rekordy pomiędzy stronami, zmiana nazwy/dat sortowania, usunięcie elementu przy kursorze, ukrycie profilu, blokada i powrót ze szczegółów; bez zmiany porcji po 5 i bez skoków listy.

### 2. Średni priorytet: synchronizacja ma wspólny rdzeń, ale kilka osobnych harmonogramów

Źródła:

- [account-sync-context.tsx](../src/features/auth/account-sync-context.tsx): kontrola konta co 20 s.
- [favorites-context.tsx](../src/features/favorites/favorites-context.tsx): pełne ulubione co 30 s.
- [reactions-context.tsx](../src/features/reactions/reactions-context.tsx): reakcje obserwowanych kart co 20 s.
- [account-access-context.tsx](../src/features/moderation/account-access-context.tsx): dostęp i moderacja co 30 s.
- [presence-context.tsx](../src/features/presence/presence-context.tsx): odczyt obecności co 15 s, heartbeat co 30 s.
- [own-trips-context.tsx](../src/features/trips/own-trips-context.tsx): osobne odświeżenie po powrocie aplikacji.

Mechanizmy ograniczają odczyty w tle; tego zabezpieczenia nie trzeba dodawać od nowa. Nadal jednak każdy osobno reaguje na powrót aplikacji. Obserwacja reakcji i obecności jest związana z zamontowaniem komponentu, a poprzednie ekrany mogą pozostawać zamontowane w nawigacji.

Wspólna rewizja konta uruchamia zarówno zadanie skrzynki, jak i powiadomień. Zmiana jednej domeny może więc pobierać dane drugiej; zadanie skrzynki dodatkowo odświeża aktywną historię.

Zalecenie: wspólne planowanie odświeżeń z osobnymi sygnałami zmian domen; obserwacje zależne od widocznego ekranu/karty; zachować heartbeat i kontrolne odczyty, które mają odrębne wymagania. Ulubione synchronizować według rewizji zamiast bezwarunkowego odczytu całego zestawu.

Odbiór: porównać liczbę żądań i bajty przez 5 minut bez zmian, powrót aplikacji, zmianę jednej reakcji i jedną wiadomość. Kontrola moderacji oraz ponowienia po utraconym zdarzeniu muszą pozostać skuteczne.

### 3. Średni priorytet: ograniczyć liczbę reprezentacji tych samych danych

Źródła:

- [own-trips-context.tsx](../src/features/trips/own-trips-context.tsx): globalna tablica cache i jej scalanie.
- [use-own-trip.ts](../src/features/trips/use-own-trip.ts): osobny magazyn stron i odczyt szczegółów.
- [messaging-context.tsx](../src/features/messaging/messaging-context.tsx): 931 linii; skrzynka, konteksty, historia, reakcje, zapisy i synchronizacja.
- [groups-discovery.tsx](../src/features/groups/groups-discovery.tsx): własny mechanizm stron obok `createPagedResource`.

Własny wyjazd istnieje równocześnie w globalnej tablicy i w wyniku listy. Cache scala kolejne elementy bez limitu; usuwanie z niego zależy od konkretnych ścieżek, a nie wspólnej polityki unieważniania. Nie jest to dowód ujawniania danych innego konta — granice kont działają — lecz utrudnia aktualność danych i kontrolę pamięci.

Niektóre ekrany, np. katalog ekip, używają pełnego `useMessaging()`, chociaż potrzebują głównie listy blokad. Selektory są już dostępne i można zawęzić te subskrypcje.

Zalecenie:

- Jedna mapa encji wyjazdów, a w listach uporządkowane ID, kursor i stan ładowania.
- Ograniczony cache z jawnym odświeżaniem, usuwaniem i zwalnianiem nieaktywnych rekordów.
- Wspólna mechanika paginacji dla ekip i wyjazdów po poprawieniu punktu 1; osobna logika filtrów domeny.
- Podział obsługi rozmów na kontroler skrzynki, historie i zapisy; zachować istniejące bezpieczeństwo i selektory.

### 4. Średni priorytet: aktualne RPC i testy wydajności wymagają wspólnego kontraktu

Źródła:

- [202610310005_unranked_discovery.sql](../supabase/migrations/202610310005_unranked_discovery.sql).
- [202610250011_crew_numbers.sql](../supabase/migrations/202610250011_crew_numbers.sql): końcowe `count_public_groups`.
- [load-protocol.mjs](../scripts/load-protocol.mjs), [profile-discovery.mjs](../scripts/profile-discovery.mjs), [benchmark-sql.mjs](../scripts/benchmark-sql.mjs).

Obecna aplikacja używa V3, ale scenariusze skali nadal wywołują głównie `search_public_trips` i `list_ranked_public_groups`, również w trybie zgodności. Dobre wyniki wcześniejszego rankingu nie są pomiarem obecnej wersji aplikacji.

Lista ekip V3 i licznik filtrów mają osobne implementacje walidacji i kwalifikowania rekordów. Przykład różnicy kontraktu: V3 jawnie wymaga tekstowego `name`; starszy licznik sprawdza jego długość po konwersji tekstowej. Jest to ryzyko rozjazdu kontraktów, a nie potwierdzony dziś błąd licznika dla poprawnego formularza.

W nowych listach każda kolejna strona ponownie wyznacza pełny zbiór `eligible` i dokładną liczbę wyników. Karty wyjazdu są budowane przez wywołanie `list_public_trips(id)` dla każdego elementu strony. Zapewnia to ponowną kontrolę dostępu, ale powiela część pracy. Należy zachować uprawnienia podczas ewentualnej optymalizacji.

Zalecenie:

- Używać wspólnego, walidowanego predykatu dla listy i licznika ekip.
- Dodać aktualne V3 do pomiarów HTTP i profili SQL; stare kontrakty badać jako zgodność starszych wydań.
- Zmierzyć liczenie na dalszych stronach; rozważyć ponowne użycie liczby związanej z wersją wyników i zbiorcze budowanie kart.
- Oceniać plan zapytania przed dodaniem indeksu. Materializacja `eligible` i pełne liczenie ograniczają korzyść z samego indeksu sortowania.

### 5. Średni priorytet: uzupełnić ochronę jakości i zakres monitoringu

- Expo Doctor: **19/20**, wyłącznie kontrola zgodności wersji pakietów zgłasza błąd. Do zgodnej aktualizacji w SDK 58: `@expo/ui`, `expo`, `expo-dev-client`, `expo-router`, `react-native`, `react-native-screens`. Moduły natywne wymagają nowego APK Dev po aktualizacji.
- `npm audit`: **28 wskazań: 2 high, 25 moderate, 1 low**. To 28 pozycji drzewa zależności, nie 28 niezależnych podatności; źródłowe zgłoszenia obejmują Zod, Glob, Minimatch i Deepmerge. Sam wynik nie potwierdza osiągalności problemu w zainstalowanej aplikacji. Potrzebna ocena ścieżek narzędzi i zgodnych aktualizacji.
- [monitoring.ts](../src/lib/monitoring.ts) celowo ustawia `enableNative=false` oraz `enableNativeCrashHandling=false`. Monitoring JavaScript i backendu działa, ale nie obejmuje pełnych awarii kodu natywnego Androida. Bezpieczne rozszerzenie wymaga zachowania polityki danych i sprawdzenia nowego buildu.
- Kontrole granic modułów wykrywają cykle i zależności infrastruktury od UI, lecz nie wymuszają zakazu bezpośrednich wywołań SDK w widokach. [trip-report-action.tsx](../src/features/moderation/trip-report-action.tsx) łączy menu, formularz i RPC zgłoszenia mimo istniejącego repozytorium moderacji.
- Pełny przebieg Playwright zakończył się wynikiem 68/69. Test ręcznego ponowienia historii rozmowy czekał na przycisk, który został usunięty z DOM; końcowy podgląd zawierał już oczekiwaną wiadomość. Osobny przebieg tego samego testu również nie przeszedł — wcześniej, przy ponowieniu skrzynki, która zdążyła już wyświetlić rozmowę. To wskazuje na wyścig testu z automatycznym odzyskaniem danych. Scenariusz powinien deterministycznie rozdzielać ręczne i automatyczne ponawianie; zwiększenie timeoutu nie rozwiązuje tej zależności czasowej.

Zalecenie: przenieść transport zgłoszeń do repozytorium, kontroler operacji oddzielić od widoku, a przyjęte granice egzekwować linterem. Aktualizować zależności przez Expo, z kontrolą lockfile, bez wymuszania niezgodnego SDK.

### 6. Niższy priorytet: domknąć porządki po usunięciu dopasowania

`group_preferences`, dawne pola `matching_*`, wersje RPC V1/V2 oraz typy pomocnicze nadal istnieją dla zgodności starszych kontraktów. To świadoma warstwa zgodności, nie powód do natychmiastowego usuwania tabel.

W aplikacyjnych modelach wyjazdu nadal odtwarzany jest obiekt `matching` z pól starszego kontraktu. Można ograniczyć go do adaptera zgodności i usunąć z bieżącego modelu interfejsu, gdy analiza wszystkich odbiorców potwierdzi brak zależności. Wcześniejszych migracji nie należy zmieniać.

Zalecenie: spisać macierz wersja aplikacji → RPC i plan wycofywania kontraktów. Dopiero po zakończeniu obsługi starych wydań dodawać migracje porządkujące. Uaktualnić nazwy scenariuszy i dokumentację, które nadal opisują ranking jako bieżący produkt.

### 7. Niższy priorytet: pierwsze użycie wyszukiwarki miejscowości i pamięć

Słownik jest już odroczony, a wyszukiwanie korzysta z prefiksów. Nie trzeba ponownie wdrażać lazy loadingu.

Jedna kontrolna próba na komputerze w Node: pierwsze `searchTripLocations('Chla')` około **109 ms**, powtórzenie około **0,8 ms**. To wskazuje koszt pierwszego przygotowania danych, ale nie jest wynikiem telefonu ani Hermes.

Zalecenie: zmierzyć pierwsze wejście w formularz na Androidzie release połączonym z Dev. Jeżeli występuje utrata klatek, przygotować indeks z wyprzedzeniem w bezpiecznym momencie lub podzielić pracę; zachować lokalne działanie wyszukiwania.

## Baza Dev — fakty z odczytu

| Kontrola | Wynik |
| --- | --- |
| Migracje | 40, zgodne z liczbą plików w repozytorium. |
| Kolumny | Typy i wymagalność 208 kolumn zgodne z katalogiem odtworzonym z migracji w PGlite. |
| Tabele aplikacji | 33: publiczne i wewnętrzne; wszystkie mają RLS. |
| Uprawnienia anonimowe do tabel | Brak SELECT/INSERT/UPDATE/DELETE. |
| Funkcje w `public` | 76; anonimowy użytkownik nie ma EXECUTE do żadnej. |
| `SECURITY DEFINER` w `public` | 67; każda ma ustawiony `search_path`. |
| Cały katalog funkcji aplikacji | 144, manifest lokalny obejmuje 143. Dodatkowe `push_private.wake_monitor()` tworzy istniejący skrypt konfiguracji harmonogramu. |
| Porównanie uprawnień | Po uwzględnieniu domyślnego dodatkowego EXECUTE dla `service_role` na hostowanym Supabase nie ma innych różnic manifestu. |
| Definicje funkcji | Porównanie skrótów treści po normalizacji białych znaków: różnią się jedynie `wake_dispatcher()` i `wake_monitor()`, konfigurowane osobnymi skryptami środowiska. |
| Kontrola HTTP bez logowania | Osiem sprawdzonych RPC, w tym sześć V3, administracja i diagnostyka push: HTTP 401 / `42501`. |
| Harmonogramy | Pięć aktywnych; historia nie wykazała błędów Cron w ostatnich 24 h. Nie jest to dowód doręczenia każdego push do urządzenia. |

Statystyki tabel wskazywały około 62 profili i 183 wyjazdy. Są to przybliżenia PostgreSQL, nie pełna liczba danych ani test skali. Niska liczba użyć części indeksów przy takim zbiorze nie uzasadnia ich usuwania.

Przypadki dwóch kont, zawieszenia i blokad sprawdzano w lokalnych testach SQL. Na hostowanym Dev sprawdzano katalog i odmowę dostępu anonimowego; nie wykonywano nowych prób z zalogowanymi kontami testerów. Porównanie kolumn nie zastępuje pełnej kontroli wszystkich ograniczeń i polityk ani kanonicznego generatora typów z lokalnego Supabase.

Wykryto też klucze obce bez pełnego indeksu rozpoczynającego się od danej kolumny, m.in. `notifications.proposed_trip_id`, `proposal_seen.proposed_trip_id`, `push_devices.session_id` i `contact_invitations.source_trip_id`. To kandydaci do profilu usuwania/archiwizacji i kaskad, a nie lista indeksów do automatycznego dodania. Indeksy częściowe i złożone należy oceniać z planem konkretnej operacji.

Do planu operacyjnego warto dopisać retencję technicznych danych powiadomień/propozycji i próbę odtworzenia kopii. Obecna kolejka zachowuje deduplikację, pierwotny wiek zadania i ochronę dzierżaw — te mechanizmy należy utrzymać. Wydajność generowania propozycji i dostarczania push pod obciążeniem wymaga osobnego pomiaru z atrapą dostawcy.

## Wyniki pomiarów

### Hostowany Dev: dotychczasowe statystyki PostgreSQL

| Operacja | Wywołania | Średni czas SQL |
| --- | ---: | ---: |
| Lista wyjazdów V3 | 114 | 24,04 ms |
| Lista ekip V3 | 39 | 17,07 ms |
| Licznik ekip | 68 | 5,77 ms |
| Podsumowanie konta | 966 | 8,08 ms |
| Strona skrzynki | 289 | 11,35 ms |

To statystyki historyczne `pg_stat_statements` małego Dev. Nie obejmują opóźnienia telefonu/sieci i nie są p95 ani kontrolowanym porównaniem wersji.

### Aktualne RPC V3: syntetyczny PGlite

10 tys. profili, 50 tys. wyjazdów i 500 tys. wiadomości; mediana trzech wykonań w jednej sesji:

| Operacja | Mediana |
| --- | ---: |
| Strona wyjazdów V3 | 67 ms |
| Strona ekip V3 | 62 ms |
| Licznik ekip | 132 ms |
| Podsumowanie konta | 2 ms |

W tej próbie aktualne listy są sprawne. Osobny licznik ekip jest droższy niż lista, co wspiera zalecenie wspólnego predykatu i pomiarów przed optymalizacją. Wyniki PGlite/WASM nie określają przepustowości hostowanego PostgreSQL ani 200 sesji. Fixture nie uruchamia rzeczywistej wysyłki e-maili i push ani pracujących kolejek tła.

## Weryfikacja

- Lint: poprawny.
- TypeScript: poprawny.
- Kontrola granic modułów i sekretów: poprawna.
- Node/PGlite: **537/537**.
- Edge Functions: **5 testów, 12 kroków**, poprawne.
- Expo Doctor: **19/20**, sześć wskazanych aktualizacji zgodnych z SDK 58.
- Pełna regresja Playwright: **68/69**, jeden timeout w scenariuszu ponawiania historii rozmowy (`messaging.spec.mjs:238`, kliknięcie w linii 267). Stan końcowy pokazuje wiadomość i brak przycisku ponowienia. Zachowano pierwszy log, zrzut i trace.
- Osobny przebieg tego scenariusza: **0/1**, timeout w linii 257 przy ponowieniu skrzynki. W końcowym DOM rozmowa była już załadowana. Pierwszy nieudany przebieg pozostaje nieudany; nie przedstawiam ponowienia jako poprawnej pełnej regresji. Nie zmieniano testów ani kodu produktu podczas tego przeglądu.

Nowa reprodukcja błędu cache ujawnia lukę w obecnym zestawie testów, mimo poprawnych testów dotychczasowych scenariuszy.

## Proponowana kolejność prac

1. **Poprawność list:** test brakującego rekordu, uzgodnienie zakresu/kursora, kotwica powrotu; regresja porcji po 5, blokad i kont.
2. **Aktualny punkt odniesienia:** ustabilizowanie scenariusza ręcznego/automatycznego ponawiania, pomiary HTTP dla V3 i parametrów używanych przez aplikację; zgodne aktualizacje Expo w osobnej paczce z nowym APK Dev.
3. **Synchronizacja i pamięć:** zakres widocznych obserwacji, wspólne planowanie powrotu aplikacji, domenowe rewizje, jeden cache encji; porównanie żądań/bajtów przed i po.
4. **Kontrakty i utrzymanie:** wspólny licznik/lista ekip, repozytorium zgłoszeń, podział modułu rozmów, macierz zgodności starszych RPC i kontrole lint.
5. **Odbiór na urządzeniu i operacyjny:** start, przewijanie, pamięć, klawiatura, bezpieczny zakres monitoringu natywnego, kolejki i odtwarzanie kopii.

Kryteria wspólne: bez zmiany wyglądu, funkcji, rozmiaru stron i zachowania powrotu. Wdrożenia wyłącznie Dev; Preview wymaga osobnego, jawnego etapu promocji.

## Dokumentacja źródłowa zaleceń

- [PostgreSQL 17: materializacja CTE i wpływ na optymalizację](https://www.postgresql.org/docs/17/queries-with.html#QUERIES-WITH-CTE-MATERIALIZATION).
- [Supabase: optymalizacja zapytań na podstawie planów](https://supabase.com/docs/guides/database/query-optimization).
- [Supabase: RLS i uprawnienia](https://supabase.com/docs/guides/database/postgres/row-level-security).
- [Expo: aktualizowanie SDK i zgodnych zależności](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/).
- [Sentry React Native: monitoring JavaScript i kodu natywnego](https://docs.sentry.io/platforms/react-native/).
- Zgłoszenia źródłowe z bieżącego audytu: [Zod](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), [Glob](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4), [Minimatch](https://github.com/advisories/GHSA-g3hv-75wg-m249), [Deepmerge](https://github.com/advisories/GHSA-gcqx-w48m-w2h4).
