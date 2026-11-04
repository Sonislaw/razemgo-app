# Kontekst aplikacji RazemGo

Stan rozpoznania: **3.11.2026**, wersja kodu **1.5.0**, bazowy commit `d5765b2`
z późniejszymi zmianami edycji opisu, stałej dostępności profili ekip i propozycji.
Pierwsze rozpoznanie obejmowało lokalny kod, migracje, konfigurację i dokumentację.
Informacje o wdrożonych APK pochodzą z dokumentacji wydania. Późniejsze zmiany Dev
z 1.11.2026 zweryfikowano również odczytem metadanych hostowanego backendu.
Telefonu nie testowano.

## Produkt i główny przepływ

RazemGo pomaga poznawać inne ekipy podróżujące przyczepą, kamperem, kampervanem,
z namiotem lub samochodem. Obsługuje rodziny, pary, osoby solo i grupy znajomych.
Główną platformą jest Android; wersja webowa jest utrzymywana równolegle.

Typowy przepływ: powitanie → logowanie/rejestracja → profil ekipy → przeglądanie
ogłoszeń lub publikacja wyjazdu → zaproszenie do kontaktu → akceptacja → rozmowa.
Kontakt można rozpocząć z ogłoszenia albo bezpośrednio z profilu ekipy.

| Zakładka | Odpowiedzialność |
| --- | --- |
| Start | „Znajdź ekipę”, „Dodaj wyjazd”, najnowsze dostępne ogłoszenie i dzwonek. |
| Odkrywaj | Dwa widoki: wyjazdy i ekipy, osobne filtry, liczniki oraz ulubione. |
| Wyjazdy | Własne aktywne i archiwalne plany, szkice oraz zarządzanie publikacją. |
| Wiadomości | Rozmowy, otrzymane i wysłane zaproszenia, odczyty oraz bezpieczeństwo kontaktu. |
| Profil | Dane i opis ekipy, edycja oraz ustawienia konta/powiadomień. |

Poza zakładkami są szczegóły cudzego wyjazdu `/trip/[id]`, własnego wyjazdu
`/trips/[id]`, profil innej ekipy `/crew/[id]`, czat `/chat/[id]`, kreator
`/trip-editor`, historia `/notifications` i panel moderacji `/admin`.
Rozróżnienie `/trip` oraz `/trips` jest zamierzone.

## Bieżące reguły produktu

- **Jedno konto zarządza jedną ekipą.** Tożsamość konta Auth i publiczne ID ekipy
  to różne identyfikatory. Profil opisuje ekipę: nazwę, ilustrowany avatar, typ,
  dorosłych, dzieci i ich przedziały wieku, transport, zainteresowania i zwierzęta.
  Nazwa ma 2–20 znaków; numer ekipy służy prezentacji i wyszukiwaniu.
  Nazwy rodzajów ekip są wszędzie w liczbie pojedynczej, również w filtrach:
  „Rodzina z dziećmi”, „Para”, „Osoba solo”, „Grupa znajomych”.
- **„O mojej ekipie” edytuje się w „Mój profil → Edytuj profil → Moja ekipa”**,
  razem z nazwą i avatarem. Opis ma limit 600 znaków. Własny profil i ekran
  innej ekipy `/crew/[id]` pokazują pełny opis w osobnej sekcji „O ekipie”
  pod główną kartą. Własna karta pokazuje wszystkie zainteresowania, tak jak
  profil innej ekipy; przycisk „Edytuj profil” jest na dole pod opisem.
  Opis i dane ekipy zapisują się w jednej transakcji.
  Wyjście z edycji zmienionego profilu proponuje zapis, odrzucenie zmian lub
  kontynuację. Ochrona obejmuje nawigację wstecz i ostrzeżenie przeglądarki
  przed przeładowaniem; nieudany zapis pozostawia formularz do poprawy.
