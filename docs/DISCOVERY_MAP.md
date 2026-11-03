# Mapa wyjazdów — pierwsza wersja

Wdrożenie: **Dev `kswuakzcnoqgovnwejhb`**, 3 listopada 2026.
Preview i Production pozostają bez wdrożenia.

## Obsługa

W **Odkrywaj → Wyjazdy** obok filtrów znajduje się **Mapa**.
Powrót przez **Lista** zachowuje wczytane strony i pozycję przewijania.
Mapa zachowuje swój widok w ramach sesji konta oraz przy powrocie ze szczegółów.
Wejście na mapę ustawia bieżący typ ogłoszenia na **Mam plan**. W filtrach mapy
ten wybór jest zaznaczony i zablokowany. „Wyczyść” resetuje pozostałe kryteria;
wczytanie zapisanego zestawu również zachowuje „Mam plan”, bez zmiany zapisu
ani jego powiadomień. Nazwa zestawu jest wyświetlana tylko przy zgodności kryteriów.
Po powrocie na listę „Mam plan” pozostaje zaznaczone, a typ znów można zmieniać.
Link do zestawu lub alert zapisanych filtrów otwiera listę z dokładnymi kryteriami
tego zestawu, zamykając wcześniej otwartą mapę.

- „Mam plan”: punkt miejscowości, z wyraźną informacją o przybliżeniu
  w podglądzie. Nie wskazujemy bramy kempingu ani miejsca postoju.
- Pobliskie punkty są grupowane z liczbą wyjazdów. Kliknięcie przybliża mapę;
  przy wspólnej lokalizacji i kilku wynikach otwiera stronicowaną listę do wyboru.
  Pojedynczy wynik otwiera od razu podgląd na mapie. Pobieranie i błędy są
  pokazywane na mapie; panel listy powstaje dopiero po potwierdzeniu wielu wyników.
- Podgląd pokazuje ilustrację, tytuł, termin, miejscowość lub obszar,
  organizatora, skład uczestników i ulubione; przycisk otwiera zwykłe szczegóły.
- Przesunięcie, przybliżenie lub oddalenie mapy automatycznie odświeża wyniki
  po 450 ms od zakończenia ruchu. Kolejne ruchy w tym czasie przesuwają odświeżenie,
  tak aby pobrać tylko ostatni oglądany obszar. Nie trzeba naciskać przycisku.
  Dotychczasowe punkty pozostają widoczne podczas pobierania. Kliknięcie grupy
  przybliża ją i pobiera punkty od razu.
- Filtry i nazwane zestawy działają tak samo jak na liście. Widok mapy
  jest dodatkowym zakresem bieżącego wyszukiwania, nie częścią zapisanego zestawu.
  Nie zmienia kryteriów powiadomień.

Brak współrzędnych pozostawia wyjazd na liście; mapa pokazuje ich liczbę.
Funkcja nie wymaga GPS. Obejmuje aktualne wyjazdy; nie dodaje typu jednodniowych
spotkań ani mapy ekip. „Szukam pomysłu” pozostaje dostępne na liście wyjazdów.
Lokalny tryb demo zachowuje listę bez przycisku mapy.

## Dane i bezpieczeństwo

Migracje `202611030003_discovery_map_locations.sql`,
`202611030004_discovery_map.sql`, `202611030005_discovery_map_flexible_areas.sql`
i `202611030006_discovery_map_planned_only.sql`
dodają prywatny słownik 44 011 lokalizacji
oraz dwa RPC dla aktywnych zalogowanych kont:

- `search_trip_map`: kompletne liczby i grupy dla obszaru, niezależnie od stron listy;
- `get_trip_map_items`: wyjazdy wybranej grupy lub obszaru, po 5 w interfejsie,
  maksymalnie 10 w RPC. Kursor jest przypisany do konta, filtrów i wyboru.

Wspólny predykat `discovery_private.candidates` zachowuje te same daty,
tolerancję, klimat, skład, zwierzęta, ulubione, blokady, moderację i widoczność
co lista. Wyklucza też własne ogłoszenia. Siatka grupowania jest ograniczona
rozmiarem obszaru i przybliżeniem; nie ucina wyników po arbitralnej liczbie punktów.
Mapa zawsze wymusza `trip_modes: ["planned"]` również w RPC. Ogłoszenie
„Szukam pomysłu” nie jest dostępne przez znacznik, identyfikator ani dawny wybór
obszarów. Prywatny pomocnik obszarów został usunięty migracją 006. Starszy klient
otrzyma puste `areas` i `flexible_count: 0`; nowe komponenty nie obsługują obszarów.

Współrzędne pochodzą z obecnego słownika miejscowości, bez zewnętrznego
geokodowania. Wybór regionu lub kraju w filtrach ustawia początkowy widok mapy
i ogranicza wyszukiwanie gotowych planów.

Żądania są anulowane przy nowszym wyszukiwaniu i opuszczeniu ekranu.
Konto ma własny stan. Powrót na ekran, wznowienie aplikacji i odświeżanie
co 45 sekund aktualizują wyniki. Błąd pobierania nie jest przedstawiany jako zero wyników.

## Podkład mapy

Leaflet **1.9.4**, licencja BSD-2-Clause, jest dołączony lokalnie do dokumentu
WebView oraz `public/razemgo-map.html` dla przeglądarki. Nie pobieramy kodu z CDN.
Istniejący `react-native-webview` nie wymaga nowego APK.

Kafelki: `https://tile.openstreetmap.org/{z}/{x}/{y}.png`, widoczne autorstwo
OpenStreetMap i Leaflet, standardowe buforowanie HTTP, bez pobierania offline
i bez dodatkowego bufora kafelków poza ekranem. Web wysyła Referer własnej strony;
WebView ma identyfikator aplikacji w User-Agent. Korzystanie z podkładu oznacza
zapytania do dostawcy o widoczne kafelki; nie wysyłamy mu profili, tekstów wyjazdów
ani tokenów Supabase. Przed szerszym wydaniem należy ocenić wolumen względem
[polityki serwera kafelków OSM](https://operations.osmfoundation.org/policies/tiles/).

Dokument ma ograniczoną CSP. Most akceptuje wyłącznie znane komunikaty,
współrzędne i identyfikatory grup; web weryfikuje okno, origin i token sesji mapy.
W natywnym dokumencie nie ma tokenów logowania. Linki autorstwa mają zamkniętą listę.

## Generowanie i weryfikacja

```text
node scripts/generate-map-locations.mjs --check
node scripts/generate-map-document.mjs --check
node --test scripts/discovery-map.test.mjs scripts/discovery-map-backend.test.mjs
npx playwright test scripts/browser/discovery-map.spec.mjs scripts/browser/map-render-check.spec.mjs scripts/browser/trip-discovery.spec.mjs
npm run lint
npm run typecheck
```

Po zmianie silnika mapy uruchom generator dokumentu bez `--check`.
Po zmianie słownika lokalizacji aktualizacja wdrożonej bazy wymaga nowej migracji;
nie przepisuj już zastosowanej migracji słownika.

`scripts/discovery-map-dev-smoke.sql` sprawdza na Dev grupowanie, obszary,
paginację, ulubione oraz dwa konta wewnątrz transakcji zakończonej `ROLLBACK`.
Anonimowy dostęp obu RPC kontroluje `scripts/check-dev-contracts.mjs`.
Testy przeglądarkowe używają lokalnych atrap kafelków i backendu; nie obciążają
serwera OSM. Fizyczny telefon wymaga jeszcze ręcznego sprawdzenia gestów WebView.
