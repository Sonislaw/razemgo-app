# RazemGo Preview 1.2.0 — 26.10.2026

## Zakres

- Wyszukiwanie wyjazdów w Supabase: filtry, pełny licznik wyników i sortowanie według zgodności przed pobraniem strony.
- Doładowywanie po 5 wyjazdów i ekip w Odkrywaj oraz po 5 ogłoszeń w profilu ekipy. Wskaźnik ładowania i możliwość ponowienia po błędzie.
- Powrót ze szczegółów wyjazdu lub profilu do obejrzanej karty, z zachowaniem wczytanych stron. Zmiana zakładki zaczyna listę od początku.
- Linia czasu pod datą na kartach i w szczegółach: dziś, początek i koniec wyjazdu oraz liczba dni do terminu.
- Wirtualizacja list i cache ilustracji: poza oknem renderowania odległe karty są odmontowywane, a stan ulubionych i reakcji pozostaje zachowany.

## Backend Preview

Do `tueqqnbdvuazdxoqtpvk` wdrożono trzy migracje:

- `202610260001_trip_discovery.sql`
- `202610260002_group_pagination.sql`
- `202610260003_group_trip_pagination.sql`

Dev i Preview mają po 23 migracje. Starsze RPC pozostają dostępne dla Preview 1.1.0. Kod Edge Functions nie zmienił się od poprzedniego wydania, więc nie wdrażano ich ponownie. Wydanie zachowuje istniejącą konfigurację logowania Google, Firebase, SMTP i Sentry. Główny link CLI nadal wskazuje Dev.

Przed migracją zapisano lokalny eksport 27 tabel w ignorowanym `.expo/releases/`, bez danych logowania Auth. Porównanie po wdrożeniu potwierdziło zachowanie wszystkich wcześniejszych pól 3 profili, ich preferencji i ustawień publicznych, 7 wyjazdów, 18 wiadomości, 4 zaproszeń i roli administratora. Zachowano 3 konta Auth. Nie resetowano bazy ani nie kopiowano testowych kont i ogłoszeń Dev.

Kontrola prawdziwego API Preview użyła dwóch tymczasowych kont i siedmiu kontrolnych wyjazdów. Potwierdziła strony wyjazdów 5+2, pełny licznik, szczegóły po ID, strony ogłoszeń ekipy 5+2, wyszukiwanie ekip z limitem oraz zgodność starszych RPC. Sprawdzono też zapis i odtworzenie profilu, izolację kont, ulubione, obecność, powiadomienia, reakcje, zaproszenie z profilu i czat. Tymczasowe konta i ich dane usunięto. Nie rejestrowano urządzeń ani nie wysyłano fizycznych push.

Kontrola `monitor-push` odrzuciła żądanie bez sekretu i potwierdziła zdrową kolejkę, działające harmonogramy oraz przyjęty heartbeat Sentry z HTTP 200.

## Weryfikacja

- Lint, TypeScript, **391 testów Node**, zgodność zależności SDK 58 i **20/20** kontroli Expo Doctor.
- **4 testy Edge Functions z 10 krokami**.
- Końcowy pełny przebieg Playwright: **47/47 scenariuszy**, w tym listy po 50 rekordów, doładowywanie, powrót do przewinięcia, izolacja kont i błędy obrazów. W pierwszych próbach poprawiono testy: przewijanie przez okno renderowania przed kliknięciem stopki oraz oczekiwanie na pomiar wąskiej legendy osi czasu. Kod aplikacji nie wymagał poprawki.
- Eksport webowy z rzeczywistą konfiguracją EAS Preview. Test statycznego eksportu bez Metro potwierdził logowanie, chronione trasy, ukrycie diagnostyki Dev i bezpieczny raport Sentry z `environment=preview`; wszystkie żądania API i telemetrii w tym scenariuszu były przechwycone.

- Pobrany APK: `pl.razemgo.app.dev`, wersja **1.2.0**, versionCode **5**, `debuggable=false`, lokalny bundle JavaScript i brak DevLauncher. Bundle zawiera nowe API wyszukiwania, linię czasu i istniejące funkcje społecznościowe, właściwe publiczne ustawienia Supabase/Sentry Preview oraz zasoby aplikacji Firebase Preview. Backend Dev i zasoby aplikacji Firebase Dev są nieobecne.
- Certyfikat podpisujący jest identyczny jak w Preview 1.1.0 (4). SHA-256 certyfikatu: `940e42096e575610a5ccb398147c85237e9261066684f5b7a2f1c59d32ed9757`.

## Instalacja

Gotowy **RazemGo Preview 1.2.0 (5)**: [pobierz APK](https://expo.dev/artifacts/eas/98uxA1QnwXv0DGDIqGs98ViMg3QyA0nnuaZ5IZvD5sw.apk) · [build EAS](https://expo.dev/accounts/sonislaw/projects/razemgo/builds/c4c170f7-f04d-4e79-9ffa-3df88e74277b). Build zakończył się `FINISHED` 26.10.2026. Gotowy plik pobrano i sprawdzono.

Zainstaluj APK na obecnym Preview, bez odinstalowywania. Wydanie zachowuje pakiet `pl.razemgo.app.dev`, certyfikat podpisujący i schemat logowania `razemgo`. Dev pozostaje osobną aplikacją. Preview działa samodzielnie, bez Metro.

Rozmiar APK: **124 971 538 bajtów**. SHA-256: `4401d331e0a0a3d62a1fc52bcce70b32def2359fff26f4c19ab38a0dcdc8257e`.

Testy Google, aktualizacji APK, klawiatury, płynności list i odbioru push na fizycznych telefonach wymagają sprawdzenia po instalacji. Kontrole komputerowe ich nie zastępują.