- **Własny profil i profil innej ekipy mają akwarelowe tło dobrane do avatara.**
  Każde z 10 zwierząt ma własny krajobraz; zmiana zapisanego avatara zmienia
  również ilustrację. Większy avatar w białej ramce nachodzi na kartę danych ekipy.
  Styl odpowiada grafikom wyjazdów. W tle nie ma pojazdów, namiotów ani
  wyposażenia kempingowego. Ilustracje są
  lokalnymi plikami WebP. Mapowanie nie wymaga migracji ani osobnego wyboru tła.
  Lista motywów i prompty są w [dokumentacji grafik](../assets/images/profile-covers/README.md).
- **Wybór transportu ma widoczne podpisy pod ilustracjami** w profilu,
  onboardingu i formularzu wyjazdu. Obrazek oraz podpis są jedną klikalną opcją.
  Wybiera się jeden środek transportu; oznaczenia na kartach pozostają bez zmian.
  Widoczna nazwa „Kampervan” odpowiada dotychczasowej wartości `Van` w danych.
  W edycji profilu opcje rodzaju ekipy, wieku dzieci, zwierząt, transportu
  i zainteresowań mają pojedyncze rzędy przewijane poziomo.
- **Profile ekip są zawsze dostępne dla innych zalogowanych podróżników.**
  Usunięto ekran „Profil publiczny”, przełącznik oraz odnośniki w profilu,
  ustawieniach i Odkrywaj. Dotychczas ukryte ekipy również są dostępne.
  Blokady obu stron i moderacja nadal ograniczają dostęp. Widoczność konkretnego
  wyjazdu pozostaje oddzielną funkcją.
- **Skład wyjazdu jest niezależny od profilu.** Nowy formularz kopiuje skład
  profilu, ale późniejsze zmiany profilu nie zmieniają zapisanych planów. Wyjazd
  ma własne liczby dorosłych/dzieci i wiek dzieci. Stare ogłoszenie bez tych danych
  pokazuje brak składu; nie należy wyliczać go z obecnego profilu organizatora.
- **Dwa tryby wyjazdu:** `planned` („Mam plan”) ze wskazaną miejscowością/wsią
  oraz `flexible` („Szukam pomysłu”) z obszarem poszukiwań. Oba mają konkretne daty.
  Tolerancja dat jest wyłącznie filtrem wyszukiwania. Wyjazd obejmuje co najmniej
  jedną noc, jeden sposób podróżowania i opis długości 20–1000 znaków.
- **Kreator ma dwa kroki:** typ/termin oraz miejsce/szczegóły, w tym uczestnicy,
  widoczność i podgląd. Nagłówek ogłoszenia powstaje z opisu. Szkic może być niepełny.
  Drugi krok jest pogrupowany tematycznie: lokalizacja (miejscowość, opcjonalna
  nazwa i adres kempingu), plan (opis, klimat, zainteresowania), ekipa
  (uczestnicy, zwierzęta i transport) oraz widoczność. Pola opcjonalne są widoczne;
  rozwijany pozostaje wyłącznie podgląd.
  Błędy są przy właściwych polach, a publikacja przewija i przenosi fokus do
  pierwszego błędu. Podgląd używa tej samej karty i szerokości co Odkrywaj,
  z nieaktywnymi akcjami; pełny opis i adres nie są dodawane nad ekipą.
  Statusy zapisu: `draft`, `published`, `paused`, `completed`, `cancelled`;
  widoczność: `public` albo `private`. Prezentacja uwzględnia również upływ terminu.
- **Menu „Zarządzaj wyjazdem” wyróżnia edycję** głównym przyciskiem, a poniżej
  udostępnia wstrzymanie/wznowienie i zwykłą akcję duplikowania. Zakończenie
  oraz anulowanie mają osobną grupę z opisami skutków; usuwanie jest oddzielone
  na dole i oznaczone czerwonym tekstem oraz koszem. Potwierdzenia i reguły
  dostępności akcji według statusu wyjazdu pozostają zachowane.
