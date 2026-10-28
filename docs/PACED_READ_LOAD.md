# Stopniowe sesje odczytów — 28.10.2026

Ta paczka dodaje narzędzia pomiarowe, bez zmian wyglądu, funkcji produktu, migracji i hostowanych backendów. Oryginalny zsynchronizowany test `benchmark:load` zachowuje sześć odczytów, etapy 10/50/100/200, brak przerw i dotychczasowe progi. Nowy scenariusz **nie zastępuje jego niespełnionych kryteriów**: [wyniki po optymalizacji SQL](DISCOVERY_SQL_OPTIMIZATION.md).

## Protokół

`npm run benchmark:sessions -- --strict` wykonuje deterministyczny rozkład odczytów dla 200 syntetycznych kont. Sesje dołączają stopniowo przez 60 s, a następnie przez 180 s wszystkie uczestniczą w teście. Przebieg jest powtarzany na zbiorze równomiernym i zróżnicowanym: 10 tys. profili, 50 tys. wyjazdów, 500 tys. wiadomości. To czterominutowy scenariusz na wariant, a nie wielogodzinny soak test.

- Każda sesja ma odczyt stanu konta co 20 s i działania co 10–20 s. Stałe ziarno losowania pozwala powtórzyć dokładnie ten sam rozkład.
- Rozkład działań: 45% zwykła lista wyjazdów, 25% ekipy alfabetycznie, 20% skrzynka, po 5% rankingi wyjazdów i ekip. To jawne założenie syntetyczne, nie pomiar zachowań użytkowników.
- Listy zwracają pięć kart. Skrzynka korzysta z domyślnej strony. JSON jest sprawdzany tak samo jak w oryginalnym teście, łącznie z niepustymi wynikami i liczbą dostępnych rekordów.
- Limit klienta wynosi 30 s; nie ma ponowień. Odpowiedzi rozpoczęte w okresie pomiaru i zakończone po jego końcu nadal należą do wyników. Raport zapisuje czas opróżniania żądań.
- Harmonogram jest wyliczony przed wysyłką. Wolne odpowiedzi nie zmniejszają po cichu planowanego ruchu. Maksymalnie dwa odczyty na sesję i jeden tego samego endpointu mogą być w toku; pominięte z tego powodu pozycje harmonogramu są jawnie liczone.
- Rampa i okres ze wszystkimi sesjami mają osobne wyniki. Progi 800/1500 ms i mniej niż 1% błędów sprawdzamy per endpoint w okresie stałym, z uwzględnieniem błędów i timeoutów. Dodatkowo wymagamy co najmniej 50 wykonanych prób per endpoint, mniej niż 1% pominiętych pozycji i p95 opóźnienia wysłania nie większego niż 100 ms.

Scenariusz obejmuje odczyty HTTP, nie pełne sesje aplikacji. Nie ma Realtime, otwierania historii czatu, zapisów, push, telefonów ani opóźnienia zewnętrznej sieci. Nie potwierdza obsługi 200 osób na hostowanym planie Supabase.

## Diagnostyka

Generator działa w osobnym procesie Node. Wywołania `psql` i Docker w procesie nadrzędnym nie blokują jego pętli zdarzeń. **Generator i baza nadal współdzielą fizyczny runner**; osobny proces nie oznacza osobnego komputera. Zapisujemy CPU, pamięć i opóźnienie pętli zdarzeń generatora, aby pokazać ograniczenia samego narzędzia.

Próbki zasobów mają docelowy odstęp pięciu sekund; rzeczywiste odstępy są zapisane w raporcie. Obejmują:

- CPU, pamięć oraz liczbę procesów/wątków kontenerów bazy, API, bramy i Auth. 100% CPU Dockera oznacza jeden rdzeń; nie sumujemy tego z czasem odpowiedzi API.
- Liczbę aktywnych/bezczynnych połączeń PostgREST w bazie, oczekiwanie na blokady i I/O, wiek najdłuższego aktywnego zapytania oraz różnice zbiorczych liczników PostgreSQL.
- Faktycznie odczytaną konfigurację rozmiaru puli i limitu oczekiwania przez `postgrest --dump-config`. Surowa konfiguracja zawierająca dane połączenia pozostaje wyłącznie w pamięci.
- Gdy lokalny serwer administracyjny PostgREST jest już dostępny: dostępne połączenia, oczekujące żądania, maksymalny rozmiar puli i przyrost timeoutów. Scenariusz nie restartuje API ani nie włącza nowego endpointu. Brak tych danych jest `null`, nie zerem ani potwierdzeniem zdrowej puli.

