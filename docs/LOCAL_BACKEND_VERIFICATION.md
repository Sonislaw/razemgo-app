# Rzeczywisty backend testowy — 28.10.2026

## Sposób uruchomienia

Na komputerze z Windows nie ma Dockera ani WSL. Testy wykonano na jednorazowym runnerze GitHub Actions, gdzie Supabase CLI uruchamia lokalne PostgreSQL, Auth i PostgREST. Odtworzono wszystkie 33 migracje. Runner nie otrzymuje sekretów hostowanych projektów, nie uruchamia Edge workerów i nie wysyła prawdziwych e-maili ani push.

Gałąź techniczna: `codex/local-backend-verification`. Główna gałąź zdalna pozostała na `fa749018b8348df077fca68ca7bea5ca40296d3f`. Lokalna gałąź robocza nadal ma poprawki do zatwierdzenia; nie wykonywano wdrożeń aplikacji ani zmian w hostowanych bazach Dev/Preview.

[Pełny przebieg kontroli](https://github.com/Sonislaw/razemgo-app/actions/runs/40683260802) sprawdził commit `b58dd158a73734c3a615b5f3866233f4ae5f9e86` i zakończył się **success, 3/3 zadań**:

- rzeczywisty lokalny Auth/PostgREST, porównanie schematu i odtworzenie 33 migracji;
- lint, TypeScript, kontrola źródeł, **476/476 testów Node/PGlite**, testy Edge (**5 testów / 12 kroków**), Expo Doctor **20/20**, zgodność pakietów oraz eksporty Android/web;
- **58/58 scenariuszy Playwright**, w tym nowy test blokowania przycisku podczas niedokończonej synchronizacji reakcji.

Sprawdzono zgodność dwunastu zmienionych plików kodu i CI z lokalnym katalogiem roboczym. Dalsze lokalne zmiany dotyczą wyłącznie dokumentacji wyników.

## Potwierdzone kontrole Auth/PostgREST

`scripts/local-backend-check.mjs` tworzy dwa syntetyczne, potwierdzone konta przez lokalne Auth Admin API i loguje je e-mailem/hasłem. Nie zastępuje Auth atrapą.

- Właściciel zapisywanego profilu pochodzi z konta JWT; podany w JSON fałszywy właściciel jest ignorowany.
- Każde konto odczytuje swój wiersz `travel_groups` i `group_preferences`. Bezpośredni odczyt cudzych wierszy zwraca pusty zbiór przez RLS.
- Bezpośrednia próba zmiany właściciela profilu jest odrzucana.
- Anonimowe żądania do podsumowania, skrzynki, własnych wyjazdów, panelu moderacji i diagnostyki push otrzymują jawne `42501`, a nie przypadkowy błąd brakującej funkcji.
- Zwykły użytkownik nie może uruchomić administracyjnego odczytu zgłoszeń, diagnostyki ani funkcji wydającej zadania/tokeny push.
- Poprawnie podpisany JWT wskazujący nieistniejącą sesję jest odrzucany. Wygasły JWT otrzymuje HTTP 401.
- Konto A nie odczytuje własnego kontraktu szczegółów wyjazdu należącego do B.
- 25 równoległych zgłoszeń różnych wyjazdów kończy się dokładnie 20 zapisami i pięcioma odmowami `54000`. Ponowienie zaakceptowanego klucza nadal działa po osiągnięciu limitu.
- Sześć równoległych zaproszeń do jednego odbiorcy kończy się pięcioma zapisami i jedną odmową `54000`. Podsumowanie odbiorcy pokazuje komplet pięciu oczekujących zaproszeń.

Po testach usuwane są syntetyczne konta, a runner zatrzymuje cały lokalny Supabase bez zachowywania bazy. Skrypt odmawia użycia adresu innego niż lokalny loopback. Testy obciążenia do 200 sesji nie były częścią tego przebiegu (`load_test=false`).

## Poprawki ujawnione przez świeży runner

### Typy Expo

Świeże pobranie repozytorium nie zawiera ignorowanego `expo-env.d.ts`. Sam lint nie gwarantuje jego utworzenia. `src/types/expo.d.ts` jawnie importuje deklaracje SDK, dzięki czemu TypeScript rozpoznaje CSS i CSS Modules również bez wcześniejszego uruchomienia Metro. Lokalnie sprawdzono kompilację z pominięciem wygenerowanych deklaracji Expo.

### Powtarzalne generowanie schematu

Hostowane Management API i lokalny generator CLI zwracały różne wersje szablonu: oprócz formatowania różniły się reprezentacją JSON, pól identity oraz funkcji bez argumentów. Nie wyłączono kontroli tych różnic.

Źródłem generowanych typów jest teraz **lokalna baza odtworzona z migracji i przypięty Supabase CLI 2.122.0**. Plik `src/types/database.generated.ts` pochodzi z rzeczywistego przebiegu CI. TypeScript Printer zapewnia powtarzalny zapis bez dodawania formattera do zależności. Porównanie zachowuje typy identity i nullowalność JSON. Jedyną pomijaną adnotacją jest wersja serwera PostgREST, jeśli generator ją doda; nie jest ona kontraktem schematu.

Adapter JSON rozpoznaje `Record<PropertyKey, never>` jako funkcję bez argumentów. Nadal sprawdza obecność RPC i nazwy argumentów funkcji z parametrami. Walidacja odpowiedzi podczas działania aplikacji pozostaje aktywna.

Generowanie i sprawdzenie wymagają uruchomionego lokalnego Supabase; te polecenia **nie łączą się już z hostowanym Dev**:

```powershell
npm run types:database
npm run types:database -- --check
```

`--local` pozostaje akceptowany dla zgodności z dotychczasowym workflow. Przy niezgodności CI pokazuje pierwszą różnicę i zachowuje wygenerowany schemat jako artefakt przez siedem dni. Nie zapisuje danych użytkowników ani kluczy. Nieudane porównanie typów nie pomija niezależnych testów HTTP, ale nadal powoduje niepowodzenie zadania.

### Synchronizacja historii czatu

Przycisk starszych wiadomości mógł stać się aktywny przed zakończeniem synchronizacji reakcji, podczas gdy kontroler nadal blokował następny odczyt. Kliknięcie wtedy niczego nie robiło. Osobny stan `requestPending` blokuje przycisk do zakończenia całej operacji, zachowując dotychczasowy wygląd i etykiety podczas odświeżania w tle.

Nowy test celowo opóźnia odpowiedź z reakcjami. Odtworzył problem przed poprawką, a po poprawce potwierdził, że kliknięcie doładowuje najstarsze wiadomości. Nie zwiększano timeoutów ani nie wyłączano testu.

Test ulubionych oczekuje teraz rzeczywistej zmiany URL przed przeładowaniem strony. Poprzednie oczekiwanie na przycisk serduszka mogło spełnić się jeszcze na liście, ponieważ ten sam przycisk występuje też w szczegółach.

## CI i dalszy odbiór

Ręczne uruchomienie `Checks` ma dodatkowy parametr `backend_only`, domyślnie wyłączony. Pozwala powtórzyć sam jednorazowy backend. Zwykłe uruchomienia po push i pull request nadal wykonują wszystkie trzy zadania. Pełny końcowy przebieg tej paczki uruchomiono z `backend_only=false`.

Następnie wykonano próbę HTTP na dużym zbiorze syntetycznym i do 200 sesji. Cele wydajnościowe nie zostały spełnione; potrzebna jest kolejna optymalizacja SQL. Wyniki i ograniczenia: [HTTP_LOAD_TESTS.md](HTTP_LOAD_TESTS.md). Osobne pomiary fizycznego telefonu pozostają do wykonania. Zielone testy kontraktów i RLS nie potwierdzają docelowej przepustowości.

Kolejna paczka została wdrożona wyłącznie na Dev jako migracja 008. Zmniejszyła koszt rankingów i list; końcowe CI objęło 34 migracje, 493 testy Node/PGlite oraz 59 scenariuszy przeglądarkowych. Aktualne porównania i nadal niespełnione cele obciążenia: [DISCOVERY_SQL_OPTIMIZATION.md](DISCOVERY_SQL_OPTIMIZATION.md).

Zmiany typów i kontrole CI nie wymagają nowego natywnego modułu. Poprawka czatu wymaga aktualnego JavaScriptu: działa po przeładowaniu w aplikacji Development z Metro; samodzielny APK otrzyma ją przy kolejnej budowie. Nie publikowano nowego APK ani aktualizacji Preview. Token Sentry pozostaje do późniejszego dodania.
