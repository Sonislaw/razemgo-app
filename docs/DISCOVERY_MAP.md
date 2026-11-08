# Mapa wyjazdów
Wdrożenie Google Maps: Dev, 8 listopada 2026. Preview i Production nie są zmieniane.

## Obsługa
W Odkrywaj → Wyjazdy przycisk Mapa otwiera gotowe plany. Typ Mam plan jest wtedy
zaznaczony i zablokowany; Szukam pomysłu pozostaje na liście. Powrót zachowuje
filtry, wczytane strony i pozycję przewijania. Kamera mapy jest pamiętana w sesji.

Przesunięcie i zmiana przybliżenia pobierają wyniki po 450 ms od zakończenia ruchu.
Pobliskie wyjazdy są grupowane; kliknięcie przybliża grupę albo otwiera jej
stronicowaną listę. Pojedynczy wynik pokazuje podgląd bez otwierania listy.
Znacznik pojedynczego wyjazdu przedstawia pojazd ekipy organizatora.

## Silnik
Android korzysta z natywnego Maps SDK for Android przez react-native-maps 1.29.11.
Tak samo działa mapa w szczegółach wyjazdu i wybór punktu przy ręcznym dodawaniu
miejsca. Nie wymaga Maps JavaScript API ani WebView. Nie pobiera GPS telefonu.

Opcjonalny widok przeglądarkowy korzysta z Maps JavaScript API, z osobnym kluczem
ograniczonym do stron. Dokument public/razemgo-map.html jest generowany przez
scripts/generate-map-document.mjs. Most weryfikuje okno, origin, token i format
komunikatów; nie otrzymuje tokenów konta ani prywatnych danych profilu.

## Lokalizacje
Nowy formularz ma jedno pole Google Places oraz możliwość dodania miejsca ręcznie.
Miejsce Google zachowuje identyfikator i opis wpisany przez użytkownika. Nazwy
i adresy dostawcy są pobierane do widoku, bez zapisywania katalogu miejsc w bazie.
Zweryfikowane współrzędne i zasięg są przechowywane prywatnie przez 28 dni.

Dla ręcznego miejsca zapisujemy dane użytkownika i opcjonalny punkt. Bez punktu
wyjazd pozostaje na liście. Starsze wyjazdy nadal korzystają z istniejących
współrzędnych miejscowości; nie przypisujemy środka miejscowości do bramy kempingu.
Katalog kempingów OSM, Leaflet, stare osadzanie map i zależność WebView usunięto.

Nowe filtry miejscowości obejmują okolicę do 20 km, konkretnego miejsca do 1 km.
Regiony i kraje Google wykorzystują zasięg zwrócony przez dostawcę. Ręczne regiony
i kraje bez współrzędnych zachowują wyszukiwanie po nazwie. Zestawy filtrów zapisują
kryteria miejsca, bez zapisywania aktualnego widoku mapy.

## Backend
Migracje 202611080001–003 dodają format place_data, walidację, prywatną geometrię,
obsługę nowych miejsc w wyszukiwaniu, paszporcie i kontekście rozmów.
search_trip_map i get_trip_map_items zachowują filtry, paginację, blokady,
moderację oraz dotychczasowe reguły dostępu. RPC nigdy nie pokazują własnych,
prywatnych ani zablokowanych wyjazdów przez znaczniki.

Funkcja places obsługuje zalogowane wyszukiwanie i szczegóły przez Places API (New).
Tylko serwer zapisuje geometrię Google. Zadanie Dev odnawia współrzędne aktywnych
wyjazdów i zapisanych filtrów co pięć minut, w ograniczonych porcjach; czyszczenie
usuwa wygasłe rekordy. Konfiguracja: scripts/configure-google-places.mjs.
Klucz serwerowy nie trafia do APK.

## Sprawdzanie
- npm run test:places
- node --test scripts/discovery-map.test.mjs scripts/discovery-map-backend.test.mjs
- npx playwright test scripts/browser/places.spec.mjs scripts/browser/discovery-map.spec.mjs
- npm run test:edge
- npm run lint
- npm run typecheck

Testy przeglądarkowe używają atrap dostawcy. Rzeczywiste Places i migracje
są dodatkowo sprawdzane na Dev; testy danych kontrolnych kończą się ROLLBACK.
Konfiguracja kluczy: [google-maps-dev.md](google-maps-dev.md).
