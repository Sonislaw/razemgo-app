# Rekomendacje bez procentów — Dev

## Zachowanie

Ogłoszenia i ekipy otrzymują najwyżej jedną etykietę, opartą na potwierdzonych faktach:

| Kod | Etykieta | Warunek |
| --- | --- | --- |
| `similar_plans` | Podobne plany | Wspólny termin oraz miejscowość lub region; tylko wyjazdy. |
| `shared_interests` | Wspólne zainteresowania | Przynajmniej jedno wspólne zainteresowanie. |
| `similar_children` | Podobny wiek dzieci | Dzieci obu ekip należą do wspólnego przedziału wieku. |

Kolejność w tabeli rozstrzyga wybór etykiety. Dwa pierwsze powody są widoczne na karcie, pełniejsze uzasadnienie w szczegółach. Powody pokazywane w podsumowaniu zastępują odpowiadające im zwykłe tagi. Brak wyróżnienia nie blokuje kontaktu i nie otrzymuje oceny negatywnej ani komunikatu o niewystarczających danych. Sam pojazd, zwierzę lub klimat nie daje etykiety. Powitanie prezentuje „Pomysł na wyjazd”, bez osobistego dopasowania.

Sortowanie ma nazwę „Polecane”. Domyślna kolejność wyjazdów pozostaje chronologiczna według publikacji; domyślna kolejność ekip nadal wykorzystuje wewnętrzny ranking. Reakcje, serca i stan online pozostają odrębne.

## Kontekst i ranking

- Wskazany własny wyjazd jest punktem odniesienia. Wybrane daty i lokalizacja zastępują odpowiadające im kryteria; wyszukiwanie z przycisku „Znajdź towarzystwo” nadal obejmuje region własnego planu.
- Bez wskazanego wyjazdu ręczne kryterium terminu lub miejsca oznacza porównanie do bieżącego wyszukiwania oraz profilu. Nie dopowiadamy brakującego kierunku z innego wyjazdu. Sam niezweryfikowany tekst lokalizacji nie potwierdza wspólnego miejsca.
- Bez ręcznych kryteriów wybieramy najlepszy pojedynczy aktywny, opublikowany, publiczny własny plan; przy remisie źródła wybieramy według ID. Brak własnych planów oznacza profil.
- Ranking porównuje kolejno: zbieżność terminu i kierunku, rzeczywiste pokrywanie terminów przed dopasowaniem w tolerancji, miejscowość przed regionem, dotychczasowy wewnętrzny wynik, publikację i ID. Wewnętrzny klucz ma postać `1000000 * wspólne_plany + 100000 * termin + 10000 * kierunek + wynik`; termin ma wartości 0/1/2, kierunek 0/1/2.
- Same wspólne państwo i klimat nie potwierdzają wspólnego kierunku. Dni przyjazdu i wyjazdu są granicami pobytu: dotknięcie końca jednego i początku drugiego nie jest pokrywaniem terminów. Tolerancja dotyczy wyłącznie wyszukiwania i jest nazwana w uzasadnieniu. Liczba wspólnych nocy nie jest prezentowana.
- Etykiety ekip wykorzystują publiczne fakty, niezależnie od progu kompletności starego wyniku. Ranking ekip porównuje faktyczny rodzaj ekipy, wiek jej dzieci, zainteresowania i sposób podróżowania. Preferencje z usuniętej sekcji „Kogo chcę poznać?” nie biorą udziału w obliczeniach; kryteria wyszukiwania wybiera się w filtrach.

## Kontrakty i wydajność

Migracja `202610310001_recommendations.sql` dodaje sześć odczytów: `search_public_trips_v2`, `get_discovery_trip_v2`, `refresh_public_trip_results_v2`, `list_ranked_public_groups_v2`, `get_public_group_v2`, `refresh_public_group_results_v2`.

V1 zachowuje sygnatury, kształt odpowiedzi i uprawnienia. Migracja `202610310002_remove_profile_preferences.sql` wycofuje preferencje profilu także w starszych odczytach Dev. Nowe karty zwracają `recommendation: {version: 2, label, reasons, context}` bez obiektu `compatibility`. Odpowiedzi JSON są walidowane na granicy repozytorium; teksty wynikają z kontrolowanych kodów. Liczniki wyników wykorzystują dotychczasowe odczyty, ponieważ etykiety nie filtrują kandydatów.

Przejście z Odkrywaj przekazuje do szczegółów `recommendationScope=search`, aby zachować kontekst bieżących filtrów. Start, ogłoszenia w profilu ekipy i bezpośrednie linki używają kontekstu domyślnego; nie przejmują zapamiętanego wyszukiwania i nie zerują filtrów Odkrywaj.

