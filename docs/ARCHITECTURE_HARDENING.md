# Uporządkowanie techniczne — Dev, 28.10.2026

## Zakres i stan

Aktualizacja odbioru: rzeczywisty lokalny Supabase uruchomiono następnie w GitHub Actions, z pozytywnym wynikiem kontroli Auth/PostgREST i schematu. Naprawiono również problemy ujawnione przez świeży checkout. Szczegóły, źródło generowania typów i status dalszych pomiarów: [LOCAL_BACKEND_VERIFICATION.md](LOCAL_BACKEND_VERIFICATION.md). Opis poniżej zachowuje pomiary i stan pierwotnego przekazania paczki.

Kolejna aktualizacja: wykonano natywną próbę HTTP do 200 sesji na danych 10k/50k/500k. Cele nie zostały osiągnięte; ranking wyjazdów i kolejka połączeń wymagają dalszej pracy. Pełny raport i kolejność optymalizacji: [HTTP_LOAD_TESTS.md](HTTP_LOAD_TESTS.md).

Następnie wdrożono wyłącznie na Dev optymalizację dokładnego rankingu i list nową migracją 008 (34 migracje na Dev). Mediana kontrolnego HTTP rankingu wyjazdów spadła z 2253 do 415 ms; pełne cele 200 sesji nadal nie są osiągnięte. Regresja przeszła 493 testy Node/PGlite i 59 scenariuszy Playwright. Pomiary na tym samym runnerze, zakres wdrożenia i ograniczenia: [DISCOVERY_SQL_OPTIMIZATION.md](DISCOVERY_SQL_OPTIMIZATION.md).

Kolejna paczka dodaje osobny, stopniowy scenariusz 200 sesji z diagnostyką zasobów i ochroną przed pozornie dobrym wynikiem przeciążonego generatora. Nie zmienia produktu ani hostowanych backendów: [PACED_READ_LOAD.md](PACED_READ_LOAD.md). Token Sentry dodano do Development; bieżący stan budowy i wysyłki map jest w [MONITORING.md](MONITORING.md). Poniższa sekcja APK opisuje wcześniejszy build bez potwierdzonego uploadu.

Wprowadzono pięć paczek prac nad kontraktami, synchronizacją, odczytami bazy, startem i kontrolami bezpieczeństwa. Zachowano wygląd aplikacji, porcje po pięć w Odkrywaj i ogłoszeniach ekipy oraz powrót do miejsca na liście. Nie dodano funkcji produktu.

Zmiany backendu wdrożono wyłącznie do **Dev `kswuakzcnoqgovnwejhb`**. Dev ma 33 migracje; Preview `tueqqnbdvuazdxoqtpvk`, jego aplikacja, konta i dane pozostały bez zmian. Starsze migracje i publiczne kontrakty RPC zachowano. Zmiany repozytorium nie zostały automatycznie zatwierdzone ani wysłane do GitHub.

**Pozostają oddzielne warunki odbioru:** uruchomienie prawdziwego lokalnego Supabase w Dockerze i prób HTTP do 200 sesji, pomiary i regresja na telefonie oraz potwierdzenie symbolikacji Sentry po dodaniu tokena. Dotychczasowe wyniki nie potwierdzają przepustowości hostowanego planu Supabase.

## Podział kodu

Przepływ: ekran → kontroler/hook/magazyn → repozytorium i adapter → transport Supabase → RPC/RLS.

| Odpowiedzialność                              | Pliki                                                                                 |
| --------------------------------------------- | ------------------------------------------------------------------------------------- |
| Schemat generowany z bazy                     | `src/types/database.generated.ts`                                                     |
| Jawne kontrakty JSON i walidacja odpowiedzi   | `src/data/contracts/`                                                                 |
| Limit czasu, anulowanie, przypisanie do konta | `src/lib/backend-request.ts`, `request-lifecycle.ts`                                  |
| Synchronizacja konta                          | `src/lib/account-sync.ts`, `src/features/auth/account-sync-context.tsx`               |
| Stabilne dane i selektory                     | `src/lib/snapshot-store.ts`, `src/hooks/use-store-selector.ts`, `use-action-store.ts` |
| Wspólna mechanika stron                       | `src/lib/paged-resource.ts`                                                           |
| Skrzynka i kontekstowe strony kontaktów       | `src/features/messaging/mailbox-pages.ts`, `messaging-context.tsx`                    |
| Kontroler i widoki kreatora                   | `src/features/trips/trip-editor-controller.tsx`, `trip-editor-steps.tsx`              |
| Widok pojedynczej wiadomości                  | `src/features/messaging/chat-message-row.tsx`                                         |
| Dane demonstracyjne                           | `src/data/demo-adapter.ts`                                                            |

