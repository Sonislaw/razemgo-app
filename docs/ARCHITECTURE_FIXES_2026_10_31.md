# Poprawki po przeglądzie architektury — 31.10.2026

## Zakres

Realizacja najważniejszych ustaleń z [przeglądu](ARCHITECTURE_REVIEW_2026_10_31.md), bez dodawania funkcji produktu. Zachowano wygląd, jawne doładowywanie po pięć, oddzielne konta Dev/Preview i możliwość powrotu ze szczegółów. Wydanie: 1.4.0.

## Listy i baza

- `createPagedResource` uzgadnia ponownie wczytany zakres po zmianie składu lub kolejności wyników. Zachowywanie starego kursora po samym odczycie znanych ID nie jest już traktowane jako potwierdzenie kompletności.
- Cztery odczyty otrzymały dodatkowe `result_revision`: wyjazdy Odkrywaj, katalog ekip, ogłoszenia ekipy i własne wyjazdy. Skrót obejmuje wyłącznie ID dostępnych rekordów i klucze ich kolejności. Nie zastępuje kontroli dostępu.
- Przy niezmienionej rewizji odczytywana jest pierwsza strona oraz aktualność znanych rekordów, bez ponownego pobierania wszystkich poprzednich stron. Zmiana podczas doładowania wymusza uzgodnienie zakresu. Poprzednia dostępna karta na granicy zakresu pozostaje wczytana.
- Brak rewizji w starszej odpowiedzi uruchamia bezpieczne odtworzenie stron. Niepoprawna rewizja jest błędem kontraktu. Zmiana zbioru w trakcie wielostronicowego uzgadniania pozostawia możliwość ponowienia.
- Katalog ekip korzysta ze wspólnego kontrolera paginacji. Licznik i lista używają tego samego `directory_candidates`, walidacji filtrów, widoczności, blokad i kontroli sesji.
- Migracja `202610310006_page_reconciliation.sql` rozszerza istniejące odpowiedzi JSON. Nie zmienia sygnatur RPC ani starych migracji.

## Synchronizacja i pamięć

- Prywatna tabela `messaging_private.sync_revisions` przechowuje osobne liczniki zmian skrzynki, powiadomień, ulubionych i wyjazdów. Ma RLS, brak dostępu klienta i kaskadowe usuwanie wraz z ekipą.
- `get_my_sync_state()` zwraca tylko liczniki domen, obok dotychczasowego podsumowania. Istniejący sygnał Realtime `mailbox_updates` pozostaje wspólny i zgodny ze starszymi klientami. Nie publikuje treści rozmów.
- Koordynator uruchamia tylko zmienione domeny, inicjalizuje nowych odbiorców, scala zdarzenia i ponawia nieudane odczyty również przy niezmienionej rewizji. Starsze podsumowanie nadal jest obsługiwane.
- Usunięto osobny bezwarunkowy odczyt ulubionych co 30 sekund. Własne wyjazdy korzystają z tego samego koordynatora powrotu aplikacji. Kontrola dostępu i heartbeat obecności zachowują odrębne zadania.
- Obserwacje obecności i reakcji kart są zwalniane po utracie fokusu ekranu. Wirtualizacja nadal zwalnia odległe karty.
- Cache szczegółów własnych wyjazdów zachowuje maksymalnie 100 ostatnio pobranych encji i przypina najnowsze aktywne ogłoszenie potrzebne na Start. Strony list zachowują niezależną kolejność i wcześniej wczytane karty; limit tego cache nie obcina listy.
- Katalog ekip subskrybuje listę blokad zamiast całego stanu rozmów. Filtry wyjazdów subskrybują zbiór ulubionych tylko wtedy, gdy go potrzebują.
- Migracja `202610310007_sync_domains.sql` nie zmienia publicznego schematu tabel ani sygnatur API. Publiczne generowane typy pozostają bez zmian; rozszerzenia JSON mają osobne kontrakty i walidację wykonania. Manifest uprawnień obejmuje nowy prywatny trigger.

## Podział kodu

- Transport zgłoszeń przeniesiono z widoku do repozytorium moderacji.
- Logowanie e-mail, rejestracja i potwierdzanie adresu mają repozytorium; ekrany odpowiadają za formularz i przejścia.
- Odczyt znanych własnych wyjazdów przeniesiono z hooka do repozytorium.
- Obsługa reakcji wiadomości ma osobny kontroler hookowy: wersjonowanie odczytów, ochrona zapisów w toku i zwalnianie nieaktywnych danych. Stan rozmów nadal ma selektory i granicę konta.
- Bieżący model wyjazdu nie zawiera dawnych preferencji `matching`. Ich odtwarzanie pozostało wyłącznie w adapterze referencyjnych testów starszych RPC.
- Kontrola źródeł zabrania bezpośredniego używania SDK backendu w widokach. Jawne wyjątki obejmują kontroler logowania i właściciela połączenia Realtime.

