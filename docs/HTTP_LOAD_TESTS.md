# Obciążenie HTTP — 28.10.2026

Wykonano próbę na **10 000 profilach, 50 000 wyjazdach, 500 000 wiadomościach i do 200 równoległych sesji**. **Cele 800 ms / 1500 ms / poniżej 1% błędów nie zostały osiągnięte.** Najdroższym zbadanym odczytem jest ranking wyjazdów. Wyniki są punktem odniesienia dla kolejnej optymalizacji SQL.

Aktualizacja: wykonano kolejną paczkę optymalizacji i porównanie przed/po na tym samym runnerze. Ranking znacznie przyspieszył, lecz pełne cele obciążenia pozostają niespełnione. Aktualne wyniki: [DISCOVERY_SQL_OPTIMIZATION.md](DISCOVERY_SQL_OPTIMIZATION.md). Poniższy raport zachowuje punkt odniesienia sprzed tej paczki.

## Środowisko i zakres

[Przebieg z diagnostyką](https://github.com/Sonislaw/razemgo-app/actions/runs/40688440868) sprawdził commit `7f565e56489fdd7316dbf8d2e1cd34d2bfbe124a` na technicznej gałęzi `codex/http-load-verification`. Zbiorczy, trwały zapis: [http-load-measurements.json](http-load-measurements.json). Artefakt CI ma retencję siedmiu dni; plik w repozytorium zachowuje wyniki po tym terminie.

- Jednorazowy lokalny Supabase uruchomiony na runnerze GitHub Actions; odtworzono wszystkie 33 migracje.
- Runner: **4 vCPU**, około **15,6 GiB RAM**, Node **24.21.0**. PostgreSQL **17.11**, PostgREST **16.5**. Generator ruchu, API i baza dzielą ten sam runner.
- PostgreSQL: `shared_buffers=128MB`, `work_mem=4MB`, `max_connections=100`; limit czasu zapytania roli `authenticated` wynosi **8 s**.
- Rozmiar puli i czas jej pozyskania nie były jawnie ustawione w odczytanej konfiguracji kontenera. Raport nie przedstawia domyślnych wartości z dokumentacji jako pomiaru rzeczywistej konfiguracji.
- Zbiór ma po pięć publicznych wyjazdów na ekipę oraz 20 000 rozmów po 25 wiadomości. To równomierny fixture; nie odwzorowuje dużych skrzynek pojedynczych kont ani wszystkich kombinacji filtrów.
- Zweryfikowano liczby rekordów oraz brak urządzeń push, zdarzeń push i zadań propozycji. Edge workers i wysyłka poczty są wyłączone. Zasilanie fixture omija triggery publikacji i wiadomości; nie jest testem ścieżek zapisu.
- Sesje HTTP używają 200 różnych syntetycznych kont i istniejących lokalnych sesji Auth. JWT są podpisywane lokalnym kluczem testowego stacka. Poprawność rzeczywistego logowania Auth i RLS sprawdza osobny krok przed obciążeniem: [LOCAL_BACKEND_VERIFICATION.md](LOCAL_BACKEND_VERIFICATION.md).

Nie zmieniano hostowanych baz Dev/Preview, aplikacji testerów, migracji, reguł dopasowania ani limitów infrastruktury. Nie publikowano APK. Gałąź `master` pozostała bez zmian; zmiany narzędzi są również w lokalnym katalogu roboczym.

## Protokół

Najpierw każdy z sześciu odczytów wykonano trzy razy kolejno, bez konkurencji. Następnie uruchomiono etapy **10 → 50 → 100 → 200** sesji. Każda sesja wykonuje tę samą sekwencję sześciu odczytów, bez przerw i ponowień. Wyszukiwarki zwracają po **5** kart. Skrzynka używa dotychczasowego domyślnego rozmiaru strony.

To krótki test nagłego, równoczesnego ruchu: **2160 żądań w etapach obciążenia i 18 odczytów kontrolnych**. Nie jest to długotrwały test 200 osób korzystających z całej aplikacji. Nie obejmuje Realtime, aktywnego czatu, push, zapisu ogłoszeń, urządzeń ani opóźnienia internetu do hostowanego Supabase.

Każda operacja ma limit klienta 30 s. Mierzymy czas do odczytania i sprawdzenia JSON odpowiedzi. Timeouty i błędne odpowiedzi pozostają w statystykach; osobne pole `successfulP95Ms` opisuje wyłącznie poprawne odczyty i wynosi `null`, gdy nie było sukcesu. Progi są sprawdzane dla każdego endpointu osobno. Raport zawiera liczbę prób, sukcesy, błędy, kody, czas i bajty zdekodowanego JSON. Bajty nie obejmują nagłówków ani całego transferu sieciowego.

Przed kolejnym etapem sprawdzane jest zakończenie aktywnych zapytań połączeń PostgREST. Nie pobieramy ich treści. Raport jest zapisywany po każdej kontroli i etapie, także gdy następny krok zakończy się błędem.

## Wyniki kontrolne bez konkurencji

Mediana trzech odczytów; taka mała próbka nie potwierdza produkcyjnego p95.

| Odczyt | Mediana | Poprawne odczyty |
| --- | ---: | ---: |
| Podsumowanie konta | 8 ms | 3/3 |
| Wyjazdy, kolejność domyślna | 276 ms | 3/3 |
| Ekipy, alfabetycznie | 290 ms | 3/3 |
| Skrzynka | 45 ms | 3/3 |
| Ranking wyjazdów | **2253 ms** | 3/3 |
| Ranking ekip | 443 ms | 3/3 |

## Wyniki przy równoczesnym ruchu

| Sesje | Próby | Błędy | Odsetek błędów | Anulowanie SQL `57014` | Oczekiwanie na pulę `PGRST003` |
| --- | ---: | ---: | ---: | ---: | ---: |
| 10 | 60 | 10 | **16,7%** | 10 | 0 |
| 50 | 300 | 91 | **30,3%** | 33 | 58 |
| 100 | 600 | 273 | **45,5%** | 28 | 245 |
| 200 | 1200 | 786 | **65,5%** | 36 | 750 |

Już przy dziesięciu sesjach widać koszt konkretnych operacji:

| Odczyt | p95 wszystkich prób | Poprawne odczyty |
| --- | ---: | ---: |
| Podsumowanie konta | 82 ms | 10/10 |
| Wyjazdy, kolejność domyślna | 1120 ms | 10/10 |
| Ekipy, alfabetycznie | 1345 ms | 10/10 |
| Skrzynka | 211 ms | 10/10 |
| Ranking wyjazdów | **8063 ms — błędne odpowiedzi** | **0/10** |
| Ranking ekip | 2031 ms | 10/10 |

`57014` oznacza anulowane zapytanie PostgreSQL. Czas około ośmiu sekund jest zgodny z odczytanym limitem roli; wskazuje na przekroczenie czasu przy tym obciążeniu. Nie zapisywano tekstów błędów. [Kody PostgreSQL](https://www.postgresql.org/docs/17/errcodes-appendix.html).

`PGRST003` oznacza wyczerpanie czasu oczekiwania na wolne połączenie. Przy 200 sesjach dominuje ten rodzaj błędu. To potwierdza kolejkę oczekujących żądań; samo w sobie nie określa potrzebnego planu Supabase ani docelowego rozmiaru puli. [Dokumentacja PostgREST](https://docs.postgrest.org/en/stable/references/connection_pool.html).

Pełny wynik zawiera p95 i kody dla każdej operacji na każdym poziomie. Przy błędach około 10 s nie należy interpretować takich wartości jako czasu poprawnego załadowania strony.

Wcześniejszy [przebieg pierwszego pomiaru](https://github.com/Sonislaw/razemgo-app/actions/runs/40686757355) również nie osiągnął celów: odpowiednio 16,7%, 40,7%, 51,5% i 69,6% błędów. Używał mniej szczegółowego raportu, bez kontroli wstępnych i bez czasu wyjątków transportu w percentylach. Różnica między przebiegami nie jest efektem optymalizacji aplikacji — SQL pozostał ten sam. Raport z diagnostyką jest aktualnym punktem odniesienia.

## Wnioski i kolejna paczka

1. **Najpierw profilowanie i optymalizacja rankingu wyjazdów.** Jego koszt jest widoczny już bez konkurencji. W tym fixture porównuje około 50 tys. kandydatów z pięcioma planami konta. Zmierzyć wewnętrzny plan przez `EXPLAIN (ANALYZE, BUFFERS)` w jednorazowym PostgreSQL, koszty funkcji i powtarzane obliczenia. Wyznaczyć zwycięzców przed budowaniem pełnych JSON kart i powodów dopasowania, zachowując dokładne wyniki, kolejność remisów, kursor oraz ochronę widoczności i blokad. Nie ograniczać arbitralnie kandydatów przed rankingiem.
2. **Zmniejszyć koszt zwykłych stron wyjazdów i ekip.** Przy dziesięciu sesjach obie przekraczają 800 ms. Sprawdzić osobno liczenie wyników, materializację szerokich wierszy, normalizację nazw i składanie pięciu kart. Konkretne indeksy i przebudowę zapytania wybrać po planach wykonania.
3. **Powtórzyć identyczny protokół i porównać endpointy.** Przed wdrożeniem zmian SQL na Dev przejść regresję zgodności, cursorów, RLS i uprawnień. Nowe migracje pozostają addytywne. Cel pozostaje 800/1500 ms oraz błędy poniżej 1%; nie podnosimy timeoutów dla zielonego wyniku.
4. **Następnie dłuższy test z realistycznym ruchem i ocena zasobów.** Dodać stopniowe wchodzenie użytkowników, powtarzane odczyty, rozkład aktywności i większe skrzynki. Oddzielić generator od bazy przy docelowej ocenie infrastruktury. Dobór zasobów hostowanego Dev wymaga osobnego pomiaru; obecna próba nie dowodzi ani pojemności, ani braku pojemności konkretnego planu Supabase.

Skrzynka i podsumowanie były szybkie w kontroli bez konkurencji, lecz przy dużym ruchu także czekały na pulę. Wpływ drogich odczytów na pozostałe operacje wymaga powtórzenia próby po optymalizacji; na podstawie tego scenariusza nie przypisujemy całego opóźnienia skrzynki jej własnemu SQL.

## Narzędzia i weryfikacja

`scripts/benchmark-load.mjs` używa wyłącznie danych z lokalnego `supabase status`. Odrzuca adresy inne niż loopback. Hasło PostgreSQL przekazuje przez środowisko procesu `psql`; logi i raporty nie zawierają URL bazy, JWT, kluczy, treści odpowiedzi ani identyfikatorów profili. Kody błędów są ograniczone do SQLSTATE/PostgREST. Do raportu trafia wyłącznie jawna lista niesekretnych parametrów środowiska.

`scripts/load-results.test.mjs` sprawdza percentyle, uwzględnianie timeoutów, oddzielenie sukcesów, progi per endpoint, odrzucanie pustych/niepoprawnych odpowiedzi oraz usuwanie dowolnego tekstu z kodów diagnostycznych. Po pomiarze dodatkowo zaostrzono kontrolę UUID kart i obecności kursora; te ograniczenia nie zmieniają SQL ani zmierzonych czasów.

Przebieg obciążenia ma status **failure**, ponieważ `--strict` prawidłowo odrzucił niespełnione cele. Kontrole schematu i rzeczywistego Auth/PostgREST w tym samym zadaniu przeszły. Lokalnie po zmianach narzędzi przeszły lint, TypeScript, kontrola źródeł i **481/481 testów Node/PGlite**. Poprzedni pełny przebieg aplikacji obejmował także 58/58 testów przeglądarkowych, Edge Functions i eksporty: [raport kontroli](LOCAL_BACKEND_VERIFICATION.md). Obecna paczka zmienia narzędzia pomiarowe i dokumentację.

Uruchomienie wymaga Dockera, klienta `psql`, Node 24 i jednorazowej lokalnej bazy:

```powershell
npx --yes supabase@2.122.0 start -x studio,imgproxy,inbucket,edge-runtime,logflare,vector,supavisor
npx --yes supabase@2.122.0 db reset --local --no-seed
npm run test:local-backend
npm run benchmark:load -- --seed --strict
# Wynik: .expo/hardening-http-load.json
npx --yes supabase@2.122.0 stop --no-backup
```

Fixture nie jest idempotentny: przed ponowieniem z `--seed` należy odtworzyć pusty jednorazowy stack. W CI służą do tego parametry `backend_only=true`, `load_test=true` workflow `Checks`. Przy braku Dockera na Windows można użyć tego izolowanego przebiegu; nie trzeba włączać hostowanych backendów.