- **Odkrywaj nie ma rankingu ani etykiet dopasowania.** Wyjazdy są od najnowszych
  publikacji, ekipy alfabetycznie. Filtry użytkownika są jawne i nie wynikają
  automatycznie z preferencji profilu. „Znajdź towarzystwo” ustawia termin i region
  własnego wyjazdu. „Znajdź ekipę” na Start zeruje filtry Odkrywaj.
  W filtrach szukania dla wyjazdu sekcja „Rodzaj ekipy” oznacza ręczny wybór
  użytkownika, a nie preferencje zapisane w ogłoszeniu.
  Zdjęcie, tytuł i „Zobacz wyjazd” otwierają te same szczegóły, z zachowaniem
  pozycji listy po powrocie. Serce, reakcje i profil ekipy mają odrębne akcje.
  Wymiary nagłówka oraz wygląd karty wyjazdu pozostają zachowane.
  Pusta lista wyjazdów rozróżnia brak dostępnych ogłoszeń (akcja „Dodaj wyjazd”)
  od braku wyników dla filtrów (akcja „Pokaż wszystkie wyjazdy”). Licznik bez
  filtrów jest sprawdzany dodatkowo tylko przy zerowym wyniku z aktywnymi filtrami;
  błąd tego odczytu nie jest przedstawiany jako pusty katalog.
  Karty w widoku ekip mają akwarelowe tło powiązane z avatarem, takie samo
  jak w szczegółach profilu, faliste przejście do danych i avatar w białej ramce.
  Serce jest osobną akcją w prawym górnym rogu ilustracji, w rozmiarze używanym
  na karcie wyjazdu. Ikona transportu jest na dole obok „Profil”, pozostawiając
  miejsce na nazwę ekipy. Ilustracja oraz treść
  otwierają profil; wybór ulubionych zachowuje pozycję na liście.
  Opis ekipy jest dostępny w szczegółach profilu; karta na liście go nie pokazuje.
- **Udostępnianie w Dev:** ikona na kartach i w szczegółach wyjazdów/ekip otwiera
  „Kopiuj link”. Adresy `razemgo-dev://trip/<id>` i `razemgo-dev://crew/<id>`
  są rozpoznawane w wiadomościach, również w otaczającym je tekście. Własna ekipa
  otwiera Mój profil; właściciel wyjazdu trafia do swoich szczegółów także dla
  wyjazdu spoza pobranych stron listy. Odbiorca otwiera zwykłe szczegóły z obecną
  kontrolą dostępności. Funkcja jest wyłączona w Preview. Kopiowanie wymaga
  modułu `expo-clipboard` w nowej paczce Dev; nie konfiguruje domeny ani Production.
  APK Dev 1.5.0 (5) jest gotowy; [instalacja i weryfikacja](DEV_SHARING.md).
- **Główne listy wyjazdów i ekip pobierają po pięć elementów.** Kolejna porcja
  wymaga przycisku; listy są wirtualizowane i zachowują miejsce po powrocie ze
  szczegółów. Skrzynka ma porcje po 20, historia rozmowy po 50 wiadomości.
  Przy filtrach Odkrywaj (wyjazdy i ekipy) oraz Moich wyjazdów nie ma przycisku
  ręcznego odświeżania. Automatyczne odświeżanie, reset filtrów i ponowienie
  po błędzie pozostają dostępne.
- **Zapisane filtry w Odkrywaj:** oddzielne nazwane zestawy dla wyjazdów i ekip,
  po 10 na zakładkę. Przycisk „Zapisane · N” jest przy liczbie wyników, a „Zapisz
  zestaw” w stopce filtrów obok „Wyczyść”. Nazwy mają 1–40 znaków i są unikalne
  bez rozróżniania wielkości liter w danej zakładce. Można wczytać, zastąpić,
  zmienić nazwę i usunąć zestaw. Zapis stosuje kryteria i zamyka formularz;
  nieudany zapis zachowuje go do ponowienia z tym samym identyfikatorem.
  Katalog jest prywatny dla konta i synchronizowany domeną `saved_filters`.
  Wczytanie zaczyna wyniki od pierwszej strony, także dla identycznych kryteriów.
  Synchronizacja katalogu nie zmienia aktywnego wyszukiwania, a ponowne logowanie
  nie wczytuje automatycznie ostatnich filtrów. Ręczna zmiana/reset usuwa etykietę
  zestawu, usunięcie zapisu pozostawia kryteria. Kryteria własnego wyjazdu są
  niezależną kopią bez `sourceTripId`; daty i tolerancja pozostają dokładne.
  Miniony termin ma informację i akcję „Edytuj”, bez przesuwania dat.
  Migracja `202611030001_saved_filter_sets.sql` wdrożona na Dev; Preview
  i Production nie wdrażano. Szczegóły i weryfikacja: [SAVED_FILTERS.md](SAVED_FILTERS.md).
