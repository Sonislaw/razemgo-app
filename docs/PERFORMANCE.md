# Optymalizacja interfejsu — 4.11.2026

Zmiany działają na Dev przez Metro. Nie dodają bibliotek aplikacji ani modułów
natywnych, nie wymagają nowego APK i nie zmieniają backendu.

## Grafiki

Pomiar obejmuje rastry wskazane statycznie w kodzie `src/` z `assets/images`.
Nie obejmuje ikon aplikacji z konfiguracji ani nieużywanych materiałów źródłowych.

| Zakres | Przed | Po |
| --- | ---: | ---: |
| Wszystkie rastry używane w interfejsie | 9 270 320 B | 5 369 322 B |
| Nagłówek z łąką | 1 027 334 B | 122 448 B |
| Stopka | 893 556 B | 98 016 B |
| 10 avatarów | 1 591 028 B | 611 666 B |
| Dwa działania na Start | 686 858 B | 346 216 B |
| Dwa działania na powitaniu | 1 103 214 B | 507 656 B |

Zoptymalizowano 18 plików, oszczędzając 3 900 998 B, czyli 42,08% całego
mierzonego zestawu. To redukcja danych, a nie pomiar skrócenia czasu startu.

Nagłówek i stopka mają 1440 × 480 px, działania Start 1280 × 640 px, powitanie
1024 × 768 px. Proporcje, kadrowanie, układ komponentów i 384 × 384 px avatarów
pozostają zachowane. Kompresja WebP: jakość 86 dla teł, 92 dla avatarów, 95 dla logo;
kanał alfa zachowany bezstratnie. Nagłówek sekcji JPEG ma 1280 × 640 px.
Już skompresowanych krajobrazów i teł profili nie kodowano ponownie, gdy wynik
nie dawał istotnej oszczędności. Grafiki porównano w rozmiarach ekranowych.

Powtarzalne nagłówki, stopka i tło szczegółów profilu korzystają z pamięci obrazu
oraz cache dyskowego. Avatar i elementy dekoracyjne pomijają renderowanie, gdy
ich właściwości się nie zmieniły.

## Miejscowości

Odczyt kraju, regionu lub krótkiego zapytania nie inicjalizuje już katalogu
43 989 miejscowości. Nazwy województw są osobnym małym plikiem generowanym przez
ten sam importer; test sprawdza zgodność z pełnym katalogiem. Pełny katalog nadal
ładuje się przy pierwszym wyszukiwaniu lub odczycie konkretnej miejscowości.

W lokalnej próbie Node odczyt `country:PL` zmalał z około 51 ms do 0,08 ms.
Nie jest to pomiar telefonu. Wyniki 64 ostatnich zapytań są przechowywane
w ograniczonym cache LRU, osobno dla trybów wyjazdu. Wczytana lista wyników
pozostaje niezależna od kopii tablicy zwracanej wywołującemu.

Powtarzalny pomiar: `node scripts/benchmark-localities.mjs`. Raport rozdziela
import, małe odczyty, pierwsze użycie katalogu oraz zimne i zapamiętane zapytania.
Test uruchomiony w osobnym procesie sprawdza brak przedwczesnego ładowania JSON.

## Listy

Listy Odkrywaj są już wirtualizowane i stronicowane po 5 wyników. Zachowano
obecny rozmiar okna renderowania, układ kart i odtwarzanie pozycji przewijania.

Zasoby wyjazdów i ekip zachowują tożsamość niezmienionych obiektów oraz tablicy
po odświeżeniu. Karty korzystają z `memo`, więc dane, które się nie zmieniły,
nie powodują ponownego renderowania całej karty. Porównanie obejmuje kompletny
DTO; zmienione dane i usunięte wyniki nadal trafiają do interfejsu. Optymalizacja
jest włączana jawnie tylko dla tych dwóch zasobów JSON. Nowe wyszukiwanie
i zmiana konta tworzą świeży zasób. Obecność, ulubione, reakcje i oś czasu
nadal mają niezależne subskrypcje.

Weryfikacja obejmuje testy modeli, listy po 50 elementów, zapis ulubionych,
powrót do pozycji listy, wszystkie avatary i nieudane ładowanie obrazów oraz
lint, TypeScript, granice źródeł i eksport pakietu Androida. Zysku w FPS ani czasu
zimnego startu na fizycznym telefonie nie zmierzono. Do takiego pomiaru należy
użyć istniejącego profilu `performance`, bo Dev/Metro dodaje narzut debugowania.