Modele interfejsu, w tym `TravelerProfile`, pozostają osobne. Schemat Supabase nie jest już ręcznie opisywany modelami funkcji produktu. JSON RPC przechodzi walidację podczas działania aplikacji; dodatkowa kontrola TypeScript wykrywa zmianę nazw RPC i kluczy ich argumentów.

### Żądania

- Domyślny limit całej operacji wynosi 20 sekund; obejmuje również usuwanie konta. Limit działa także wtedy, gdy transport ignoruje anulowanie.
- Żądanie ma epokę konta. Wylogowanie, ponowne logowanie lub zmiana konta unieważniają wcześniejsze operacje i ich spóźnione odpowiedzi.
- Wyszukiwanie i strony list otrzymują własny sygnał anulowania. Zmiana filtrów lub zamknięcie aktywnej rozmowy zatrzymuje niepotrzebny odczyt.
- Bezpieczny odczyt może jawnie włączyć jedno ponowienie błędu sieciowego/5xx w granicach tego samego limitu czasu. Zapisy nie są automatycznie ponawiane przez transport; ich istniejące klucze idempotencji pozostają zachowane.
- Celowe anulowanie nie tworzy alarmu Sentry. Metryki lokalne obejmują liczbę żądań, czas, wynik i liczbę bajtów zdekodowanego JSON; nie przechowują odpowiedzi, identyfikatorów kont ani treści.

### Synchronizacja i pamięć

Jedna subskrypcja `mailbox_updates` obsługuje skrzynkę i powiadomienia. Push, Realtime, powrót na pierwszy plan oraz kontrolny odczyt co 20 sekund korzystają ze wspólnego koordynatora. Krótkie serie sygnałów są łączone. Niezmieniona rewizja nie uruchamia ponownego pobierania pełnych danych. Nieudane zadanie jest ponawiane przy kolejnym odczycie kontrolnym nawet wtedy, gdy rewizja się nie zmieniła. Odczyty zatrzymują się w tle.

Historia i reakcje wiadomości odświeżają się w aktywnej rozmowie. Pamięć przechowuje najwyżej pięć ostatnich pełnych historii oraz rozmowę aktywną; pozostałe zachowują podgląd i dane potrzebne skrzynce. Przed pobraniem historii z głębokiego linku sprawdzane jest członkostwo w rozmowie. Odpowiedź pobrana przed zmianą konta lub ekranu nie może przywrócić starego stanu.

Liczniki, pojedyncze rozmowy, serduszka, reakcje i obecność używają selektorów. Stabilizacja tablic i obiektów ogranicza aktualizacje niezwiązanych elementów. Zmiana jednej reakcji nie wymaga publikacji nowej wartości szerokiego kontekstu dla całej listy.

Powrót ze szczegółów zachowuje cache, filtry i pozycję. Pierwsza strona oraz zbiorczy odczyt wcześniej załadowanych identyfikatorów sprawdzają aktualność i uprawnienia bez ponownego pobierania każdej wcześniejszej strony. Ukryte lub zablokowane rekordy są usuwane z zachowanego zestawu.

## Backend i zgodność

Nowe migracje, w kolejności:

1. `202610280001_technical_reads.sql` — wspólny kontekst rankingu ekip, obliczanie zgodności po ograniczeniu strony alfabetycznej, usunięcie duplikatu indeksu.
2. `202610280002_account_pages.sql` — lekki stan konta, stany odczytów, stronicowane własne wyjazdy i skrzynka, pojedynczy własny wyjazd oraz indeksy kursora.
3. `202610280003_cached_results.sql` — zbiorcza kontrola aktualności i dostępności zachowanych kart.
4. `202610280004_write_rate_locks.sql` — blokady konta przed sprawdzeniem limitów zgłoszeń i zaproszeń profilowych, również dla równoległych zapisów do różnych odbiorców.
5. `202610280005_discovery_cost.sql` — zbiorcze sprawdzanie blokad i zawieszeń kandydatów; brak normalizacji pustej lokalizacji.
6. `202610280006_score_batches.sql` — zbiorcze, włączalne do planu zapytania obliczanie zgodności wyjazdów, bez wielokrotnych odczytów kontekstu użytkownika.
7. `202610280007_trip_contact_counts.sql` — pełne liczniki kontaktów konkretnego własnego wyjazdu, niezależne od stron skrzynki.

