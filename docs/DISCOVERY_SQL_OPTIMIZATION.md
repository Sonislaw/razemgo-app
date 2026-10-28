# Optymalizacja odczytów Odkrywaj — 28.10.2026

Wdrożono nową migrację `202610280008_discovery_ranking_cost.sql` wyłącznie na **Dev `kswuakzcnoqgovnwejhb`**. Dev ma 34 migracje. Preview, jego aplikacja i dane pozostały bez zmian. Publiczne RPC, format kart, dokładny ranking, opisy zgodności, kursory i porcje po pięć pozostają zgodne z poprzednią wersją. Nie dodano funkcji produktu.

W kontrolnych odczytach HTTP mediana rankingu wyjazdów spadła z **2253 do 415 ms**, a ekip z **443 do 81 ms**. Przy 200 sesjach błędy spadły z **65,5% do 23,75%**. **Cele p95 800/1500 ms i poniżej 1% błędów nadal nie są spełnione dla całego scenariusza.**

## Zmiany SQL

- Zwykła lista wyjazdów liczy i sortuje kompaktowe klucze, a pełne wiersze i powody zgodności pobiera dla zwracanej strony.
- Ranking najpierw oblicza wynik liczbowy; pełne karty i uzasadnienia powstają dla zwycięzców. Powody i rozstrzygnięcie remisu między własnymi planami nadal pochodzą z dotychczasowego scorera.
- Kontekst własnych planów, maski zainteresowań, wieku i zwierząt oraz stałe części wag są obliczane przed porównaniami. Maski odwzorowują zamknięte, unikalne tablice kontrolowane przez bazę, włącznie ze starszym tagiem wyjazdu `Las`.
- Ogłoszenia o równych danych wpływających na wynik współdzielą obliczenie w obrębie jednego zapytania. Klucz pomija niewykorzystywane w danym kontekście pola. Nie powstaje cache między żądaniami, kontami ani sesjami; zmiana profilu, ogłoszenia lub blokady jest uwzględniana w następnym odczycie.
- Ranking ekip stosuje analogiczne grupowanie wejść. Liczy zgodność przez istniejące `group_compatibility_values`, a rzeczywiste avatary, nazwy, skład i opis każdej ekipy pobiera osobno dla strony. Liczba dorosłych i dane prezentacji nie są zastępowane wartościami reprezentanta grupy obliczeń.
- Blokady obu stron, zawieszenia i ukryte ogłoszenia są sprawdzane przez zbiory identyfikatorów, zamiast wielokrotnych skanów tych samych tabel. Klucze użyte w `NOT IN` są `NOT NULL`; test kontroluje ten warunek. Dane ekip są dołączane do wyboru kandydatów wtedy, gdy wymaga tego filtr.
- Trzy prywatne funkcje wywoływane przez zabezpieczone RPC mogą zostać włączone przez planer w zapytanie wywołujące. Ich relacje są kwalifikowane schematem i role API nie mają prawa bezpośredniego wykonania. Wszystkie funkcje `SECURITY DEFINER` zachowują stały pusty `search_path`.

Nie ograniczamy liczby kandydatów przed rankingiem. Ogłoszenia z równymi wejściami nadal mają osobne pozycje, daty publikacji i identyfikatory rozstrzygające remisy. Typy pomocnicze znajdują się w prywatnych schematach; nie zmieniają kontraktów API ani tabel użytkowników.

## Stabilność po kolejnych wywołaniach

Kontrola planowania wykazała w PGlite **472 ms** dla planu wykorzystującego argumenty oraz **3558 ms** dla planu ogólnego tego samego rankingu. To pojedyncze pomiary diagnostyczne, nie p95. Wcześniejsze próby HTTP również pokazywały pogorszenie w późniejszych etapach mimo szybkich początkowych odczytów.

