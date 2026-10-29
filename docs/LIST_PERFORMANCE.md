# Wydajność list

`CollectionScreen` zastępuje pionowy `ScrollView` z pełną tablicą kart jedną listą `FlatList`. Jest używany w Odkrywaj → Wyjazdy, Odkrywaj → Ekipy, ogłoszeniach profilu ekipy oraz Moich wyjazdach. Zachowuje pełną szerokość ilustracji nagłówka i stopki oraz dotychczasowe marginesy kart. Lista nie jest zagnieżdżona w drugim pionowym scrollerze.

## Okno renderowania i nawigacja

- Pierwsze 5 kart jest renderowanych od razu. Okno obejmuje 5 wysokości ekranu, a dalsze karty są montowane w partiach po 4. Natywne przycinanie widoków jest wyłączone; ograniczenie liczby komponentów realizuje sama wirtualizacja.
- Liczba pobranych rekordów pozostaje niezależna od liczby wyrenderowanych kart. Odkrywaj i profil ekipy nadal pobierają po 5 z bazy. Wirtualizacja nie uruchamia automatycznego pobierania następnych stron.
- **Moje wyjazdy na Dev:** aktywne i archiwalne są pobierane po 5 przez istniejące `list_my_trip_page`. Kolejną porcję pobiera wyłącznie kliknięcie „Pokaż więcej wyjazdów”, analogicznie do Odkrywaj. Podczas pobierania przycisk jest zablokowany, pokazuje „Wczytywanie ogłoszeń” i kręciołek. Samo przewinięcie niczego nie pobiera. Błąd zachowuje poprzednie karty i umożliwia ponowienie. Liczniki oraz filtry dotyczą całego zbioru; powrót ze szczegółów zachowuje wczytane strony i pozycję. Zmiana filtrów lub aktywne/archiwum zaczyna od pierwszej porcji. Zmiana z 29.10.2026 obejmuje wyłącznie kod Dev i nie wymaga migracji ani nowego APK; Preview 1.3.0 zachowuje dotychczasowe zachowanie.
- Ulubione, reakcje i obecność korzystają z dotychczasowych wspólnych magazynów. Odmontowanie karty nie usuwa zapisanej reakcji ani serduszka.
- Wyzerowanie wyników przy nowym zapytaniu resetuje przewinięcie. Powrót ze szczegółów zachowuje dane, zmierzone karty i pozycję. Odświeżanie istniejących kart nie wstawia nad listą wskaźnika ładowania zmieniającego wysokość nagłówka.
- Obrazy krajobrazów i avatarów mają jawny cache pamięci i dysku, włączone zmniejszanie przy dekodowaniu, klucze zgodne z zawartością i brak powtarzanej animacji przy montowaniu. Wymiary wynikają z istniejących stylów, więc oczekiwanie na obraz albo błąd obrazu nie zmienia wysokości karty.

## Weryfikacja

Zmiana stronicowania Moich wyjazdów na Dev z 29.10.2026: przeszły lint, TypeScript, **513 testów Node/PGlite** oraz **9 wybranych scenariuszy Playwright**. Nowe przypadki sprawdzają aktywne i archiwalne strony 5+5+3, wskaźnik ładowania, retry bez utraty kart, pełne liczniki, filtrowanie poza pierwszą stroną i powrót do pozycji po szczegółach. Regresja objęła również 50 własnych wyjazdów, izolację kont i cały cykl zapisu/edycji/usuwania. Kontrola bundla Androida potwierdziła działający Metro i konfigurację Dev; nie wykonano testu na fizycznym telefonie.

Po zamianie automatycznego doładowania na przycisk ponownie przeszły lint, TypeScript i **6 scenariuszy Playwright**. W aktywnych i archiwalnych sprawdzono, że samo przewinięcie do końca zachowuje pięć rekordów i nie wysyła żądania następnej strony; kliknięcie pobiera kolejne pięć, blokuje przycisk i pokazuje kręciołek. Pozostały poprawne retry, powrót do pozycji, pełne filtry i test listy z 50 własnymi wyjazdami.

Scenariusze `scripts/browser/collection-performance.spec.mjs` używają po 50 rekordów. Sprawdzają odmontowanie odległych kart, ponowne pokazanie ulubionej karty, powrót do ostatniego ogłoszenia, zagnieżdżoną nawigację ekipa → wyjazd → ekipa → Odkrywaj, reset po zmianie zakładki, izolację kont i ponowienie nieudanej strony. Osobna próba celowo zatrzymuje i przerywa pobieranie obrazów, mierząc wysokość karty na szerokości 320 px.

Końcowa próba przeglądarkowa z 50 wczytanymi rekordami, po przewinięciu na koniec, wykazała 10 zamontowanych kart wyjazdów w Odkrywaj, 13 kart ekip, 10 ogłoszeń w profilu i 10 własnych wyjazdów. Po powrocie do początku listy wyjazdów pozostawało 5 kart. Liczba zależy od wysokości kart i aktualnego okna. Są to pomiary liczby komponentów w przeglądarce, nie pomiary RAM ani FPS telefonu. Raporty i zrzuty są w ignorowanym `.expo/collection-*.local.json` oraz `.expo/collection-card-320.png`.

Przeszły lint, TypeScript, 391 testów Node i scenariusze przeglądarkowe dotyczące stronicowania, filtrów, nawigacji, kontaktów, ulubionych, reakcji oraz zapisu własnych wyjazdów. Końcowy przebieg ośmiu scenariuszy sprawdził także 50 rekordów i celowo nieudane pobieranie zdjęć. Eksport Androida zakończył się poprawnie; Metro zgłasza istniejące ostrzeżenie pakietu `expo-router` o zastępczym sposobie rozwiązywania `router-store`.

Zmiana nie dodaje zależności, konfiguracji natywnej ani migracji. Wystarczy odświeżyć RazemGo Dev. Dla testerów jest częścią [Preview 1.2.0](RELEASE_1.2.0.md), instalowanego jako nowy APK. Płynność na fizycznym Androidzie wymaga osobnej kontroli na urządzeniu.