- **Alerty zapisanych filtrów wyjazdów** są opcjonalne, domyślnie wyłączone
  przy każdym zestawie. Pierwsze nowe publiczne publikacje, pasujące do wszystkich
  kryteriów, tworzą zbiorczy wpis i push w pięciominutowych oknach. Własny wyjazd
  nie jest wymagany. Alert otwiera zestaw w Odkrywaj → Wyjazdy od pierwszej strony.
  Włączenie i zastąpienie kryteriów nie odtwarzają historycznych wyników;
  wyłączenie i usunięcie anulują oczekującą wysyłkę. Nazwa zachowuje obserwację,
  miniony termin uniemożliwia jej włączenie. Globalny push ma osobną kategorię
  „Wyniki zapisanych filtrów”; profile i obecne propozycje pozostają niezależne.
  Migracja `202611030002_saved_filter_notifications.sql` i dispatcher wdrożone
  wyłącznie na Dev. [Zasady i weryfikacja](SAVED_FILTER_ALERTS.md).
- **Akceptacja zaproszenia tworzy rozmowę.** Licznik kontaktów przy wyjeździe
  oznacza zaakceptowane rozmowy; aplikacja nie traktuje go jako listy potwierdzonych
  uczestników. Skład wyjazdu opisuje liczebność, nie imienną listę zapisów.
  Szczegóły cudzego wyjazdu pokazują organizatora przed opisem i mapą.
  Stały dolny pasek udostępnia aktualną akcję kontaktu również po przewinięciu.
- Ulubione ekipy, ulubione wyjazdy, reakcje na ogłoszenia, reakcje na wiadomości
  i obecność online to odrębne mechanizmy. Zwierzęta są zwykłym kryterium;
  nie należy dodawać automatycznego wykluczania ekip z tego powodu.
- Automatyczne **powiadomienia o propozycjach pozostają aktywne**, mimo usunięcia
  rankingu z list. Procesor działa według harmonogramu co minutę, a push propozycji
  jest grupowany w okna pięciominutowe. To osobny przepływ od wyszukiwania V3.
  Migracja `202611010003_proposal_criteria.sql` z 1.11.2026 usuwa dawne preferencje
  rodzaju ekipy i wieku dzieci z `proposal_matches`. Kryteriami są nakładający się
  termin i kierunek/region; obowiązują aktualność, publiczna widoczność, blokady
  i moderacja obu stron. Stare wartości w ogłoszeniach nie ograniczają propozycji.
  Opis ustawienia push odpowiada tej regule. Migracja zachowuje historię i stan
  wysyłek; nie odtwarza starych alertów ani nie zleca masowego przeliczenia.

## Architektura i miejsca w kodzie

Stos z `package.json`: Expo SDK 58, React Native 0.88.1, React 19.3,
TypeScript 6, Expo Router i Supabase JS. Budowanie Androida odbywa się przez EAS.
Nie ma utrzymywanych ręcznie katalogów `android/` i `ios/`; konfiguracja natywna
pochodzi z `app.json`, `app.config.js` i pluginów Expo.

Główny podział odpowiedzialności:

`ekran → hook / kontroler / magazyn → repozytorium / mapper → backendRequest → Supabase RPC / RLS`.

