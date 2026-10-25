# Stały numer ekipy — Dev

Każdy profil otrzymuje automatycznie publiczny numer, np. **Ekipa #104827**. Nazwy i avatary mogą się powtarzać. Numer jest przypisany do profilu, pozostaje taki sam po edycji nazwy, zmianie avatara, restarcie i logowaniu na innym urządzeniu. Nie stanowi potwierdzenia tożsamości. Nowe pole nie jest dodawane do formularza onboardingu ani edycji profilu.

## Interfejs i wyszukiwanie

Numer jest pod nazwą we wspólnym komponencie własnego i publicznego profilu oraz na kartach Ekip. Jest także przy organizatorze na kartach i w szczegółach wyjazdów, w zaproszeniach, na liście rozmów, w nagłówku rozmowy i jej opcjach bezpieczeństwa. Dane autora w powiadomieniach i na liście reakcji również niosą ten sam numer. Przykładowe profile mają jawnie przypisane fikcyjne numery w danych aplikacji; brak numeru w starszym rekordzie nie generuje zastępczego identyfikatora z UUID.

Filtr „Szukaj po nazwie lub numerze ekipy” korzysta z istniejącego pola `name` w payloadzie. Wpisanie `104827`, `#104827` lub `# 104827` oznacza dokładny numer. Początkowe zera są pomijane. Fragment numeru nie pasuje do dłuższego identyfikatora. Pozostałe zapytania zachowują wyszukiwanie po nazwie z normalizacją polskich znaków; nieprawidłowe zapytanie z `#` daje zero wyników.

Numer podlega wszystkim dotychczasowym filtrom. Nie omija ukrycia profilu, blokad, zawieszeń, „Tylko online”, ulubionych ani pozostałych kryteriów. Licznik obejmuje wszystkie pasujące profile przed stronicowaniem; oba sortowania i starszy endpoint katalogu stosują ten sam warunek. Tak jak dotychczas, własny profil nie trafia do wyników katalogu innych ekip.

## Baza i uprawnienia

Migracja `202610250011_crew_numbers.sql` dodaje `travel_groups.crew_number`: unikalną kolumnę `integer generated always as identity`, zaczynając od 100000. Istniejące profile otrzymują numery podczas migracji. Nowe przydziela baza. Sekwencja może pozostawiać luki, np. przy ponowieniu UPSERT profilu; numer nie jest licznikiem wszystkich kont. Po przekroczeniu sześciu cyfr numer naturalnie się wydłuża.

Klienci mają prawa zapisu wyłącznie do dotychczasowych kolumn profilu. Nie mogą wskazać numeru przez `INSERT ... OVERRIDING SYSTEM VALUE`, aktualizować go ani używać lub przestawiać sekwencji. Trigger dodatkowo blokuje zmianę numeru przez `UPDATE ... SET crew_number=DEFAULT`. JSON przesyłany do `save_my_profile` nie zawiera numeru, a ewentualne podrobione pole jest ignorowane przez dotychczasowy RPC. Usunięcie profilu nie cofa sekwencji i nie udostępnia jego numeru nowemu kontu.

Migracja rozszerza wyłącznie dozwolone projekcje publicznych profili, wyjazdów, kontaktów, powiadomień i reakcji. Nie udostępnia `owner_user_id` ani preferencji dopasowania. Wewnętrzne relacje i nawigacja nadal korzystają z UUID. RLS i zasady widoczności pozostają w mocy. `crewNumber` jest tylko odczytywanym polem modelu UI; adapter i klonowanie profilu zachowują wartość.

## Weryfikacja

- `scripts/crew-numbers-backend.test.mjs`: rzeczywiste migracje PostgreSQL/PGlite, uzupełnienie istniejących ekip, identyczne nazwy, niezmienność numeru, uprawnienia kolumn i sekwencji, dokładne wyszukiwanie, oba sortowania, licznik, stronicowanie, ukrycie, blokady, zawieszenie, projekcje i usunięcie konta.
- `scripts/crew-numbers.test.mjs`: formatowanie, numery z `#` i bez niego, zachowanie adapterów, brak numeru w zapisie oraz łączenie z innymi filtrami.
- `scripts/browser/groups.spec.mjs`: numer we własnym i publicznym profilu, na karcie ekipy, w filtrach z licznikiem i w szczegółach rozmowy; widok 320 px.

25.10.2026 migrację wdrożono wyłącznie do Supabase Dev `kswuakzcnoqgovnwejhb`. Test API Dev na trzech tymczasowych kontach o tych samych nazwach i avatarach potwierdził różne numery, niezmienność po edycji i drugim logowaniu, zgodność projekcji profilu i rozmowy oraz respektowanie ukrycia i blokad. Konta kontrolne usunięto; nie rejestrowano urządzeń ani nie wysyłano fizycznych push. Preview nie było zmieniane. W aplikacji Dev wystarcza pełne przeładowanie JavaScript, aby ponownie pobrać profil z numerem.

Przeszły lint, TypeScript, 354 testy Node oraz 16 testów przeglądarkowych katalogu, rozmów i reakcji (nowy test wyszukiwania ponowiono po poprawieniu selektora przycisku filtrów). Sprawdzono także rzeczywisty bundle Androida Dev z nowymi numerami i właściwym backendem. Wygląd numerów oraz opcje rozmowy sprawdzono przy szerokości 320 px; testy na komputerze nie zastępują ręcznej kontroli na telefonie.