## Pomiary i kontrole

Aktualne testy HTTP/sesji wywołują V3, zamiast mierzyć usunięte z produktu sortowanie zgodności. Scenariusz sesji obejmuje podsumowanie, wyjazdy, ekipy i skrzynkę; stare formuły mają osobne testy zgodności. Opcjonalny workflow nie uruchamia już historycznego benchmarku rankingu jako punktu odniesienia bieżącej listy.

Próba SQL: syntetyczne 10 tys. profili, 50 tys. wyjazdów, 500 tys. wiadomości; jedna sesja PGlite, mediana trzech odczytów:

| Odczyt | Mediana |
| --- | ---: |
| Wyjazdy V3 | 122 ms |
| Ekipy V3 | 77 ms |
| Licznik ekip | 25 ms |
| Podsumowanie | 2 ms |
| Skrzynka | 82 ms |

Nie jest to test hostowanego PostgreSQL ani 200 równoległych sesji. Współbieżne lokalne kontrole wpływają na czas; tych wartości nie należy traktować jako kontrolowanego porównania procentowej poprawy z wcześniejszym raportem.

Test przeglądarkowy mierzy żądania i bajty przez pięć **wirtualnych** minut na atrapach API, a następnie pojedynczą zmianę powiadomienia. Sprawdza brak ponownych odczytów skrzynki, historii, własnych wyjazdów i ulubionych przy niezmienionych domenach. Po zmianie powiadomienia pobierana jest tylko jego domena. Raport zawiera zbiorcze dane, bez odpowiedzi, tokenów i identyfikatorów użytkowników.

Nowe regresje obejmują wstawienie pomiędzy stronami, zmianę kolejności, usunięcie granicy, zmianę podczas doładowania, brak rewizji, powrót do widocznej karty oraz izolację domen i kont. Test ręcznego ponawiania czatu zatrzymuje zegar kontrolnego odświeżania; nie konkuruje już z automatycznym odzyskaniem danych.

## Zależności i ograniczenia odbioru

Zaktualizowano sześć pakietów przez Expo w ramach SDK 58. Expo Doctor: 20/20. Audyt po aktualizacji: brak high/critical, 27 wpisów moderate wynikających z dwóch źródłowych zgłoszeń dla narzędzi [Glob](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) i [Minimatch](https://github.com/advisories/GHSA-g3hv-75wg-m249). Dotyczą operacji na wzorcach/plikach w narzędziach; nie stwierdzono doprowadzania do nich danych formularzy przez aplikację. Nie wymuszano niezgodnej zmiany głównych wersji ani proponowanego przez audit cofnięcia SDK.

Monitoring natywnych awarii pozostaje wyłączony: raporty natywne nie przechodzą przez obecny filtr JavaScript. Monitoring JS/backendu i mapy źródeł są zachowane. Bez osobnego zabezpieczenia danych i próby fizycznego buildu nie włączano zbierania dodatkowych raportów.

Pełny test lokalnego Supabase/PostgREST i kanoniczny generator typów wykonano w CI, na jednorazowej bazie odtworzonej ze wszystkich migracji. Przeszły logowanie, izolacja kont, aktualne strony V3 i zgodność wygenerowanych typów; osobno przeszły referencyjne testy dawnych kontraktów. [Przebieg weryfikacyjny](https://github.com/Sonislaw/razemgo-app/actions/runs/41248069374) obejmuje również poprawione dane testowe z obowiązkowym składem wyjazdu. Lokalnie migracje sprawdzono w PGlite oraz na rzeczywistym Dev; zakres zmian publicznego schematu dla dwóch poprawek architektury jest pusty.

Pomiary Android/Hermes, pamięci, klawiatury, rzeczywistego Google/push, 200 sesji HTTP oraz próba odtworzenia pełnej kopii pozostają oddzielnym odbiorem. Nie należy utożsamiać ich z przejściem testów przeglądarkowych ani z udaną budową APK.

Wyniki końcowe testów i wdrożenia: [wydanie 1.4.0](RELEASE_1.4.0.md).