| Miejsce | Co tam znaleźć |
| --- | --- |
| [`src/app/`](../src/app/) | Ekrany i routing. [`_layout.tsx`](../src/app/_layout.tsx) składa providery i bramki dostępu. |
| [`src/features/`](../src/features/) | Moduły domenowe: auth, profile, trips, discovery, groups, messaging, notifications, presence, favorites, reactions, moderation, animals, home i welcome. |
| [`src/types/`](../src/types/) | Modele interfejsu, m.in. `TravelGroup`, `TripPlan`, `TripParticipants`, `OwnedTrip`, `MessagingState`. |
| [`src/data/contracts/`](../src/data/contracts/) | Kształty JSON RPC i walidatory odpowiedzi na granicy backendu. |
| [`database.generated.ts`](../src/types/database.generated.ts) | Schemat generowany z lokalnego Supabase; nie zastępuje walidacji JSON. |
| [`src/lib/`](../src/lib/) | Klient Supabase, cykl żądań, synchronizacja, paginacja, magazyny, daty, sesja i monitoring. |
| [`src/components/`](../src/components/) | Wspólne UI, karty, mapy i oś czasu; warianty `.web.tsx` dla różnic platform. |
| [`supabase/migrations/`](../supabase/migrations/) | Historia bazy i końcowe definicje RPC. Obecnie 47 migracji; najnowsza to `202611030002_saved_filter_notifications.sql`. |
| [`supabase/functions/`](../supabase/functions/) | Edge Functions: `delete-account`, `dispatch-push`, `monitor-push`. |
| [`scripts/`](../scripts/) | Testy Node/PGlite i Playwright, kontrole, generatory, diagnostyka, benchmarki i wdrażanie środowisk. |

`RootLayout` odtwarza sesję, sprawdza dostęp/moderację i ładuje profil. Nowe konto
bez profilu trafia do onboardingu. Dopiero gotowe konto uzyskuje dostęp do głównych
tras. Logowanie obejmuje e-mail/hasło, potwierdzenie adresu, Google przez PKCE,
odzyskiwanie hasła, wylogowanie i usunięcie konta. Sesja natywna korzysta
z dzielonego na fragmenty SecureStore, webowa z localStorage.

Stan aplikacji opiera się na React Context, reducerach oraz własnych magazynach
z selektorami. Providery danych konta są montowane ponownie po zmianie użytkownika.
[`request-lifecycle.ts`](../src/lib/request-lifecycle.ts) chroni przed przyjęciem
odpowiedzi poprzedniego konta. [`backendRequest`](../src/lib/backend-request.ts)
dodaje anulowanie, domyślny limit 20 s i monitoring; ponawianie odczytów jest jawne.
Zapisy nie są automatycznie ponawiane przez transport. Tworzenie wyjazdu,
zaproszenia i wysyłka wiadomości korzystają z kluczy idempotencji.

[`AccountSyncProvider`](../src/features/auth/account-sync-context.tsx) łączy Realtime,
powrót aplikacji i kontrolny odczyt co 20 s. Realtime przekazuje sygnał
`mailbox_updates`, a dane pobierane są osobno. `get_my_sync_state()` zwraca
rewizje domen `mailbox`, `notifications`, `favorites`, `trips`, `saved_filters`; koordynator odświeża
zmienione domeny i ponawia nieudane odczyty. Obecność i kontrola dostępu mają
odrębne zadania. Obserwacje reakcji/obecności zależą od fokusu ekranu.

[`createPagedResource`](../src/lib/paged-resource.ts) obsługuje kursor, doładowanie,
retry, deduplikację i uzgadnianie list po zmianie wyników. Pole `result_revision`
opisuje zbiór dostępnych ID i kolejność. Nie jest uprawnieniem ani rewizją treści
rekordu; znane elementy są odświeżane osobno. Cache encji własnych wyjazdów jest
ograniczony do 100 i przypina najnowsze aktywne ogłoszenie; nie obcina wczytanych list.

Listy automatycznie pobierają następną stronę po zbliżeniu do końca. Wspólny
[`useAutoPagination`](../src/hooks/use-auto-pagination.ts) obsługuje listy ekranów,
panele mapy i reakcji, powiadomienia, moderację oraz przewijanie czatu ku starszym
wiadomościom. Podczas pobierania widoczny jest komunikat ze wskaźnikiem. Błąd
zachowuje wczytane treści i wymaga ręcznego ponowienia; nie uruchamia pętli żądań.

