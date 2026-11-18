# Preview 1.8.0 — wydanie, 17.11.2026

Status: **APK 1.8.0 (9) wycofany 18.11.2026 z powodu awarii przy starcie**.
Kontrole statyczne poniżej przeszły, ale nie wykryły usuniętych przez R8
konstruktorów Room i InputMerger, wymaganych przez WorkManager z modułu map.
Awarię odtworzono na emulatorze. Poprawka i sprawdzenie uruchomienia gotowego
APK: [Preview 1.8.1](RELEASE_1.8.1.md).
[Zakończona kompilacja EAS](https://expo.dev/accounts/sonislaw/projects/razemgo/builds/6e83fb7a-d17d-4487-bc49-0a2434d83c2d).

## Zakres

Promocja aktualnego kodu Dev obejmuje paszport podróżnika, odznaki i poziomy ekip,
Google Maps SDK for Android, lokalizacje Geoapify i Google Places, pogodę na wyjazd,
cache i ograniczanie zapytań API, podział Odkrywaj na „Szukam pomysłu” i „Mam plan”,
szybkie daty i sortowanie, generowanie opisów oraz ostatnie zmiany przycisków,
filtrów i prezentacji miejscowości.

Miejscowości w Polsce pokazują region, a zagraniczne — kraj w nawiasie.
Serduszko obok zapisanych zestawów przełącza ulubione w listach i na mapie.
Sekcje filtrów mają kolejność: miejsce, termin, dzieci, klimat, zwierzęta.

## Backend Preview

Projekt `tueqqnbdvuazdxoqtpvk` otrzymał 17 migracji, od
`202611050001_traveler_passport.sql` do
`202611110005_planned_locality_discovery.sql`; ma teraz **69 migracji**.

Wdrożono siedem Edge Functions: `delete-account`, `dispatch-push`, `monitor-push`,
`places`, `search-areas`, `geoapify-places`, `trip-weather`.

Przed migracją wykonano lokalną, ignorowaną przez Git kopię 41 tabel aplikacji.
Po migracji zachowano **54 konta, 54 ekipy, 57 ogłoszeń i 49 wiadomości**.
Kontrola tabel publicznych potwierdziła RLS i brak anonimowego odczytu.
Cache Geoapify i kontekst pogody nie są dostępne anonimowo. Działa osiem zadań cron.

## Nowe dane demonstracyjne Preview

Po wdrożeniu, na wyraźne polecenie użytkownika, usunięto **wszystkie 57 ogłoszeń**
oraz **50 kont** poprzedniego, jednoznacznie oznaczonego w metadanych seedowania.
Zachowano cztery pozostałe konta i dokładnie tę samą zawartość 49 wiadomości.

Dodano **30 nowych ekip**, każdą z jednym publicznym ogłoszeniem:
**10 „Mam plan” i 20 „Szukam pomysłu”**. Każde ma inną miejscowość i unikalny
opis długości **757–881 znaków**, a profile mają różne awatary, składy i transport.
Są także miejscowości w Czechach, Niemczech i Słowenii.

Miejscowości pochodzą z rzeczywistego Geoapify. „Mam plan” ma niezależnie zapisany
obszar miejscowości i konkretne miejsce wybrane z Google Places z rzeczywistym
adresem i współrzędnymi. Otwarte kierunki nie zawierają wymyślonego kempingu.
Konta utworzono administracyjnie bez e-maili rejestracyjnych. Publikację
przeprowadzono z pominięciem kolejek powiadomień i push dla tego seedowania.

Poświadczenia, dokładne identyfikatory kont, kopia danych oraz raport weryfikacji
pozostają lokalnie w ignorowanym `.expo/`. Metadane kont zawierają
`seed_batch=preview-community-20261117` i `seed_environment=preview`, co pozwala
bezpiecznie identyfikować ten zestaw przy późniejszym sprzątaniu.

## Konfiguracja usług

Użytkownik uzupełnił w Supabase Preview sekrety `GOOGLE_PLACES_API_KEY`,
`GOOGLE_WEATHER_API_KEY` oraz `GEOAPIFY_API_KEY`.
`GOOGLE_MAPS_ANDROID_API_KEY` został przeniesiony z ignorowanego
`.env.preview.local` do środowiska EAS **preview**.
Klucze pozostają poza repozytorium i dokumentacją.

Rzeczywiste sprawdzenie potwierdziło wyszukiwanie Google Places, szczegóły miejsca
z adresem i współrzędnymi, paszport zalogowanej ekipy i prognozę Google Weather
na cztery dni dla istniejącego ogłoszenia. Po poprawieniu klucza Geoapify test
zwrócił poprawną miejscowość Ustka, kraj i współrzędne, gotowe do zapisania w bazie.

Pakiet pozostaje `pl.razemgo.app.dev`, schemat logowania `razemgo`.
Certyfikat dotychczasowego Preview ma SHA-1
`08:A8:5A:D5:42:49:D8:EB:63:6F:62:44:E5:1A:A5:DA:CA:14:EE:69`.
Ograniczenia klucza Maps dla Androida muszą dopuszczać ten pakiet i certyfikat.

## Kontrole

- Lint, TypeScript, zgodność wersji trzech plików oraz kontrola źródeł przeszły.
- Pełny przebieg Node: **741/741**. Zaktualizowano oczekiwania testów pola
  `searchArea` oraz katalog uprawnień RPC po sprawdzeniu nowych uprawnień
  i kontroli dostępu.
- Edge Functions: **14 testów i 12 kroków**, bez błędów.
- Playwright: **16 scenariuszy** przeszło przy szerokościach 320 i 390 px.
  Testy szybkich dat i sortowania otrzymały jawny wybór „Mam plan”, zgodny
  z ich danymi testowymi. Sprawdzono także prognozę, retry i pełne nazwy miejsc.
- Eksport Androida Preview przeszedł; bundle zawiera właściwy backend Preview,
  paszport i nowe usługi. Nie zawiera adresu backendu Dev.
- Expo Doctor: **19/20**; kontrola zgodności wersji wskazuje nowsze zalecane
  wydania 16 zależności w obrębie SDK 58. Zachowano wersje używane w Dev.

## Weryfikacja gotowego APK

Pobrano i sprawdzono plik o rozmiarze **124 978 145 bajtów**. Pakiet to
`pl.razemgo.app.dev`, wersja `1.8.0`, kod `9`; aplikacja jest samodzielnym
wydaniem bez trybu debug i bez aktywności DevLauncher.

Podpis APK jest poprawny i identyczny z Preview 1.6.0 (8). Konfiguracja zawiera
backend Preview, właściwy klucz Maps i Firebase Preview. Bundle zawiera paszport,
wyszukiwanie obszarów i pogodę; nie zawiera backendu Dev ani lokalnych plików
konfiguracji i poświadczeń administracyjnych.

SHA-256 pliku:
`d218536ed2d8dd9ae3fe3dd8ca2c37dc52754ee439ba26e1daf3a0a62080c840`.

Nie było podłączonego urządzenia Android. Instalacja, logowanie Google i push
na fizycznym telefonie pozostają do sprawdzenia przez testera.