Oba RPC wyszukiwania mają teraz lokalne `plan_cache_mode=force_custom_plan`. Filtry mają różną selektywność, więc planer otrzymuje ich rzeczywiste wartości przy każdym wykonaniu. Ustawienie obowiązuje podczas wykonania funkcji i nie zmienia globalnego planowania ani konfiguracji puli. Test uruchamia odczyt z połączenia żądającego planu ogólnego i sprawdza przywrócenie jego ustawienia po wyjściu z RPC. [Dokumentacja planowania PostgreSQL](https://www.postgresql.org/docs/17/runtime-config-query.html#GUC-PLAN-CACHE-MODE).

Koszt ponownego planowania i grupowania wejść pozostaje częścią zmierzonego odczytu. Nie zwiększano `statement_timeout`, rozmiaru puli, pamięci ani progów zaliczenia.

## Wyniki porównawcze

[Przebieg końcowy CI](https://github.com/Sonislaw/razemgo-app/actions/runs/40700651531), commit `dc0aaded41ae7e0b1c1d7f3b593a8b46b4dc66a5`. Trwały zbiorczy zapis: [discovery-sql-measurements.json](discovery-sql-measurements.json). Pierwszy pomiar: [HTTP_LOAD_TESTS.md](HTTP_LOAD_TESTS.md).

Jednorazowy lokalny Supabase: PostgreSQL 17.11, PostgREST 16.5, cztery vCPU, około 15,6 GiB RAM, `shared_buffers=128MB`, `work_mem=4MB`, limit roli 8 s. Baza i generator współdzielą runner. Odtworzono 34 migracje. Hostowane Dev/Preview nie uczestniczyły w obciążeniu, nie wysyłano poczty ani push.

### SQL przed i po na tym samym runnerze

Poprzednie definicje funkcji odtwarzano wyłącznie w lokalnej transakcji profilującej i wycofywano przez `ROLLBACK`. Dzięki temu oba warianty korzystają z tych samych rekordów, statystyk i zasobów. `auto_explain` zbiera wewnętrzne plany, z wyłączonym pomiarem czasu każdego operatora. Instrumentacja wpływa na wykonanie; poniżej są pojedyncze profilowane odczyty, nie p95 API.

| Odczyt | Poprzednia definicja | Po optymalizacji |
| --- | ---: | ---: |
| Wyjazdy, domyślnie | 329 ms | **92 ms** |
| Ranking wyjazdów | 3221 ms | **437 ms** |
| Ekipy, alfabetycznie | 463 ms | **44 ms** |
| Ranking ekip | 774 ms | **89 ms** |

W typowym fixture 49 995 dostępnych wyjazdów tworzy 120 różnych kluczy obliczeń; 9999 ekip tworzy cztery. Zapis bloków tymczasowych rankingu wyjazdów spadł z 13 035 do 953 bloków po 8 KiB. Zwykłe listy w tym pomiarze przestały zapisywać dane tymczasowe na dysk. Nie sumujemy liczników buforów rodzica i dzieci planu, ponieważ obejmują nakładającą się pracę.

### Kontrola dużej różnorodności

Osobny wariant nadaje wyjazdom różne lokalizacje, a profilom różne zestawy zainteresowań i preferencji. Powstaje **49 995 różnych kluczy wyjazdów i 9999 kluczy ekip**. Triggery testowych zmian są wyłączone; nie powstają propozycje ani push. Modyfikacja dotyczy wyłącznie syntetycznej bazy runnera, już po próbie HTTP.

| Odczyt | Poprzednia definicja | Po optymalizacji |
| --- | ---: | ---: |
| Wyjazdy, domyślnie | 360 ms | **101 ms** |
| Ranking wyjazdów | 7855 ms | **1333 ms** |
| Ekipy, alfabetycznie | 468 ms | **44 ms** |
| Ranking ekip | 767 ms | **682 ms** |

Zysk z grupowania jest mniejszy przy różnych wejściach. Ten wariant potwierdza poprawę w sprawdzonych pojedynczych odczytach również bez powtarzalnych kluczy; nie jest testem równoległego ruchu na zróżnicowanym zbiorze.

### HTTP do 200 sesji

Protokół zachowuje dotychczasowe sześć kolejnych odczytów na konto, etapy 10/50/100/200, brak przerw i ponowień oraz strony po pięć. Łącznie 2160 prób obciążenia i 18 kontrolnych. Timeouty i błędy są uwzględniane w wynikach, a cele sprawdzane osobno dla każdego endpointu.

| Sesje | Błędy przed | Błędy po | Błędne próby po zmianie |
| --- | ---: | ---: | ---: |
| 10 | 16,7% | **0%** | 0/60 |
| 50 | 30,3% | **0%** | 0/300 |
| 100 | 45,5% | **6,5%** | 39/600 |
| 200 | 65,5% | **23,75%** | 285/1200 |

Po zmianie wszystkie błędy tej próby mają kod `PGRST003` — oczekiwanie na wolne połączenie. Nie wystąpiło anulowanie SQL `57014`. Przy dziesięciu sesjach p95 zwykłych stron wynosi 409 ms dla wyjazdów i 264 ms dla ekip; ranking ekip 382 ms. **Ranking wyjazdów nadal ma p95 2100 ms**, powyżej celu 1500 ms. Przy większym ruchu oczekiwanie zwiększa także czasy innych odczytów. [Znaczenie kodu PostgREST](https://docs.postgrest.org/en/stable/references/connection_pool.html).

Mediany trzech odczytów kontrolnych HTTP: wyjazdy **74 ms**, ekipy **32 ms**, ranking wyjazdów **415 ms**, ranking ekip **81 ms**. Dla porównania pierwszy runner miał odpowiednio 276, 290, 2253 i 443 ms. Oba miały cztery vCPU i te same limity, lecz różne modele CPU (EPYC 9V74 / EPYC 7763). Porównanie SQL na tym samym końcowym runnerze ogranicza tę niepewność.

Status zadania obciążeniowego `failure` prawidłowo sygnalizuje niespełnione cele. Wynik nie potwierdza obsługi 200 osób przez hostowany plan Supabase: jest to krótki, zsynchronizowany ruch HTTP na współdzielonym komputerze testowym, bez Realtime i rzeczywistych zachowań aplikacji.

## Regresja i bezpieczeństwo

Test porównawczy wykonuje poprzednią i nową implementację na tym samym zbiorze i porównuje kompletne odpowiedzi: identyfikatory, karty, wynik, kolejność powodów, licznik, `has_more` i kursor. Obejmuje przejście przez całą listę, strony 1/5/20, remisy, wiele własnych planów, brak aktywnego planu, daty i tolerancję, źródło należące do innej ekipy, preferencje obu stron, starszy tag `Las`, brak rekordu preferencji, unikalne lokalizacje i różne profile. Wykrywa również dodanie do ograniczeń bazy tagu bez aktualizacji maski.

Dotychczasowe testy nadal sprawdzają RLS, wykluczenie blokad obu stron, ukrytych i zakończonych wyjazdów, zawieszone konta, anonimowego użytkownika oraz odmowę wykonania prywatnych helperów. Manifest obejmuje **123 funkcje i 14 tabel**. Lokalne kontrole po zmianach: lint, TypeScript, kontrola źródeł, **493/493 testów Node/PGlite**.

Końcowe CI potwierdziło **493/493 testy Node/PGlite, 59/59 scenariuszy Playwright, 5 testów Edge Functions / 12 kroków, Expo Doctor 20/20**, zgodność pakietów, lint, TypeScript, kontrolę źródeł i eksporty Android/web. Osobny backend odtworzył 34 migracje, porównał wygenerowany schemat oraz przeszedł rzeczywiste kontrole Auth/PostgREST. Zadanie ma status niepowodzenia wyłącznie przez próg `--strict` testu obciążenia; nie pominięto go ani nie zmieniono celu.

Sprawdzono zgodność 15 plików kodu, migracji, manifestu i CI z badanym commitem. Wdrożenie Dev objęło wyłącznie migrację 008, bez seedów, zmian danych i publikowania aplikacji. Po wdrożeniu anonimowe próby `search_public_trips`, `list_ranked_public_groups` i `get_my_sync_state` otrzymały HTTP 401 / `42501`. Zmiany pozostają w lokalnym katalogu roboczym i na technicznej gałęzi CI; `master` nie został zmieniony.

### Kolizja odświeżania historii czatu

Pełne CI ujawniło istniejącą kolizję: odświeżanie w tle mogło wyłączyć przycisk między rozpoczęciem kliknięcia a obsłużeniem go, albo `loadHistory` ignorowało akcję podczas trwającego odczytu. Ślad Playwright pokazał kolejny odczyt najnowszej historii bez żądania starszej strony.

Odświeżanie już otwartej historii zachowuje dostępność przycisku. Równoczesne żądanie starszej strony czeka na zakończenie tego odczytu, a powtórzone kliknięcia współdzielą jedną operację. Pierwsze ładowanie i doładowanie nadal czekają na reakcje. Opuszczenie rozmowy lub usunięcie stanu konta anuluje oczekujące żądanie. Wygląd i rozmiar stron nie zostały zmienione.

Nowy test zatrzymuje odpowiedź odświeżania, klika doładowanie i potwierdza dokładnie jedno żądanie starszej strony po zwolnieniu odpowiedzi. Odtworzył problem przed poprawką, a po poprawce cały plik rozmów przeszedł **5/5**. Nie wyłączano scenariuszy ani nie zwiększano timeoutów.

## Dalszy odbiór

Pozostaje dłuższa próba z rzeczywistym rozkładem aktywności 200 sesji, równoległa kontrola zróżnicowanego zbioru oraz pomiar CPU, kolejki i pamięci z generatorem oddzielonym od bazy. Wyniki mają wskazać dalszą optymalizację lub wymagane zasoby. Nie podnosimy limitów i progów, aby zaliczyć obecny test. Test telefonu i pomiary wydania Androida pozostają osobnym odbiorem.

Następnie dodano osobny stopniowy scenariusz odczytów i diagnostykę zasobów dla obu zbiorów, z generatorem w osobnym procesie na tym samym runnerze. Protokół i wyniki: [PACED_READ_LOAD.md](PACED_READ_LOAD.md). Oddzielenie fizycznych maszyn, pełne zachowanie aplikacji i długotrwały test pozostają osobnym odbiorem.

Ta paczka SQL nie wymagała nowego APK. Poprawka czatu jest zmianą JavaScriptu i wymaga przeładowania aplikacji Development z Metro; samodzielny APK otrzymuje ją w następnym buildzie. Token Sentry dodano później do Development i uruchomiono osobny build; aktualny stan: [MONITORING.md](MONITORING.md).
