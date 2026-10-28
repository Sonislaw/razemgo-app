# Kontrola działania powiadomień push

W projekcie testowym działa osobna funkcja `monitor-push`, uruchamiana co 5 minut przez zadanie `razemgo-monitor-push`. Nie uruchamia dispatchera, nie rezerwuje dostaw i nie wysyła powiadomień na telefony. Wykonuje odczyt zbiorczych danych i zgłasza incydenty do backendowego projektu Sentry. Nie wymaga przebudowy aplikacji.

## Co wykrywa

| Kod w Sentry | Warunek |
| --- | --- |
| `PUSH_QUEUE_STALLED` | Co najmniej jedna nadal aktualna i dopuszczona dostawa czeka ponad 10 minut po `due_at`, albo jej próba trwa ponad 10 minut. |
| `PUSH_CREDENTIALS` | Błąd `InvalidCredentials`, `MismatchSenderId`, HTTP 401 lub 403 od Expo w dostawie z wynikiem z ostatniej godziny. |
| `PUSH_RETRIES` | Aktualna dostawa ma co najmniej 4 próby i nadal napotyka błąd. Zwykłe `ReceiptPending` i wyłączona kategoria nie spełniają tego warunku. |
| `PUSH_DELIVERY_FAILURES` | Dostawa zakończyła się błędem w ostatniej godzinie. Zwykłe wyrejestrowanie telefonu nie tworzy incydentu. |
| `PUSH_SCHEDULE_INVALID` | Brakuje aktywnego zadania dispatchera co minutę albo monitora co 5 minut, lub ich harmonogram się zmienił. |
| `PUSH_DISPATCH_STOPPED` | Brak udanego wykonania zadania dispatchera przez ponad 10 minut. Po instalacji jest 10 minut na pierwszy tick. |
| `PROPOSAL_SCHEDULE_INVALID` | Dev: brak aktywnego `razemgo-proposals` co minutę albo zmieniony harmonogram. |
| `PROPOSAL_PROCESSOR_STOPPED` | Dev: brak sukcesu procesora propozycji przez ponad 5 minut; po instalacji jest 5 minut na pierwszy sukces. |
| `PROPOSAL_QUEUE_STALLED` | Dev: zadanie propozycji oczekuje ponad 10 minut według trwałego `first_queued_at`. |

Trzy alarmy propozycji dodaje migracja `202610270003_proposal_health.sql` i nowy `monitor-push`, wyłącznie na Dev. Rozszerzenie nie tworzy dodatkowego harmonogramu: działa przy istniejącej kontroli co pięć minut, z tymi samymi rezerwacjami i limitami. Nowa funkcja wymaga nowych pól diagnostycznych, dlatego najpierw wdrażamy migrację. Preview zachowuje dotychczasowy monitoring sześciu kodów. Szczegóły, testy i wydanie APK Dev: [STAGE_0.md](STAGE_0.md).

`due_at` uwzględnia już 15 minut oczekiwania przed pierwszym sprawdzeniem potwierdzenia oraz odstępy między ponowieniami. Samo oczekiwanie na przyszły termin nie jest zaległością. Wygasłe i niedopuszczone dostawy nie powodują alarmu o zaległej kolejce. Receipt oznacza przekazanie do dostawcy, a nie wyświetlenie na telefonie lub przeczytanie wiadomości.

Worker rozróżnia teraz błędy autoryzacji Expo od błędów sieci oraz od zwykłego braku receipt. Nie odczytuje treści odpowiedzi błędnej autoryzacji. Kody dostawcy są normalizowane do zamkniętej listy; nieznany tekst staje się `ProviderError`. Błędna konfiguracja nie usuwa tokenów urządzeń.

## Alarmy i zewnętrzna kontrola harmonogramu

