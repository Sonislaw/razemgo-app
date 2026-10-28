# Dokładny ranking na zróżnicowanych danych

Zmiana backendowa na Dev, bez zmiany interfejsu, wag dopasowania, powodów, kolejności remisów, kursorów ani stron po pięć. Nowa migracja `202610280009_relative_ranking_keys.sql` zachowuje wcześniejsze migracje i publiczny kontrakt. Preview pozostaje osobnym środowiskiem.

## Przyczyna kosztu

W poprzednim pomiarze zróżnicowane dane dawały 49 995 różnych kluczy rankingu. Klucze przechowywały pełne identyfikatory i nazwy lokalizacji, choć dla konkretnego użytkownika wiele z nich miało ten sam wpływ na punktację. Osobno materializowano kandydatów, unikalne klucze i ich wyniki, a następnie łączono je ponownie. Plan pokazał zapis danych pośrednich na dysk przy deduplikacji i łączeniu; końcowe sortowanie top-N mieściło się w pamięci. Raport bazowy: [PACED_READ_LOAD.md](PACED_READ_LOAD.md).

## Zmiana

- Słownik lokalizacji powstaje w obrębie jednego żądania, na podstawie **wszystkich** własnych planów użytkownika. Dokładnie znane wartości dostają lokalny numer. Nieznane, niepuste wartości mogą współdzielić oznaczenie, ponieważ nie są równe żadnej wartości źródłowej. Brak wartości jest oddzielnym stanem.
- Zostaje zachowane pierwszeństwo identyfikatora lokalizacji przed nazwą, dotychczasowa normalizacja polskich liter i regionów oraz rozróżnienie pustego i niepustego regionu. Nie ma skracania nazw, haszowania z ryzykiem kolizji ani limitu 32/64 własnych planów.
- Daty używane do punktacji są przycinane do obwiedni wszystkich źródłowych terminów, razem z tolerancją wyszukiwania. Każdy dopuszczalny przesunięty termin źródłowy mieści się w tej obwiedni. Przecięcie wyjazdu z obwiednią nie zmienia więc jego przecięcia z żadnym z tych terminów. Wyjazdy całkowicie poza obwiednią mają nadal zerową zgodność dat.
- Klucz pomija zainteresowania, wiek dzieci i zwierzęta, których nie używa żaden plan źródłowy. Zachowuje unię masek źródeł (OR): przecięcie z każdą pojedynczą maską jest dokładnie takie samo przed i po tej operacji. Dane ogłoszenia nie są zmieniane.
- Oryginalne daty i lokalizacje służą nadal do filtrów, wyświetlania karty oraz obliczania powodów dla zwycięskiej strony. Zaokrąglenie następuje osobno dla każdego źródła, przed wyborem maksimum. Przy remisie powody wybiera istniejący scorer.
- Wszystkie uprawnienia, wykluczenia blokad i moderacji, `SECURITY DEFINER`, pusty `search_path` i lokalny `force_custom_plan` pozostają zachowane. Nowy typ jest prywatny; nie dodano nowego RPC ani cache między kontami.
- `list_public_trips` rozdziela odczyt konkretnego UUID od dotychczasowego odczytu całej listy. Rozłączne gałęzie `UNION ALL` pozwalają użyć indeksu UUID także przy ogólnym planie SQL; druga gałąź jest wyłączona przy podanym UUID. Wspólne reguły widoczności są sprawdzane przez `candidates`, z zachowaniem zachowania konta bez profilu i zawieszonego konta. Lista pól JSON, domyślny argument `null` oraz sortowanie pozostają takie same.
- Ranking ekip liczy wyłącznie dokładną punktację liczbową dla kandydatów. Powody, oceniona waga i znacznik niepełnych danych powstają przez dotychczasowy scorer dla zwracanej strony. Zachowuje dwustronne preferencje, pomijanie nieznanego wieku dzieci i wynik `null` przy wadze poniżej 60. Eliminuje budowanie pełnego JSON i przechowywanie szerokich kluczy wszystkich profili.

