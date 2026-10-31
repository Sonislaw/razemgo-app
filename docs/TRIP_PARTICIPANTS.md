# Uczestnicy konkretnego wyjazdu — Dev

## Formularz i prezentacja

Dodawanie i edycja wyjazdu zachowują dwa kroki. W drugim kroku sekcja „Kto jedzie?” zawiera obowiązkową liczbę dorosłych (1–20), dzieci (0–20) i przedziały wieku, jeśli jadą dzieci. Kilkoro dzieci może należeć do jednego przedziału; liczba przedziałów nie może przekraczać liczby dzieci. Wybór zera dzieci czyści przedziały.

Nowy wyjazd otrzymuje niezależną kopię bieżącego składu profilu. Można dodać kolejnych uczestników lub zrezygnować z wyjazdu z dziećmi. Zmiana profilu nie zmienia istniejących planów. Znany skład wyjazdu jest zachowywany podczas edycji i duplikowania. Starszy plan bez składu otrzymuje przy edycji wartości profilu do zmiany; do czasu zapisu karty pokazują „Skład wyjazdu do uzupełnienia”. Nie przypisujemy historycznym ogłoszeniom aktualnych danych profilu.

Wspólny komponent kart pokazuje dorosłych, dzieci i ich wiek z wyjazdu. Dotyczy to Start, Odkrywaj, własnych wyjazdów, ogłoszeń ekipy, podglądu formularza i statycznych przykładów powitania. Szczegóły cudzego i własnego wyjazdu mają sekcję „Skład wyjazdu”; dane profilu organizatora nie zastępują uczestników. Sam profil ekipy zachowuje swój skład. Przy zerze dzieci nie pokazujemy tagu „bez dzieci”.

## Baza i kontrakty

Migracja `202610310003_trip_participants.sql` dodaje `trip_plans.adult_count`, `child_count` i `child_age_bands`. Nie zmienia poprzednich migracji ani danych Preview. Istniejące liczniki pozostają NULL, wiek jest pustą tablicą. Migracja `202610310004_trip_participant_guards.sql` doprecyzowuje ochronę bezpośrednich edycji starych rekordów. API mapuje taki rekord na `participants: null`; nie używa profilu jako zastępstwa.

CHECK ogranicza liczniki, dozwolone i unikalne przedziały wieku oraz spójność danych. Publikacja i edycja kompletnego planu wymagają składu także w RPC i bezpośrednich zapisach. Niepełne szkice mogą mieć brak składu albo brak przedziałów wieku; publikacja wymaga uzupełnienia. Stare nieuzupełnione plany mogą pozostać opublikowane i można je wstrzymać; edycja lub ponowna publikacja wymaga składu.

Odczyty list, szczegółów, odświeżenia oraz kopie kontekstu zaproszeń przenoszą skład wyjazdu. RLS, właściciel, uprawnienia RPC, limity zapisów i idempotencja pozostają zachowane. Generowane pola schematu wyprowadzono z katalogu lokalnego PostgreSQL PGlite; pełna kontrola generatorem CLI wymaga lokalnego Supabase/Dockera.

Filtr wieku dzieci w ogłoszeniach używa uczestników danego wyjazdu. Rekomendacje porównują ich wiek z uczestnikami własnego planu, a przy braku własnego planu z profilem oglądającego. Nie podpowiadają wspólnego wieku na podstawie dzieci właściciela, które nie jadą. Ranking ekip nadal porównuje profile. Nie dodajemy żądań dla pojedynczych kart. Zaktualizowano klucze rankingu i kursorów ogłoszeń.

## Weryfikacja

Testy modelu i PostgreSQL obejmują liczebność inną niż w profilu, brak dzieci, wspólne przedziały, walidację, niepełne szkice, zmiany profilu, edycję, duplikaty, stare nieznane składy, filtry, rekomendacje i RLS. Playwright sprawdza utworzenie wyjazdu z czterema dorosłymi bez dzieci, widok drugiego konta, zmianę składu i wieku podczas edycji, filtr oraz niezmieniony profil. Osobny scenariusz potwierdza neutralną prezentację starego ogłoszenia.

Wyniki telefonu raportujemy osobno. Ta zmiana nie wymaga nowego modułu natywnego ani APK; aplikacja Dev ładuje kod z Metro.

31.10.2026: przeszło 530 testów Node/PGlite, 59 pozostałych regresji Playwright i 10 scenariuszy wyjazdów/rekomendacji (w tym dwa nowe dotyczące składu), lint, TypeScript, kontrola granic modułów i eksporty Android/web. Na Supabase Dev potwierdzono 39 migracji i trzy kolumny uczestników; transakcyjna kontrola zapisu, walidacji, duplikowania i ochrony bezpośredniej edycji została wycofana bez pozostawiania danych testowych. Anonimowy zapis jest zabroniony. Preview zachowuje 35 migracji i dotychczasowe dane. Metro Dev działa na 8081. Telefonu nie testowano w ramach tej kontroli.