Incydenty są grupowane według `operation:server.push_health` i kodu z tabeli. Każdy kod ma własny zapis w prywatnej tabeli bazy. Rezerwacja na 2 minuty chroni przed jednoczesną wysyłką, a ostatni przyjęty przez Sentry raport ogranicza powtórzenia do jednego na godzinę podczas trwającego problemu. Po naprawie i kolejnym wystąpieniu alarm może pojawić się od razu. Odrzucony raport nie uruchamia godzinnego limitu; ponowienie jest możliwe po 5 minutach. Awarie po przyjęciu raportu, lecz przed zapisem potwierdzenia, mogą spowodować powtórzenie — Sentry grupuje je pod tym samym kodem.

Każde uruchomienie monitora wysyła też heartbeat do **Sentry Crons**, monitor **`razemgo-push-health`**, środowisko **`development`**. Harmonogram `*/5 * * * *` jest w UTC; margines spóźnienia wynosi 5 minut. Dwa kolejne nieudane lub brakujące zgłoszenia tworzą problem w Sentry. Jedno udane zgłoszenie pozwala zakończyć incydent harmonogramu. Dzięki kontroli po stronie Sentry zatrzymanie całego Supabase Cron nie wymaga działającego procesu w Supabase, żeby zostało zauważone.

Heartbeat `ok` oznacza, że monitor zbadał stan i zdołał zgłosić wymagane incydenty. Problemy kolejki mają osobne zgłoszenia; zielony heartbeat nie zastępuje listy tych problemów. Odczyt bazy lub wysyłka diagnostyki zakończone błędem dają nieudany heartbeat, o ile Sentry jest osiągalne. Brak możliwości połączenia jest wykrywany jako brak kolejnego heartbeat. Pierwszy check-in tworzy monitor z konfiguracją; nie potrzeba tokena administracyjnego Sentry.

### Gdzie patrzeć w Sentry

1. Otwórz projekt **razemgo-backend**, środowisko **development**.
2. W **Issues** filtruj `operation:server.push_health`. Kod wskazuje rodzaj problemu.
3. W **Crons** otwórz **razemgo-push-health** i sprawdź historię zgłoszeń.
4. Aby otrzymywać e-maile, skonfiguruj w panelu regułę **Alerts → Issues** dla `operation=server.push_health` oraz drugą dla `monitor.slug=razemgo-push-health`. Wybierz odbiorcę i środowisko. Przy przejściu na produkcję zmień środowisko reguł na `production`.

Reguły odbiorców i dostarczenie e-maila wymagają ustawienia w koncie Sentry; kod nie nadaje uprawnień ani nie zmienia ustawień konta. Nie dodawaj do aplikacji tokena administracyjnego w tym celu. Sentry Crons podlega limitom i dostępności wybranego planu; sprawdź w panelu obecność monitora oraz Usage Stats. Sam HTTP 200 potwierdza przyjęcie transportu, nie dostarczenie e-maila ani odczyt w panelu.

## Dane i uprawnienia

RPC `get_push_health`, `claim_push_health_alerts` i `finish_push_health_alert` są dostępne wyłącznie dla roli serwerowej. Tabele `push_private.health_state` i `health_alerts` mają RLS i nie są dostępne użytkownikom aplikacji. Funkcja HTTP wymaga dotychczasowego klucza serwerowego dispatchera. Przeglądarka i klient mobilny go nie znają.

Raporty błędów nadal przechodzą przez wspólny filtr monitoringu. Zawierają kod problemu i losowy identyfikator żądania. Heartbeat jest zbudowany z zamkniętej listy pól: identyfikator check-in, stała nazwa monitora, wynik, wersja, środowisko i harmonogram. Nie kopiuje kontekstu SDK, danych konta, rozmów, nazw ekip, identyfikatorów urządzeń, tokenów ani SQL. Odczyt harmonogramu nigdy nie zwraca treści poleceń cron.

Preview przechowuje sześć rodzajów incydentów; Dev po etapie 0 dziewięć. Liczba wierszy stanu jest stała. Dotychczasowe nocne zadanie `razemgo-push-health-cleanup` usuwa zakończone logi harmonogramów wysyłki i kontroli starsze niż 7 dni; nie dotyka cudzych zadań ani danych rozmów. Dane historycznych dostaw otrzymują podczas migracji wcześniejszy czas zdarzenia, żeby wdrożenie nie przedstawiało dawnych awarii jako nowych.