Raport zawiera wyłącznie liczby i stałe etykiety. Nie zapisuje tekstów zapytań, claims, nazw ekip, identyfikatorów kont, treści rozmów, adresów bazy, tokenów, prywatnych komunikatów błędów ani środowiska kontenerów. Sampler kontroluje wyłącznie lokalne kontenery projektu z `supabase/config.toml`. Dodatkowa diagnostyka zużywa zasoby tego samego runnera; jej wpływ pozostaje ograniczeniem pomiaru. Wymagamy co najmniej 80% planowanej liczby próbek, najwyżej 15 s przerwy oraz co najmniej 90% dostępnych pomiarów bazy i kontenerów DB/API; udane próbki jedynie przed i po obciążeniu nie wystarczą do potwierdzenia diagnostyki.

## Uruchamianie

Wymagane: Node 24, Docker, klient `psql` i jednorazowy lokalny Supabase. Resolver odrzuca backend spoza loopback; proces generatora niezależnie powtarza kontrolę adresu. Na komputerze bez Dockera używamy ręcznego workflow `Checks`: `backend_only=true`, `session_test=true`. Workflow nie otrzymuje sekretów Dev/Preview i niczego nie publikuje.

```powershell
npx --yes supabase@2.122.0 start -x studio,imgproxy,inbucket,edge-runtime,logflare,vector,supavisor
npx --yes supabase@2.122.0 db reset --local --no-seed
npm run test:local-backend
npm run benchmark:sessions -- --seed --strict
node scripts/profile-discovery.mjs --make-diverse
npm run benchmark:sessions -- --diverse --strict
npx --yes supabase@2.122.0 stop --no-backup
```

Fixture jest jednorazowy: `--seed` wymaga pustego stacka. Zmiany różnicujące dane obejmują wyłącznie syntetyczne identyfikatory; triggery są wyłączone w transakcji, więc nie powstają propozycje ani push. Benchmark sprawdza rozmiar zbioru, liczbę lokalizacji i brak zadań wysyłki przed testem.

Artefakty `.expo/hardening-session-load.json` i `.expo/hardening-session-load-diverse.json` są zapisywane także w trakcie próby. `complete=false` oznacza przerwane lub niedokończone wykonanie. CI zachowuje raporty siedem dni. Status niepowodzenia przy `--strict` jest prawidłowy, gdy progi nie zostały osiągnięte albo brakuje podstawowych pomiarów bazy i API.

## Weryfikacja i wyniki

Lokalnie przeszły lint, TypeScript, kontrola źródeł oraz **506 testów Node/PGlite**. Nowe testy obejmują deterministyczny ruch, ograniczenia harmonogramu, osobne etapy, brakujące próbki, wolne odczyty, opóźniony generator, ochronę raportów i rzeczywisty proces generatora z lokalnym HTTP/IPC. Osobne przypadki potwierdzają odmowę adresu zewnętrznego przed wysyłką i odrzucenie przekierowania HTTP bez przekazania sesji do docelowego serwera.