UI korzysta ze wspólnych tokenów w [`theme.ts`](../src/constants/theme.ts), lokalnych
ilustracji i obszaru treści do 600 px. Bieżący hook wymusza jasny motyw, mimo
istnienia palety ciemnej. Miejscowości są wyszukiwane lokalnie w odroczonym słowniku.
Mapa używa osadzenia Google w WebView/iframe oraz linku do pełnej mapy;
nie pobiera lokalizacji urządzenia i nie jest integracją Places/Geocoding.

## Backend, prywatność i zgodność

Główne encje to `travel_groups`, `group_public_profiles`, `trip_plans`,
`contact_invitations`, `conversations`, `chat_messages`, `conversation_reads`,
`group_blocks`, `account_reports`, `notifications`, `notification_preferences`
i `push_devices`. Funkcje wewnętrzne oraz kolejki są rozdzielone między prywatne
schematy domenowe. Nowa `messaging_private.sync_revisions` przechowuje liczniki zmian.

- Właściciel wynika z `auth.uid()`, a prywatne dane chronią RLS i granty.
  Zapisy domenowe przechodzą przez RPC. Wybrane odczyty własnych danych używają
  tabel chronionych RLS; cudze dane są udostępniane osobnymi projekcjami RPC.
- „Publiczne” ogłoszenie/profil oznacza dostępność dla uprawnionych zalogowanych
  kont, nie anonimowy odczyt całej tabeli. Widoczność wyjazdów, blokady w obu kierunkach,
  zawieszenia i ukrycie przez moderację są sprawdzane na serwerze.
- Aktualne odczyty discovery mają sufiks **V3**: `search_public_trips_v3`,
  `get_discovery_trip_v3`, `refresh_public_trip_results_v3`, `list_public_groups_v3`,
  `get_public_group_v3`, `refresh_public_group_results_v3`. Liczniki korzystają
  z `count_public_trips` i `count_public_groups`.
- V1/V2, `group_preferences` i dawne pola porównania pozostają dla zgodności
  starszych kontraktów. Proces propozycji je ignoruje; bieżący model UI nie ma `matching`.
  Nie usuwać tych elementów na podstawie samego braku użycia przez aktualny ekran.
- Kolumna `group_public_profiles.discoverable` jest stale prawdziwa i chroniona
  ograniczeniem bazy. Stare RPC widoczności pozostały dla zainstalowanych klientów
  i wewnętrznego zapisu opisu, ale ignorują żądanie ukrycia i zwracają `true`.
  W bieżącym kliencie nie ma ich wywołań ani modelu ustawień widoczności.
- Uczestnicy są obowiązkowi przy publikowaniu i edycji treści; starsze APK bez
  formularza składu wymagają aktualizacji. Odczyt starych ogłoszeń oraz operacje
  wstrzymania i archiwizacji mają zachowaną obsługę.
- Push ma kolejkę, dzierżawy, retry, receipts i osobny monitor zdrowia.
  Trwała historia powiadomień istnieje niezależnie od zgody telefonu na push.
  Odczyt powiadomienia i odczyt czatu mają odrębną semantykę.
- Sentry aplikacji i backendu filtruje dane według wspólnej polityki
  [`shared/monitoring-policy.ts`](../shared/monitoring-policy.ts). Natywne raporty
  awarii są celowo wyłączone; obecny filtr działa dla raportów JavaScript.

## Środowiska i zasady dalszej pracy

**Ustalenie z użytkownikiem — 1.11.2026:** docelowo utrzymujemy trzy warianty
tej samej aplikacji z jednego repozytorium: **Dev** do rozwoju, **Preview** do
testów przed wydaniem i **Production** dla użytkowników Google Play. Production
będzie mieć oddzielny backend i rzeczywiste dane użytkowników. Obecnie pozostaje
planowane; użytkownik wyraźnie polecił **jeszcze nie budować Production**.
Przygotowanie tego środowiska i wydania pozostaje na późniejszy etap.