Materializacja jest dobierana świadomie, aby nie powtarzać obliczeń. Jej koszt i możliwość ograniczenia przetwarzania opisuje [dokumentacja PostgreSQL 17](https://www.postgresql.org/docs/17/queries-with.html#QUERIES-WITH-CTE-MATERIALIZATION).

## Regresja

Test `discovery-optimization-backend.test.mjs` porównuje kompletne odpowiedzi z dwiema niezależnymi poprzednimi wersjami: sprzed migracji 008 i z migracji 008. Sprawdza wszystkie strony, remisy, filtry, wskazany plan źródłowy, brak aktywnych planów, unikalne lokalizacje, normalizację regionów, długie i rozłączne terminy oraz ponad 64 własne plany. Dodatkowy test SQL porównuje przycięcie dat z wyczerpującym przeglądem przesunięć dla 4656 przedziałów i trzech okien źródłowych.

Na pełnym, jednorazowym PostgreSQL `verify-ranking-parity.mjs` porównuje JSON kart, punktów, powodów i kursorów obu rankingów dla trzech kont, trzech zestawów filtrów i dwóch stron, jeżeli istnieje druga strona. Odpowiedzi pozostają w tabeli tymczasowej, a cała operacja kończy się rollbackiem. Na zewnątrz wychodzi tylko licznik porównań. Poprzednia definicja odczytu kart jest przywracana wraz z poprzednimi rankingami, więc porównanie obejmuje też jej format i widoczność.

## Porównanie wydajności

Workflow `Checks` z `backend_only=true, session_test=true` wykonuje migrację 008 i 009 na tym samym runnerze oraz tych samych danych, statystykach i limitach. Każdy wariant danych otrzymuje osobną próbę przed i po zmianie. Poprzednie definicje RPC są przywracane wyłącznie w jednorazowym backendzie loopback, z odtworzeniem aktualnej wersji w `finally`.

Protokół ruchu nie zmienia się: 10 tys. profili, 50 tys. wyjazdów, 500 tys. wiadomości, 200 sesji, 60 s rampy i 180 s pomiaru. Tak samo obowiązują cele p95 800 ms dla zwykłych stron i 1500 ms dla rankingu, mniej niż 1% błędów i pominiętych odczytów oraz kontrola pokrycia diagnostyką. Baseline może prawidłowo nie spełniać celów; aktualna wersja ma w CI włączone `--strict`.

Trzy warianty są badane osobno: dotychczasowy zbiór równomierny, 50 tys. unikalnych lokalizacji ze zróżnicowanymi profilami oraz dodatkowy zbiór ze zmiennymi danymi punktacji ogłoszeń. Ostatni obejmuje 365 dat rozpoczęcia, 21 długości pobytu, pięć sposobów podróżowania, 2048 zestawów zainteresowań, dwa gatunki zwierząt i brak zwierząt oraz różne preferencje rodzaju ekipy i wieku dzieci. Obejmuje także konta z różnymi własnymi planami; nie jest to jedynie test wielu nazw miejsc. Zmiany danych są ograniczone do identyfikatorów syntetycznych, bez generowania propozycji i push.

Sześć pełnych pomiarów wymaga co najmniej 24 minut samego ruchu. Dlatego limit całego zadania CI wynosi 45 minut; nie zmienia to timeoutów API, SQL, kryteriów diagnostyki ani celów wydajności.

Plany SQL sprzed zmiany otrzymują sufiks `-previous`, raporty HTTP `-baseline`. Wyniki zawierają wyłącznie zagregowane dane techniczne. Test nadal nie obejmuje telefonu, WAN, Realtime, zapisów i push, ani nie potwierdza pojemności hostowanego planu Supabase. Wcześniejszy niespełniony test nagłego ruchu pozostaje oddzielnym kryterium.

## Wyniki końcowe i wdrożenie

[Końcowy przebieg CI](https://github.com/Sonislaw/razemgo-app/actions/runs/40775697484) zakończył się sukcesem dla commitu `3fbcdadb727d896c29e06ec142541f0f1a8e324a`. Porównanie SHA-256 potwierdziło zgodność ośmiu plików kodu, migracji, testów i workflow z lokalną wersją wdrożeniową. Trwały zapis zbiorczy: [relative-ranking-measurements.json](relative-ranking-measurements.json).

Runner miał cztery dostępne vCPU AMD EPYC 9V45, około 15,6 GiB RAM i Node 24.22.1. Start potwierdził obrazy PostgreSQL `17.11.0.006` oraz PostgREST `v16.5`; odczyt konfiguracji potwierdził pulę 10 połączeń i 10 s oczekiwania. Porównania poniżej są sparowane na tym samym runnerze. Nie porównujemy bezpośrednio czasów końcowego kodu z pierwszym prototypem: tamten runner miał inny procesor, EPYC 7763.

Każdy z sześciu przebiegów wykonał 5036 odczytów: 828 podczas rampy i 4208 w okresie stałym. Łącznie **30 216 udanych odczytów, zero błędów i zero pominiętych żądań**. Wszystkie warianty nowej wersji spełniły niezmienione kryteria `--strict`. Wersja 008 na tym runnerze przekraczała limit rankingu wyjazdów w drugim i trzecim zbiorze.

Poniższe wartości to p95 okresu stałego, w milisekundach, **008 → 009**:

| Odczyt | Dane równomierne | Unikalne lokalizacje i różne profile | Różne dane punktacji ogłoszeń |
| --- | ---: | ---: | ---: |
| Podsumowanie konta | 6 → 4 | 9 → 4 | 9 → 5 |
| Zwykła lista wyjazdów | 108 → 47 | 217 → 55 | 243 → 62 |
| Ekipy alfabetycznie | 41 → 32 | 81 → 33 | 85 → 36 |
| Skrzynka | 62 → 49 | 114 → 53 | 123 → 57 |
| Ranking wyjazdów | 373 → 290 | **1648 → 429** | **2028 → 815** |
| Ranking ekip | 97 → 75 | **799 → 85** | **872 → 94** |

W trzecim zbiorze zapis danych tymczasowych spadł z 9,73 do 0,875 GB, a maksymalne zaobserwowane CPU bazy z 389 do 218% jednego rdzenia. Maksymalna zaobserwowana pamięć kontenera bazy wyniosła 542 → 468 MB. Są to liczniki i próbki całego przebiegu, łącznie z diagnostyką; 49 rollbacków na wariant pochodzi z transakcji samplera, nie z błędów aplikacji. Każdy przebieg miał 50 poprawnych próbek bazy, kontenerów i puli, bez luki większej niż 5004 ms.

W pojedynczych profilach SQL ranking wyjazdów dla drugiego zbioru skrócił się z 826 do 336 ms, a dla trzeciego z 836 do 406 ms. Ranking ekip odpowiednio 257 → 55 ms i 261 → 56 ms. Liczba unikalnych kluczy punktacji wyjazdów dla reprezentatywnego konta spadła z 49 995 do 12 w drugim zbiorze oraz do 1523 w trzecim. Liczba kandydatów pozostała 49 995. Przy pobraniu pięciu kart liczba odwołań do stron bufora przez projektor spadła z 10 514 do 92. Te profile zawierają narzut instrumentacji i nie są percentylami HTTP.

Lokalnie przeszły **511 testów Node/PGlite**, lint, TypeScript i kontrola źródeł. CI odtworzyło 35 migracji, sprawdziło zgodność wygenerowanych typów, rzeczywisty Auth/PostgREST, izolację kont, role RPC i limity równoległych zapisów. Manifest nadal obejmuje 123 funkcje i 14 tabel z RLS. Dodatkowe porównanie obu rankingów sprawdziło **108 par pełnych odpowiedzi**: po 36 stron w każdym zbiorze. Nie uruchamiano ponownie niezmienionego interfejsu, Edge Functions ani eksportów aplikacji; telefonu nie mierzono.

Migracja 009 została zastosowana **wyłącznie do Dev `kswuakzcnoqgovnwejhb`**, bez seedów, zmian danych użytkowników i wdrażania Edge Functions. Końcowy dry-run potwierdził brak oczekujących migracji. Po wdrożeniu anonimowe wywołania `search_public_trips`, `list_ranked_public_groups`, `list_public_trips` i `get_my_sync_state` otrzymały HTTP 401 / `42501`. Preview i konta testerów pozostają bez zmian. Nie publikowano commitów na `master`; lokalne zmiany pozostają bez commitu, a sprawdzony kod jest także na technicznej gałęzi CI.

Zmiana backendowa działa z obecnym APK Dev. Wynik potwierdza opisany scenariusz odczytów na jednorazowym backendzie, nie obsługę 200 rzeczywistych użytkowników na hostowanym planie. Generator i baza współdzieliły fizyczny runner. Realtime, zapisy, push, WAN, długotrwały ruch i pomiary telefonu pozostają oddzielnym odbiorem. Historycznego testu nagłego ruchu nie powtórzono po migracji 009.

## Pierwsza próba i dalsza korekta

[Pierwszy przebieg](https://github.com/Sonislaw/razemgo-app/actions/runs/40770190005), commit `9c556178a9849f71d3d1abd03a8b489edd8f3bff`, sprawdzał niewdrożony wariant roboczy migracji 009, obejmujący tylko klucze rankingu wyjazdów. Zachowany raport: [relative-ranking-initial-measurements.json](relative-ranking-initial-measurements.json).

W zróżnicowanym zbiorze p95 rankingu wyjazdów spadło na tym samym runnerze z 10 268 do 1847 ms, a rankingu ekip z 7113 do 2527 ms dzięki mniejszemu przeciążeniu. Błędy okresu stałego spadły z 35 do zera. W trzecim, trudniejszym zbiorze p95 wyniosło 12 898 → 4787 ms dla wyjazdów i 9728 → 3199 ms dla ekip, a błędy 193 → 0. Cele rankingów nadal nie były spełnione. Status `failure` był prawidłowy; raportów nie odrzucono ani nie zmieniono progów.

Plany pokazały dwa dalsze koszty: odczyt pięciu pojedynczych kart nadal skanował dużą tabelę wyjazdów, a ranking ekip materializował 9999 pełnych wyników z powodami. Dlatego końcowa wersja obejmuje opisane wyżej rozdzielenie gałęzi odczytu kart i liczbową punktację ekip. Pierwsza próba nie została zastosowana do hostowanego Dev ani Preview.