[Końcowy przebieg CI](https://github.com/Sonislaw/razemgo-app/actions/runs/40759455247) sprawdził commit `18fcf510d167eb280202317065b3c6f6e5d3ce82` na technicznej gałęzi `codex/session-load-verification-final`, z końcową kontrolą ciągłości diagnostyki i odmową przekierowań HTTP. Porównanie skrótów potwierdziło zgodność 12 plików narzędzi, konfiguracji i testów z lokalnym katalogiem roboczym. Schemat, rzeczywisty Auth/PostgREST i oba komplety profili SQL przeszły. Zadanie ma status **failure wyłącznie przez niespełniony próg rankingu wyjazdów w zróżnicowanym scenariuszu**. Artefakty i usunięcie jednorazowego stacka zakończyły się poprawnie. Nie uruchamiano ponownie niezmienionego interfejsu ani eksportów w tym przebiegu backendowym.

Trwały zbiorczy zapis: [paced-read-measurements.json](paced-read-measurements.json). Nie zawiera surowych odpowiedzi ani danych użytkowników. Runner: cztery vCPU AMD EPYC 9V74, około 15,6 GiB RAM, Node 24.22.1. Log startu potwierdził obrazy `supabase/postgres:17.11.0.006` i `supabase/postgrest:v16.5`. Faktyczny odczyt konfiguracji i metryk potwierdził pulę **10 połączeń** i **10 s** limitu oczekiwania; nie są to wartości przyjęte z dokumentacji.

### Odczyty przy 200 stopniowo dołączających sesjach

Każdy wariant wykonał **5036 żądań**: 828 podczas rampy i 4208 w okresie stałym. Łącznie **10 072 poprawne odczyty, zero błędów HTTP/transportu i zero pominiętych pozycji**. Poniższe p95 dotyczą okresu stałego, osobno dla endpointów.

| Odczyt | Dane równomierne | Dane zróżnicowane | Cel |
| --- | ---: | ---: | ---: |
| Podsumowanie konta | 6 ms | 12 ms | 800 ms |
| Zwykła lista wyjazdów | 122 ms | 286 ms | 800 ms |
| Ekipy alfabetycznie | 47 ms | 131 ms | 800 ms |
| Skrzynka | 78 ms | 164 ms | 800 ms |
| Ranking wyjazdów | 513 ms | **2607 ms — niezaliczony** | 1500 ms |
| Ranking ekip | 140 ms | 1332 ms | 1500 ms |

Wynik zbiorczy wszystkich odczytów nie zastępuje progów per endpoint. Zero błędów nie oznacza wystarczająco szybkiego rankingu. Nie zwiększano timeoutów, puli, progów ani zasobów, aby uzyskać zaliczenie.

### Zasoby i ograniczenia wniosku

| Pomiar w całym oknie próby | Równomierne | Zróżnicowane |
| --- | ---: | ---: |
| Szczyt CPU bazy | 177,23% | **387,82%** |
| Szczyt pamięci bazy | 428 MB | 593 MB |
| Przyrost `temp_bytes` | 1,07 GB | **9,41 GB** |
| Szczyt zaobserwowanych oczekujących na pulę | 8 | 8 |
| Przyrost timeoutów puli | 0 | 0 |
| Średnie CPU generatora, jeden rdzeń = 100% | 2,62% | 2,76% |

Każdy wariant zachował 50 próbek, z pełną dostępnością bazy, kontenerów DB/API i metryk puli. Maksymalna przerwa wyniosła 5003 ms. P95 opóźnienia wysłania było najwyżej 1 ms, a p95 pętli zdarzeń generatora 21 ms. To wskazuje na koszt odczytów bazy, a nie przeciążenie JavaScriptu narzędzia. Pamięć generatora osiągała około 195 MB.

Szczyt 387,82% oznacza wykorzystanie niemal czterech rdzeni, nie 387% całego serwera. `temp_bytes` jest zbiorczym przyrostem bajtów zapisanych do plików tymczasowych, nie ilością zajętej pamięci ani samodzielnym dowodem, że każde opóźnienie powoduje dysk. Przypisanie tego kosztu poszczególnym planom wymaga dalszego profilowania. Zbiorcze liczniki transakcji obejmują też odczyty diagnostyczne: 49 rollbacków pochodzi z jawnie wycofywanych transakcji samplera; nie jest liczbą błędów aplikacji. Brak deadlocków i zaobserwowanych oczekiwań na blokady nie wyklucza krótszych zdarzeń między próbkami.

[Próba wstępna](https://github.com/Sonislaw/razemgo-app/actions/runs/40758326169), na innym czterordzeniowym runnerze EPYC 7763, również zaliczyła dane równomierne i odrzuciła zróżnicowane. W zróżnicowanej części wykazała p95 rankingu wyjazdów 10 354 ms oraz 17 timeoutów puli w okresie stałym. Protokół ruchu i backend były takie same; końcowe narzędzia dodały odmowę przekierowań i wymóg ciągłości diagnostyki. To nie jest porównanie optymalizacji kodu. Różnica pokazuje wpływ środowiska i nasycenia wspólnych zasobów, dlatego pojedynczy przebieg na runnerze nie pozwala dobrać hostowanego planu Supabase.

## Następny krok

Przygotowanie narzędzi i wykonanie obu prób jest zakończone. Dalszy priorytet to koszt dokładnego rankingu wyjazdów przy różnych wejściach, ze szczególnym sprawdzeniem grupowania, sortowania i zapisu danych tymczasowych w planach. Zachowujemy wyniki, kolejność remisów, porcje po pięć i ochronę RLS. Nie podnosimy liczby połączeń w odpowiedzi na samo oczekiwanie w kolejce: przy nasyconym CPU może to pogorszyć czasy innych odczytów.

Oddzielenie generatora i bazy na różnych maszynach, dłuższy test oraz pełne ścieżki aplikacji pozostają do odbioru. Dotychczasowy test nagłego ruchu nadal ma niespełnione kryteria. Preview, hostowane dane Dev i wydania aplikacji nie zostały zmienione przez tę paczkę narzędzi.

Źródła: [statystyki PostgreSQL 17](https://www.postgresql.org/docs/17/monitoring-stats.html), [metryki puli PostgREST](https://docs.postgrest.org/en/stable/references/observability.html), [Docker stats](https://docs.docker.com/reference/cli/docker/container/stats/).