Obecnie skonfigurowane są dwa środowiska:

Po przeniesieniu edycji opisu, wycofaniu wyboru widoczności i poprawce propozycji
1.11.2026 Dev ma 45 migracji. Preview pozostaje przy 42 i wydaniu 1.4.0; trzy nowe migracje trzeba
uwzględnić przy przyszłej promocji.

| | Dev | Preview |
| --- | --- | --- |
| Pakiet Androida | `pl.razemgo.app.development` | `pl.razemgo.app.dev` |
| Schemat linków | `razemgo-dev` | `razemgo` |
| Supabase ref | `kswuakzcnoqgovnwejhb` | `tueqqnbdvuazdxoqtpvk` |
| Konfiguracja lokalna | `.env.local` | `.env.preview.local` |
| Działanie standardowego APK | Development Client + Metro | Samodzielny APK |

Zwykła praca odbywa się na **Dev**. Preview wymaga wyraźnego zlecenia publikacji.
Konta i dane są rozdzielone, chociaż kod i projekt EAS są wspólne. Profil
`performance` buduje samodzielny release z backendem Dev. Profil produkcyjny
jest blokowany przez resolver wariantów, mimo wpisu w `eas.json`.

Konfigurację wariantów rozstrzygają [`app.config.js`](../app.config.js) i
[`app-variants.cjs`](../config/app-variants.cjs); sam `app.json` nie opisuje
końcowego Dev. Skrypty kontrolują izolację backendów. Dane w `EXPO_PUBLIC_*`
muszą być publiczne; plików lokalnych i sekretów nie należy kopiować do kontekstu.

Podstawowy start: `npm ci`, `npm run check:dev`, `npm run start:dev`; web:
`npm run web`. Lokalny podgląd `npm run start:demo` jest oddzielony od danych
prawdziwych kont i niedostępny w release. Powitanie ma stałe przykładowe ogłoszenia.

Zmiany bazy dodaje się nową migracją, bez przerabiania historii. Wdrożenia mają
jawne środowisko: `backend:dev` albo `backend:preview`. Zwykła edycja nie podnosi
wersji wydania. Przy wydaniu skrypty `version:patch/minor/major` synchronizują trzy
pliki; `version:check` sprawdza zgodność. Zmiana modułów natywnych wymaga nowego APK.
Przed pisaniem zmian dotyczących API Expo/RN należy przeczytać dokumentację wersji
SDK 58, zgodnie z [`AGENTS.md`](../AGENTS.md).

## Kontrole i wiarygodność dokumentacji

W pierwszym rozpoznaniu przeszły `npm run lint`, `npm run typecheck`,
`npm run check:source` i `npm run version:check`. Sprawdzono też wszystkie
27 lokalnych odnośników w tym dokumencie.
Pierwsze rozpoznanie obejmowało wyłącznie dokument kontekstu, bez pełnej regresji,
buildów, migracji, pomiarów obciążenia i testów na usługach zdalnych. Późniejsza
zmiana opisu ekipy obejmuje kod oraz migrację wdrożoną na Dev; 555 testów
Node/PGlite potwierdziło również atomowy zapis, zachowanie widoczności i stare RPC.
Przeszło 16 scenariuszy przeglądarkowych kont i ekip, a po końcowym uproszczeniu
odczytu ponownie dwa scenariusze profilu i opisu. Końcowe lint, TypeScript oraz
kontrola granic źródeł przeszły; odczyt metadanych Dev potwierdził nową funkcję
zapisu i brak anonimowych uprawnień do obu operacji. Nie testowano telefonu.

Po wycofaniu wyboru widoczności przeszło 561/561 testów Node/PGlite oraz 18/18
scenariuszy przeglądarkowych kont, ekip i ustawień. Lint, TypeScript i kontrola
granic źródeł przeszły. Odczyt metadanych Dev potwierdził 44 migracje, zero ukrytych
profili, aktywne ograniczenie stałej dostępności i brak anonimowych uprawnień do
starych RPC. Testy sprawdzają zachowanie opisów, nowych kont i starszych klientów
oraz działanie zaproszeń, ulubionych, reakcji, obecności, blokad i moderacji.