## Wdrożenie i kontrole

Wdrożono migrację `202610240006_push_health.sql`, funkcje `monitor-push` i `dispatch-push`, a następnie harmonogram na projekcie `tueqqnbdvuazdxoqtpvk` 24.10.2026. Używane są istniejące sekrety backendu i DSN Sentry. Klucz dispatchera nie jest rotowany. Dla kolejnego środowiska, po konfiguracji push i monitoringu Sentry, wykonaj kolejno:

```powershell
npx supabase@latest db push --linked
npx supabase@latest functions deploy dispatch-push --use-api --no-verify-jwt
npx supabase@latest functions deploy monitor-push --use-api --no-verify-jwt
node scripts/configure-push-health.mjs
node scripts/check-push-health.mjs
npx supabase@latest db query --linked --file scripts/check-push-health-remote.sql
npx supabase@latest db query --linked --file scripts/check-push-health-schedule.sql
```

CLI wykonuj kolejno. `configure-push-health.mjs` nie uruchamia workera ani nie zmienia jego klucza. `check-push-health.mjs` sprawdza odmowę dostępu bez prawidłowego klucza, następnie uruchamia monitor i pokazuje wyłącznie zbiorcze dane. Może zgłosić istniejące incydenty w Sentry; nie wysyła push. Zwraca niepowodzenie, gdy kolejka jest niezdrowa albo Sentry nie potwierdziło heartbeat. Test SQL działa z `ROLLBACK`, bez zgłaszania fikcyjnych awarii do Sentry. Kontrola harmonogramu potwierdza zakończony tick i późniejszy odczyt monitora; wykonuj ją po pierwszym zaplanowanym uruchomieniu.

```powershell
npm run test:push-health
npm run test:notifications
npm run test:monitoring
npm run lint
npm run typecheck
npx deno test --node-modules-dir=none --no-lock --allow-env --allow-net --allow-sys --allow-read supabase/functions/_shared/monitoring.test.ts supabase/functions/dispatch-push/handler.test.ts supabase/functions/monitor-push/handler.test.ts
```

Testy obejmują uprawnienia, terminy i ponowienia, kody dostawcy, limity trwałe między wywołaniami, odzyskiwanie porzuconych rezerwacji, awarie bazy i transportu Sentry oraz brak prywatnych danych w raportach. Weryfikacja nie wyłącza prawdziwego harmonogramu ani nie uszkadza kluczy FCM, żeby wywołać awarię. Test otrzymania push na telefonie pozostaje osobną kontrolą.

Weryfikacja 24.10.2026: lint i TypeScript przeszły; wszystkie **240 testów Node** oraz **3 testy Deno z 10 podprzypadkami** zakończyły się powodzeniem. Zdalnie potwierdzono RLS/uprawnienia i trwały limit alarmów w transakcji cofanej przez `ROLLBACK`. Ręczna kontrola wskazała zdrową kolejkę i przyjęty przez Sentry heartbeat (HTTP 200). Potwierdzono także pierwszy automatyczny przebieg 24.10.2026 o 23:35 czasu polskiego: odpowiedź funkcji HTTP 200, `queue_healthy=true`, `sentry_heartbeat_accepted=true`, Sentry HTTP 200. Zwykły dispatcher zachował autoryzację i obsługę pustej kolejki. Podczas kontroli nie wysłano powiadomień na telefony ani nie zmieniono danych użytkowników. Odbiorcy e-mail, dostarczenie alertów pocztowych oraz widoczność monitora w zalogowanym panelu Sentry wymagają potwierdzenia przez użytkownika.

Źródła: [Sentry — Deno Crons](https://docs.sentry.io/platforms/javascript/guides/deno/crons/), [Supabase Cron](https://supabase.com/docs/guides/cron), [Expo — wysyłanie i receipts](https://docs.expo.dev/push-notifications/sending-notifications/).
