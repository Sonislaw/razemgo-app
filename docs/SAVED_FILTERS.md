# Zapisane filtry — Dev, 3.11.2026

W Odkrywaj są osobne katalogi dla wyjazdów (`trips`) i ekip (`groups`).
Przy wynikach jest „Zapisane · N”. W filtrach dolny wiersz to „Wyczyść”
i „Zapisz zestaw”; pod nim pozostaje „Pokaż wyniki · N”. Zapis nowego zestawu
lub świadome zastąpienie istniejącego stosuje kryteria. Błędy pozostawiają
formularz do ponowienia. Menu zestawu pozwala zmienić nazwę i potwierdzić usunięcie.

Limit wynosi 10 zapisów na rodzaj; nazwa ma 1–40 znaków Unicode po normalizacji
białych znaków. Jest unikalna w rodzaju bez rozróżniania wielkości liter.
Lista jest alfabetyczna. Wczytanie zawsze rozpoczyna pobieranie wyników od początku.
Zapis obejmuje bieżące kryteria, a nie wyniki. Daty i tolerancja są dokładną kopią.
Nie przechowujemy powiązania z własnym wyjazdem. Miniony termin ma informację
i możliwość edycji; nie jest usuwany ani przesuwany.

Katalog synchronizuje się na koncie; nie zmienia aktywnego wyszukiwania.
Wylogowanie czyści stan lokalny. Ponowne logowanie odświeża katalog bez stosowania
zestawu. Ręczne zastosowanie/wyczyszczenie filtrów usuwa nazwę aktywnego zestawu.
Usunięcie zestawu lub zmiana jego kryteriów na drugim urządzeniu pozostawia
będącą w użyciu kopię kryteriów, usuwając oznaczenie zestawu. Zmiana nazwy
odświeża samą etykietę. Funkcja nie zmienia profilu ani powiadomień.

## Dane i uprawnienia

Migracja `202611030001_saved_filter_sets.sql` dodaje prywatną tabelę
`discovery_private.saved_filter_sets` z RLS i bez bezpośredniego dostępu klienta.
RPC `list_my_filter_sets`, `save_my_filter_set` i `delete_my_filter_set` sprawdzają
aktywną sesję i profil. Właściciel pochodzi z konta, a nie z argumentów klienta.
Zapis blokuje wiersz właściciela, egzekwując limit atomowo; indeks wymusza unikalność
nazw. Identyfikator klienta jest stały przy ponowieniu. Identyczny zapis nie
generuje kolejnej zmiany synchronizacji. Ostatni poprawny zapis wygrywa.
`filter_payload: null` oznacza zmianę samej nazwy i zachowuje kryteria serwera.

Format ma `schema_version: 1`. Walidacja wykorzystuje obecne walidatory
wyszukiwania i odrzuca obce klucze, nieznane wartości oraz duplikaty.
Klient waliduje również odpowiedzi, zanim zastąpi katalog lub uruchomi wyszukiwanie.
Zmiany aktualizują tylko domenę `saved_filters` i istniejący sygnał konta
`mailbox_updates`. Przy usunięciu konta zapisy są usuwane kaskadowo.

## Zakres wdrożenia i testy

Migracja wdrożona na **Dev `kswuakzcnoqgovnwejhb`**, interfejs dostępny przez Metro.
Bez nowych modułów natywnych i bez nowego APK. Preview i Production nie wdrażano.

- `npm run test:saved-filters` — model, kopie kryteriów, błędy, ponawianie,
  izolacja stanu i spóźnione odpowiedzi oraz SQL w PGlite: CRUD, limit, walidacja,
  sesje, uprawnienia dwóch kont, synchronizacja i usuwanie konta.
- `node node_modules/@playwright/test/cli.js test scripts/browser/saved-filters.spec.mjs`
  — interfejs z atrapą API, 320/390 px, pierwsza strona wyników, minione daty,
  dwa urządzenia, przełączanie kont, zastępowanie, błędy i limit.
- `node scripts/check-dev-contracts.mjs` — rzeczywisty Dev: odmowa anonimowego
  dostępu do RPC, w tym trzech nowych operacji.
- `scripts/saved-filters-dev-smoke.sql` — rzeczywisty Dev, tymczasowe konta
  i transakcja z `ROLLBACK`: CRUD, daty, ponawianie, domena synchronizacji
  i izolacja dwóch kont. Uruchamiać wyłącznie przeciw zweryfikowanemu projektowi Dev.
- Regresja wyszukiwania wyjazdów, paginacji ekip i zakresu synchronizacji;
  `npm run lint` i `npm run typecheck`.

Testy interfejsu wykonano w przeglądarce. Fizycznego telefonu nie testowano.