Po poprawce kryteriów propozycji przeszło 583/583 testy Node/PGlite, w tym
scenariusze migracji zachowującej historię, deduplikacji, grupowania i ignorowania
starych preferencji. Przeszły dwa scenariusze przeglądarkowe powiadomień, lint,
TypeScript i kontrola granic źródeł. Odczyt metadanych Dev potwierdził 45 migracji,
nowy matcher, usunięcie wyzwalacza zmian składu profilu oraz brak uprawnień
zwykłego klienta do procesora i prywatnego matchera. Dawne wartości w 179 ze 180
aktywnych publicznych wyjazdów zachowano; nie wpływają na propozycje.

Ujednolicenie podglądu kreatora z kartą Odkrywaj zweryfikowano w 10 scenariuszach
przeglądarkowych wyjazdów, uczestników i reakcji, w tym porównaniem podglądu
z opublikowaną kartą na innym koncie. Lint, TypeScript i kontrola granic źródeł
przeszły. Zmiana wymaga odświeżenia Dev, bez migracji i nowego APK.

Pierwsze trzy poprawki z [analizy UX/UI](UX_UI_AUDIT_2026_11_01.md) obejmują
stały kontakt, ochronę profilu i uproszczenie formularza opisane powyżej.
Przeszło 583/583 testy Node/PGlite, 12/12 scenariuszy przeglądarkowych, lint,
TypeScript i kontrola granic źródeł. Sprawdzono także błędy zapisu i fokusu,
cofanie historii oraz zachowanie danych zwiniętych sekcji. Szczegóły i zakres
kontroli są w [raporcie zmian](UX_FIRST_IMPROVEMENTS_2026_11_01.md).

Repozytorium ma testy Node/PGlite rzeczywistych migracji i uprawnień, Playwright
z kontrolowanym API oraz testy Edge Functions. CI sprawdza również eksporty,
lokalny Supabase Auth/PostgREST i zgodność generowanych typów. Playwright używa
osobnego Metro na 8085. Weryfikacja telefonu obejmuje osobno Google, linki,
klawiaturę, przewijanie, pamięć i dostarczanie/otwieranie push.

Dokumentacja jest częściowo chronologiczna. Dla aktualnego stanu czytać najpierw:

1. [`README.md`](../README.md), [`RELEASE_1.4.0.md`](RELEASE_1.4.0.md) i
   [`ENVIRONMENTS.md`](ENVIRONMENTS.md) — stan wydania i rozdzielenie środowisk.
2. [`ARCHITECTURE_FIXES_2026_10_31.md`](ARCHITECTURE_FIXES_2026_10_31.md) — wdrożone
   poprawki list, synchronizacji, pamięci i granic modułów.
3. [`UNRANKED_DISCOVERY.md`](UNRANKED_DISCOVERY.md),
   [`TRIP_PARTICIPANTS.md`](TRIP_PARTICIPANTS.md) i
   [`API_COMPATIBILITY.md`](API_COMPATIBILITY.md) — bieżące reguły oraz starsze API.

Starsze sekcje `supabase/README.md`, raport przeglądu architektury i dokumenty
rankingu zawierają opisy wcześniejszego stanu. Zgłoszone tam błędy paginacji,
wspólnego odświeżania domen i wyścigu testu retry czatu zostały objęte poprawkami
1.4.0. Wzmianki „tylko Dev” i liczby migracji w starszych raportach są historyczne:
według wydania 1.4.0 oba backendy otrzymały 42 migracje.

Pozostające ograniczenia odbioru, zgodnie z ostatnim raportem wydania: pomiary
Android/Hermes i telefonu, pełne raportowanie awarii natywnych, próba odtworzenia
kopii oraz test 200 sesji HTTP aktualnych odczytów V3. Wyniki dawnych benchmarków
rankingu nie potwierdzają wydajności bieżącej wersji. Nie traktować historycznych
wyników CI i audytu zależności jako nowej weryfikacji z dnia tego przeglądu.