Wyniki są stronicowane po pięć. Domyślne sortowanie ogranicza zbiór przed liczeniem rekomendacji; polecane porządkuje cały uprawniony zbiór. Wspólny kontekst jest pobierany raz. Równoważne zestawy cech dzielą arytmetykę wewnątrz żądania, a pełne uzasadnienia powstają dla zwracanej strony. Nie ma żądania dla każdego kafelka. Kursory rozróżniają wersję, konto, filtry i sortowanie; ranking dodatkowo uwzględnia kontekst porównania. Cache nie przechodzi między kontami.

Odczyty nadal respektują publikację, widoczność, blokady w obu kierunkach, moderację oraz zawieszenia kont. Nowe RPC są dostępne wyłącznie roli `authenticated`, prywatne funkcje nie są dostępne klientowi. Zaktualizowano jawny katalog uprawnień. Migracja nie zapisuje ogłoszeń, nie tworzy powiadomień ani nie wysyła push.

## Weryfikacja

Testy obejmują daty pełne, częściowe i rozłączne, tolerancję, region/kraj, ręczne filtry, kilka własnych planów, brak danych, prywatne preferencje, pięcioelementowe strony, zachowanie V1, listę/szczegóły/odświeżanie, blokady, moderację i anonimowy dostęp. Playwright sprawdza też powrót do miejsca na liście, etykiety przy małym ekranie, możliwość kontaktu bez wyróżnienia i brak procentów w dostępności.

Przeszły: pełny zestaw 522 testów Node/PGlite, 62 dotychczasowe scenariusze Playwright i cztery nowe scenariusze rekomendacji. Po rozdzieleniu kontekstu szczegółów ponowiono 19 odpowiednich regresji nawigacji, list, ulubionych i reakcji oraz cztery nowe scenariusze. Przeszły również lint bez ostrzeżeń, TypeScript, kontrola granic modułów/sekretów, spójność wersji oraz eksport końcowego kodu Androida i webu. Sprawdzono zrzuty kart przy szerokości 320 px. Metro Dev odpowiada na 8081 jako `RazemGo Dev`, schemat `razemgo-dev`.

31.10.2026 wdrożono wyłącznie Dev (`kswuakzcnoqgovnwejhb`). Transakcyjna kontrola na rzeczywistych danych potwierdziła pięcioelementowe strony, zgodność list i szczegółów, odświeżanie, brak powtórzeń stron i działanie V1. Sześć rzeczywistych endpointów HTTP odrzuciło anonimowe żądania. Preview pozostaje przy poprzednich migracjach i APK.

Typy nowych RPC wyprowadzono z lokalnego katalogu PGlite po wykonaniu migracji. Pełna kontrola generowania przez CLI na lokalnym Supabase wymaga Dockera, niedostępnego na tej maszynie; pozostaje osobną kontrolą CI. Testy komputera nie zastępują sprawdzenia wyglądu na telefonie ani testu obciążenia 200 sesji.

## Wycofanie preferencji profilu — 31.10.2026

Sekcja „Kogo chcę poznać?” znika z profilu i edytora. Model interfejsu, zapis i odczyt profilu nie zawierają `matching`; start nie pobiera `group_preferences`. Dodawanie i edycja wyjazdu mają dwa kroki: typ i termin oraz miejsce i szczegóły. Widoczność i podgląd znajdują się na końcu drugiego kroku. Formularz nie zbiera preferencji towarzystwa; nowe i edytowane wyjazdy zapisują neutralne wartości starszych pól API, a „Znajdź towarzystwo” nie kopiuje dawnych preferencji do filtrów. Rodzaj ekipy i wiek dzieci wybiera się ręcznie w filtrach.

Migracja `202610310002_remove_profile_preferences.sql` usuwa dotychczasowe wartości z `group_preferences` i neutralizuje zapisy starszych klientów przez trigger. Tabela oraz odpowiedź starego `save_my_profile` pozostają zgodne; nie są źródłem rankingu. Ranking ekip korzysta z rzeczywistych danych, a zoptymalizowany odczyt nadal ogranicza stronę przed budowaniem pełnych kart. Kursor V2 otrzymuje nowy klucz kontekstu. RLS i uprawnienia pozostają bez zmian. Preview nie otrzymuje tej migracji.

Weryfikacja wycofania preferencji: 522 dotychczasowe testy Node/PGlite oraz nowy test migracji przeszły; 24 scenariusze Playwright, lint, TypeScript, kontrola granic modułów i eksporty Android/web również przeszły. Na rzeczywistym Dev potwierdzono 37 migracji, brak niepustych wycofanych preferencji, pięcioelementowe strony list oraz brak uprawnień anonimowych. Metro działa na 8081. Weryfikacja na fizycznym telefonie pozostaje oddzielna.