Własne wyjazdy i sekcje skrzynki pobierają początkowo po 20 elementów i doładowują kolejne porcje podczas przewijania, bez nowego przycisku. Pojedynczy własny wyjazd jest pobierany niezależnie od obecności na pierwszej stronie. Liczniki oraz najnowsze opublikowane ogłoszenie pochodzą z pełnego zbioru uprawnionych danych. Datę odniesienia związano z kursorem własnych wyjazdów, aby przejście przez północ nie mieszało stron.

Dokładny ranking i dotychczasowa kolejność przy remisie pozostały zachowane. Test porównuje nową funkcję punktacji ze starszą dla ponad stu kombinacji dat i preferencji. Nie zastosowano przybliżonego rankingu ani limitowania kandydatów przed sortowaniem po zgodności.

Istniejące testy kolejki nadal sprawdzają deduplikację, dzierżawy, ponowienia, pierwotny wiek zadania i ochronę przed jednoczesnym przejęciem tej samej pracy. Testy te nie stanowią pomiaru rzeczywistej przepustowości dostawcy push. W testach skali nie ma prawdziwych tokenów urządzeń ani wysyłki e-mail/push.

## Start i zasoby

Słownik 43 989 miejscowości pozostaje zasobem aplikacji, ale nie jest parsowany i indeksowany przy samym imporcie modeli, dat lub mapperów. Ładuje się przy pierwszym użyciu wyszukiwania. Test osobno sprawdza stan cache modułów przed i po wyszukaniu. Odroczenie inicjalizacji nie oznacza usunięcia słownika z dystrybucji.

Stałe wieku dzieci przeniesiono do `src/constants/travel.ts`, a uzupełniające lokalizacje poza katalog mocków. Dane demonstracyjne przechodzą przez osobny adapter; nowe prawdziwe konto nadal zaczyna bez własnych przykładowych rozmów i wyjazdów.

24 ilustracje przekonwertowano z PNG do **bezstratnego WebP**. Zachowano rozdzielczość i przezroczystość; sprawdzono identyczność wszystkich pikseli RGBA z oryginałami. Ikony wymagane do budowania natywnego pozostały PNG.

| Pomiar                  |        Przed |           Po |
| ----------------------- | -----------: | -----------: |
| Pliki 24 ilustracji     | 12 159 511 B |  7 798 004 B |
| Hermes, eksport Android | 11 383 863 B | 10 244 596 B |
| Zasoby eksportu Android | 14 009 094 B |  9 755 325 B |

Porównanie eksportu odnosi się do zapisanych artefaktów etapu 0 i obecnego eksportu. To rozmiary plików przed kompresją APK, a nie pomiar pamięci lub czasu startu telefonu.

## Wyniki sieci i SQL

Pełne, zbiorcze wyniki są w [architecture-measurements.json](architecture-measurements.json). Próbka sieci używa rzeczywistej przeglądarki i tego samego kontrolowanego API: 50 własnych wyjazdów, 80 rozmów, trzy wcześniej odwiedzone historie. Wersją odniesienia jest `25715b5`. Nawigacja między rozmowami odbywa się wewnątrz aplikacji.

| Scenariusz                                        | Żądania przed → po |     JSON przed → po |
| ------------------------------------------------- | -----------------: | ------------------: |
| Pierwsze otwarcie                                 |            16 → 17 |  167 656 → 49 600 B |
| Okresowy odczyt bez zmian                         |             11 → 4 |     175 251 → 287 B |
| Nowa wiadomość i aktualizacja odczytu             |            14 → 19 | 310 315 → 110 799 B |
| Odczyty historii nieaktywnych rozmów przy zmianie |              2 → 0 |                   — |

Liczba żądań przy zmianie wzrosła: lekkie podsumowania, stronicowanie, kontrola uprawnień zachowanych rekordów i potwierdzenie odczytu zastępują większe odpowiedzi. Transfer tego scenariusza spadł o około 64%. To zdekodowany JSON w fixture, nie skompresowany transfer do hostowanego Supabase. Pojedyncza próbka nie jest gwarancją stałej liczby żądań przy każdej kolejności zdarzeń.

