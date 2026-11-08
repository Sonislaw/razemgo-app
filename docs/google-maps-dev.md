# Google Maps i Places — konfiguracja Dev

Android korzysta z **Maps SDK for Android**. Podpowiedzi miejsc korzystają z
**Places API (New)** przez funkcję Supabase. Maps JavaScript API nie jest
potrzebne aplikacji Android; dotyczy wyłącznie opcjonalnej mapy w przeglądarce.

## 1. Projekt Google Cloud

W [Google Cloud Console](https://console.cloud.google.com/) wybierz projekt
`razemgo-cfbe2`, połącz konto rozliczeniowe i w bibliotece API włącz:

- **Maps SDK for Android** — mapa i znaczniki wyjazdów;
- **Places API (New)** — podpowiedzi oraz szczegóły wybranego miejsca.

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
