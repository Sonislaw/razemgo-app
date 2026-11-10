# Google Maps i Places — konfiguracja Dev

Android korzysta z **Maps SDK for Android**. Podpowiedzi miejsc korzystają z
**Places API (New)** przez funkcję Supabase. Maps JavaScript API nie jest
potrzebne aplikacji Android; dotyczy wyłącznie opcjonalnej mapy w przeglądarce.

## 1. Projekt Google Cloud

W [Google Cloud Console](https://console.cloud.google.com/) wybierz projekt
`razemgo-cfbe2`, połącz konto rozliczeniowe i w bibliotece API włącz:

- **Maps SDK for Android** — mapa i znaczniki wyjazdów;
- **Places API (New)** — podpowiedzi oraz szczegóły wybranego miejsca.
- **Weather API** — opcjonalna sekcja pogody w szczegółach wyjazdu,
  [osobny sekret i konfiguracja](TRIP_WEATHER.md).

Nie trzeba włączać Geocoding API do pobrania adresu i współrzędnych miejsca
wybranego z Places. Te dane dostarcza Place Details.
Ręcznie wpisany adres ustalamy przez Text Search w tym samym Places API (New),
bez dodatkowego klucza ani włączania Geocoding API. Zapis wymaga pełnego adresu
(adres miejsca, region, kraj) albo punktu wybranego na mapie. Gdy adres nie ma
dopasowania w podanym regionie i kraju, użytkownik poprawia go lub wybiera punkt.

## 2. Klucz mapy Android

W **APIs & Services → Credentials → Create credentials → API key** utwórz
osobny klucz dla Dev. Ustaw:

- **Application restrictions: Android apps**;
- package name: **`pl.razemgo.app.development`**;
- SHA-1 certyfikatu podpisującego APK Dev;
- **API restrictions: Restrict key → Maps SDK for Android**.

SHA-1 znajdziesz w konfiguracji certyfikatu Android Dev w EAS Credentials.
Można ją otworzyć poleceniem `npx eas-cli@latest credentials --platform android`
i wybrać profil development. Potrzebny jest SHA-1 używanego keystore,
a nie SHA-1 pliku APK. Nie zmieniaj istniejącego keystore.

W ignorowanym przez Git pliku `.env.local` dodaj:

```dotenv
GOOGLE_MAPS_ANDROID_API_KEY=wartosc_klucza_android
```

Tę samą zmienną dodaj w panelu projektu Expo/EAS, w **Environment variables**,
wybierając środowisko **development**. `app.config.js` przekazuje ją do pluginu
`react-native-maps`. Klucz Android jest częścią APK, dlatego jego ochroną są
ograniczenia pakietu, certyfikatu i dozwolonego API.

## 3. Klucz serwerowy Places

Utwórz drugi klucz z ograniczeniem API wyłącznie do **Places API (New)**.
Nie przypisuj mu ograniczenia Android ani HTTP referrer: wywołania wykonuje
serwer Supabase. Ograniczenie adresów IP ma sens tylko przy zapewnionym stałym
adresie wyjściowym serwera.

W panelu **Supabase Dev → Edge Functions → Secrets** dodaj:

```dotenv
GOOGLE_PLACES_API_KEY=wartosc_klucza_serwerowego
```

Projekt Supabase Dev: **`kswuakzcnoqgovnwejhb`**. Nie dodawaj tego klucza do
zmiennej `EXPO_PUBLIC_*`, konfiguracji Expo ani plików wysyłanych do aplikacji.
Nie wklejaj żadnego z kluczy do rozmowy. Konfiguracja Preview pozostaje osobna.

## 4. Nowe APK Dev

Natywna mapa wymaga nowego APK Dev. Sam restart Metro nie doda Maps SDK do
zainstalowanego wcześniej APK. Budowanie i test na urządzeniu należy wykonać
po dodaniu klucza Android do środowiska EAS development.

## Opcjonalnie: interaktywna mapa web

Tylko jeżeli chcemy również mapę w przeglądarce, należy dodatkowo włączyć
**Maps JavaScript API** i utworzyć oddzielny klucz ograniczony do adresów
stron. W aplikacji web odczytywany jest z `EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY`.
Nie jest używany przez natywny komponent mapy Android.

Bez klucza web przeglądarka zachowuje listę wyjazdów i odnośniki otwierające
Google Maps. Nie pokazuje niedziałającego przełącznika mapy ani pustego podglądu.

## Dokumentacja

- [Maps SDK for Android — konfiguracja i ograniczenia klucza](https://developers.google.com/maps/documentation/android-sdk/get-api-key)
- [Expo SDK 58 — react-native-maps](https://docs.expo.dev/versions/v58.0.0/sdk/map-view/)
- [Places API (New) — konfiguracja](https://developers.google.com/maps/documentation/places/web-service/get-api-key)
- [Place Details — dostępne pola](https://developers.google.com/maps/documentation/places/web-service/place-details)

## Weryfikacja konfiguracji Dev — 8 listopada 2026

- Klucz mapy Android znajduje się w `.env.local` oraz w środowisku EAS
  `development`; wartości są zgodne. Plugin otrzymuje klucz dla pakietu
  `pl.razemgo.app.development`.
- Funkcja `places` oraz jej obsługa limitów i pamięci podręcznej geometrii
  zostały wdrożone wyłącznie do Supabase Dev.
- Rzeczywiste zapytania Autocomplete i Place Details przeszły dla miejscowości
  Białowieża, kempingów w Łebie oraz województwa pomorskiego. Każdy wybrany
  wynik zawierał adres i współrzędne. Wywołania bez logowania oraz z obcego
  źródła zostały odrzucone.
- APK Dev **1.7.0 (6)** został zbudowany i zainstalowany na emulatorze Android.
  Potwierdzono autoryzację SDK, wyświetlanie mapy Google, znaczników pojazdów,
  przybliżanie skupisk i otwieranie podglądu wyjazdu. Sprawdzono również
  rzeczywiste podpowiedzi Places, pobranie adresu kempingu oraz ręczne miejsce
  z opcjonalnym punktem na natywnej mapie. Test nie opublikował ogłoszenia.
- [Pobierz APK Dev 1.7.0](https://expo.dev/artifacts/eas/_XZDBpV-xnDN4fyoAG-n3st3rDIN-4KovlGHJofnyYw.apk)
  · [Szczegóły kompilacji](https://expo.dev/accounts/sonislaw/projects/razemgo/builds/e424d981-2ddb-46f5-b9f0-811df81c22ae).
- Formularz lokalizacji korzysta z Google Places i ręcznego dodawania miejsca.
  Migracje danych, filtry, kontekst rozmów i odznaki za kempingi wdrożono na Dev.
  Usunięto katalog OSM, Leaflet i WebView. Testy rzeczywistej bazy kończą się
  wycofaniem danych kontrolnych; istniejące wyjazdy pozostają zachowane.

## Ograniczenie zapytań Places — 10 listopada 2026

- Autocomplete wymaga co najmniej **3 znaków** i **500 ms** przerwy w pisaniu.
  Porównuje tekst po usunięciu skrajnych spacji. Krótsze zapytanie jest zatrzymywane
  również w repozytorium i funkcji serwerowej. Serwer wymaga tokenu sesji.
- Każde otwarcie wyszukiwania ma własny token; podpowiedzi i wybór miejsca
  używają tego samego tokenu. Po nieudanej próbie Place Details nowa próba
  rozpoczyna nową sesję. Szczegóły nie są pobierane dla całej listy podpowiedzi.
- `createActivePlaceRequests` współdzieli odczyt szczegółów danego ID między
  zamontowanymi widokami. Lokalizacja, pogoda, mapa i pomocnik opisu korzystają
  z jednej odpowiedzi. Ponowny render i równoczesny odczyt nie tworzą duplikatów.
  Zwolnienie jednego odbiorcy nie anuluje pozostałych. Niedokończone żądania
  są anulowane po odejściu ostatniego odbiorcy; ukończone szczegóły korzystają
  z opisanego poniżej cache sesji. Zmiana konta przerywa żądania i czyści zasoby.
- Mapa wykorzystuje współrzędne już pobieranych szczegółów. Współrzędne są
  dodatkowo współdzielone w ograniczonej pamięci aplikacji przez maksymalnie
  30 minut, z uwzględnieniem terminu ważności po stronie dostawcy.
- Migracja `202611100002_places_request_optimization.sql` udostępnia serwerowi
  `get_google_place_geometry`. Funkcja `places` dla operacji `geometry` odczytuje
  istniejącą, ważną geometrię z bazy; Google jest wywoływane dopiero przy braku
  lub wygaśnięciu wpisu. Prywatny cache nadal ma limit 28 dni.
- Zadanie serwerowe co 5 minut sprawdza wyłącznie brakującą lub wygasającą
  geometrię. Samo uruchomienie zadania nie oznacza zapytania do Google;
  aktualne współrzędne nie są odświeżane co 5 minut.

Testy obejmują rzeczywisty próg 3 znaków i debounce 500 ms, wybór jednej
podpowiedzi, wspólny i odnawiany token, odczyty współdzielone, anulowanie,
izolację kont oraz prywatność i wygaśnięcie cache PostgreSQL. Scenariusz ekranu
własnego wyjazdu potwierdza **1 odczyt szczegółów i 0 dodatkowych odczytów
geometrii** dla lokalizacji, pogody i mapy. Test HTTP potwierdza **0 kolejnych
wywołań Google** przy powtórnym żądaniu ważnej geometrii. Testy korzystają
z atrap dostawcy; nie zwiększają licznika Google Places API.

Zmiany wdrożono wyłącznie na Dev, bez zmiany APK. Przeszły testy Node/PostgreSQL,
dwa testy HTTP Edge, pięć scenariuszy przeglądarkowych, lint, TypeScript
i kontrola źródeł. Kontrola rzeczywistego Dev potwierdziła dwa kolejne odczyty
ważnej geometrii bez odświeżenia przez Google i odrzucenie zapytania 2-znakowego.
Tymczasowe konto kontrolne usunięto; nie publikowało żadnych ogłoszeń.
Przeszłych 392 wywołań
nie można przypisać do poszczególnych ekranów na podstawie samego zbiorczego
licznika Google Cloud.

## Cache miejsc podczas sesji aplikacji

Na żądanie użytkownika odpowiedzi Place Details pozostają w RAM po zniknięciu
ostatniej karty. Kluczem jest `place_id`, a zakres obejmuje jedno uruchomienie
aplikacji dla jednego konta: listy, szczegóły, mapę, pogodę i pomocnik opisu.
Powrót do listy, odmontowanie wirtualizowanego wiersza czy inne ogłoszenie
z tym samym miejscem korzysta z pobranej odpowiedzi. Jest to mechanizm
techniczny; sam fakt użycia RAM nie potwierdza uprawnień do przechowywania
treści na podstawie warunków Google.

- Do **100 ostatnio używanych nieaktywnych miejsc**; po przekroczeniu limitu
  usuwane są najdawniej używane wpisy. Dane aktualnie używane przez widoki
  pozostają dostępne do ich zamknięcia.
- Wylogowanie i zmiana konta natychmiast czyszczą cache przez granicę sesji
  `backendLifecycle`. Zamknięcie procesu lub przeładowanie aplikacji również
  usuwa dane. Przejście między zakładkami ani krótkie przejście do innej
  aplikacji nie kończy tej sesji.
- Odpowiedź po wyborze podpowiedzi zasila cache, więc zapis ogłoszenia
  i otwarcie jego karty nie wymagają ponownego Place Details.
- Nowy wybór z Autocomplete zawsze kończy własny token sesji przez Place
  Details; jego aktualna odpowiedź odświeża cache. Samo przeglądanie korzysta
  z poprzednio pobranych danych.
- Błędy i anulowane żądania nie są zachowywane. Nazwy i adresy nie są
  zapisywane w bazie, AsyncStorage ani na dysku. Geometria zachowuje osobny
  cache z dotychczasowym terminem ważności.

Testy sprawdzają ponowne użycie po odmontowaniu wszystkich kart, limit LRU,
ochronę aktywnych wpisów, wybór miejsca, odrzucenie błędów i czyszczenie konta.
Scenariusz przeglądarkowy liczy żądania podczas zapisu, przełączenia do archiwum,
powrotu na listę, otwarcia szczegółów i ponownego logowania, bez przeładowywania
dokumentu pomiędzy tymi czynnościami. Zmiana jest dostępna przez Metro Dev,
bez nowej migracji, wdrożenia Edge ani APK.