Osobny pomiar SQL wykorzystuje PGlite/WASM i dane syntetyczne: **10 000 profili, 50 000 wyjazdów, 500 000 wiadomości**. Podano medianę trzech wykonań w pojedynczej sesji. „Przed” w tej tabeli oznacza stan po migracjach 001–004 tej paczki, przed optymalizacją 005–006; nie jest pomiarem całego starego backendu.

| Odczyt                   |     Przed |       Po |
| ------------------------ | --------: | -------: |
| Zwykła strona wyjazdów   |  2 313 ms |   350 ms |
| Ranking wyjazdów         | 45 715 ms | 5 473 ms |
| Alfabetyczna strona ekip |    379 ms |   374 ms |
| Ranking ekip             |    880 ms |   791 ms |
| Podsumowanie konta       |      3 ms |     4 ms |
| Strona skrzynki          |    101 ms |    96 ms |

**Ranking wyjazdów w tym teście nadal przekracza docelowe 1,5 s.** PGlite nie zastępuje natywnego PostgreSQL ani 200 równoległych sesji HTTP. Nie potwierdzono celów p95 800/1500 ms ani błędów poniżej 1% na hostowanym Dev. Wyniki wskazują dalszy obszar pomiarów, a nie osiągnięcie całego celu skali.

## Bezpieczeństwo i automaty

- Manifest `scripts/rpc-permissions.json` kontroluje uprawnienia 122 funkcji oraz RLS 14 tabel. Testy sprawdzają role, `SECURITY DEFINER` i stały `search_path`. Pomocnicze funkcje potrzebne politykom RLS zachowują jawnie dozwolone role.
- Testy nowych odczytów obejmują konta A/B, anonimowego użytkownika, zawieszone konto, blokady, ukryte rekordy, fałszywego właściciela oraz opóźnioną odpowiedź po zmianie konta.
- Mapy przyjmują tylko HTTPS i wskazane hosty/ścieżki Google Maps. WebView odrzuca inne adresy, dostęp do plików, mieszane treści, geolokalizację i otwieranie nowych okien. HTML ma restrykcyjne CSP, a iframe webowy ograniczenia sandbox.
- Zależności Edge Functions są przypięte; Deno 2.9.6 korzysta z `supabase/functions/deno.lock` i `--frozen`.
- `check:source` wykrywa sekrety, nieśledzone przez pomyłkę pliki środowiska, cykle importów i zależności warstwy technicznej od UI. To dodatkowa kontrola repozytorium, nie pełny audyt sekretów wszystkich zewnętrznych usług.
- CI dodaje jednorazowy lokalny Supabase: migracje, porównanie wygenerowanych typów, prawdziwy Auth/PostgREST oraz próby równoległego przekroczenia limitów. Nie otrzymuje sekretów backendów Dev/Preview i niczego nie publikuje.
- Opcjonalny ręczny przebieg CI `load_test` uruchamia fixture i rosnące obciążenie do 200 sesji. Skrypt dopuszcza wyłącznie lokalny backend loopback.

`npm audit` nadal raportuje **3 pozycje high i 5 low**, głównie łańcuch narzędzi Expo. Zod 3.25.76 jest wymagany przez obecną linię Expo CLI, a wskazana poprawka wymaga Zod 4.6.6; nie wymuszono niezgodnej zmiany głównej wersji. Dla wskazanego Deepmerge 4.3.1 nie ma poprawionego wydania. Zod i Deepmerge nie występują w źródłach aktualnego bundla Androida; to nie usuwa ryzyka w narzędziach developerskich. Nie użyto `audit fix --force` ani cofnięcia SDK. [Zod](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), [Deepmerge](https://github.com/advisories/GHSA-gcqx-w48m-w2h4).

Ochrona Supabase przed znanymi wyciekłymi hasłami nadal wymaga osobnej decyzji o planie Pro; nie włączono płatnej opcji.

## Polecenia i odbiór

```powershell
npm run lint
npm run typecheck
npm run check:source
npm test
npm run test:edge
npm run test:web
npm run types:database -- --check
npx expo install --check
npx expo-doctor
npx expo export --platform android --source-maps --output-dir .expo/hardening-android
npx expo export --platform web --source-maps --output-dir .expo/hardening-web
```

Pomiary lokalne:

```powershell
# Wymaga działającego testowego webu; szczegóły argumentów w skrypcie.
node scripts/measure-network.mjs
npm run benchmark:sql

# Wymaga Dockera i PostgreSQL client/psql. Wyłącznie jednorazowy lokalny stack.
npx --yes supabase@2.122.0 start -x studio,imgproxy,inbucket,edge-runtime,logflare,vector,supavisor
npx --yes supabase@2.122.0 db reset --local --no-seed
npm run types:database -- --local --check
npm run test:local-backend
npm run benchmark:load -- --seed --strict
npx --yes supabase@2.122.0 stop --no-backup
```

Stan weryfikacji na komputerze: lint, TypeScript, kontrola źródeł, **472 testy Node/PGlite**, testy Edge Functions (5 testów i 12 kroków), zgodność typów z Dev, Expo Doctor 20/20, kontrola wersji pakietów i eksporty Android/web zakończone poprawnie. Bezpośredni test anonimowy rzeczywistego Dev potwierdził odmowę siedmiu sprawdzonych RPC i trzech Edge Functions. Mapy Androida i webu mają Debug IDs obecne także w odpowiadających im bundlach.

Playwright: dwa wcześniejsze pełne przebiegi miały 57/57 poprawnych scenariuszy. Końcowy pełny przebieg po poprawkach synchronizacji zakończył się 56/57: test zmiany konta przechodził do logowania przed zakończeniem nawigacji wylogowania. Dodano oczekiwanie na ekran powitalny; ponowiono cały plik obejmujący kolekcje, z wynikiem **3/3**. Nie zwiększano limitu czasu ani nie wyłączano scenariusza. Regresja obejmuje porcje po pięć, odtwarzanie pozycji, ograniczone okno renderowania, błędy stron, izolację kont i stabilność rozmów.

**Docker nie jest dostępny na tym komputerze**, dlatego nowy przebieg CI z rzeczywistym lokalnym Auth/PostgREST i obciążeniem HTTP nie został tutaj wykonany. Przygotowanie workflow nie jest potwierdzeniem jego przejścia na GitHub.

### APK i Sentry

`npm run build:performance` buduje samodzielny release APK połączony z **Dev**, z tym samym pakietem co Dev. Nie wymaga Metro i zastępuje zainstalowany APK Dev; Preview pozostaje osobną aplikacją. `npm run build:dev` przywraca wariant developerski wymagający Metro. Nie porównuj wyników startu/FPS/pamięci development APK z tym release APK.

Build bieżącej paczki **zakończył się poprawnie**: [8420c65d — EAS](https://expo.dev/accounts/sonislaw/projects/razemgo/builds/8420c65d-6721-41b2-9850-29df6a87a1b3). [Pobierz APK](https://expo.dev/artifacts/eas/36hfjr3WRxlYRFiAWe2WPLe0S3WzJUWr2Y01U028vMo.apk). Lokalna kopia: `.expo/razemgo-dev-hardening-release.apk`, 122 033 774 B, cztery ABI. Metadane EAS potwierdzają profil `performance` i pakiet `pl.razemgo.app.development`. Kontrola spakowanego bundla potwierdziła adres Dev i brak adresu Preview. SHA-256: `e02833b9d67e1bd7cf6f1bf929ea56bf0b4e8bd430c5243c26727a07cc82361c`. Nie jest to jeszcze test uruchomienia na fizycznym urządzeniu.

Release Sentry zawiera wersję, wariant i skrót treści źródeł, również niezacommitowanych. Eksporty mają Debug IDs. Plugin uploadu jest aktywny wyłącznie w Dev; automatyczna inicjalizacja natywna oraz natywne raportowanie pozostają wyłączone. Szczegóły i konfiguracja tokena: [MONITORING.md](MONITORING.md).

Zgodnie z decyzją użytkownika `SENTRY_AUTH_TOKEN` zostanie dodany później jako **Secret w EAS Development**. Profil `performance` dopuszcza brak uploadu przez `SENTRY_ALLOW_FAILURE=true`; w tym buildzie nie potwierdzono przesłania map. Po dodaniu tokena trzeba wykonać nowy build i sprawdzić czytelny ślad kontrolowanego błędu. Sama lokalna mapa lub identyfikator zdarzenia nie potwierdzają symbolikacji.

Na telefonie pozostaje: logowanie Google i powrót z przeglądarki, restart sesji, klawiatura i stabilność rozmowy, push/otwieranie właściwego ekranu, przewijanie i przywracanie list oraz pomiary zimnego startu, pamięci i płynności release APK. Te wyniki należy zapisać osobno z modelem telefonu i identyfikatorem buildu.
