# RazemGo Preview 1.1.0 — 26.10.2026

## Zakres

- Wyszukiwanie publicznych ekip, filtry z licznikiem wyników, zgodność profili i kontakt bez ogłoszenia.
- Status online na avatarach i filtr aktywnych ekip.
- Ulubione ekipy i wyjazdy, powiadomienia o nowych publikacjach ulubionych ekip.
- Reakcje na ogłoszenia, wyniki widoczne dla wszystkich i powiadomienia właściciela.
- Stałe numery ekip, wyświetlane wyłącznie we własnym i publicznym profilu. Nazwa ekipy ma od 2 do 20 znaków.
- Poprawka uruchamiania statusu online w przeglądarkach bez `crypto.randomUUID`: korzysta z istniejącego generatora UUID opartego na losowych bajtach Expo Crypto.

## Backend Preview

Do `tueqqnbdvuazdxoqtpvk` wdrożono migracje `202610250001`–`202610250012` oraz funkcje `delete-account`, `dispatch-push`, `monitor-push`. Backend ma komplet 20 migracji. Główny katalog CLI nadal wskazuje Dev; Preview wdrożono z odrębnego katalogu roboczego.

Przed migracją wykonano lokalny eksport 21 tabel, bez danych logowania Auth, w ignorowanym `.expo/releases/`. Nie resetowano bazy ani nie kopiowano danych lub sekretów Dev. Porównanie po wdrożeniu potwierdziło zachowanie wszystkich wcześniejszych pól 3 profili i 7 wyjazdów. Konfiguracja Google, Firebase, role administratorów i istniejące konta pozostały w projekcie Preview.

Kontrola API na dwóch tymczasowych kontach potwierdziła zapis profilu, limit nazwy, unikalność numerów, logowanie w drugiej sesji, izolację kont, katalog i ranking, licznik filtrów, obecność online, ulubione, publikowanie wyjazdu, powiadomienia, reakcje oraz zaproszenie z profilu i czat. Konta i ich powiązane dane usunięto. Nie rejestrowano urządzeń ani nie wysyłano fizycznych push.

Przy pierwszym udostępnieniu kategorii „Wyjazdy ulubionych ekip” w Preview włączono jej domyślne powiadomienia również w jednym istniejącym rekordzie ustawień, który wcześniej nie miał tej opcji. Nie zmieniono zapisanych preferencji wiadomości i zaproszeń ani ustawień Dev; nie odtwarzano historycznych zdarzeń.

Harmonogram wysyłki i monitor push działały prawidłowo. Kontrola Edge odrzuciła żądanie bez sekretu i potwierdziła zdrową kolejkę oraz heartbeat Sentry z HTTP 200.

## Weryfikacja

- Lint, TypeScript, 356 testów Node, zgodność zależności SDK 58 i 20/20 kontroli Expo Doctor.
- 4 testy Edge Functions z 10 krokami.
- Pełny przebieg Playwright: 36 scenariuszy przeszło; ostatni ujawnił błąd inicjalizacji obecności bez `crypto.randomUUID`. Po poprawce przeszedł ten scenariusz i ponownie oba testy obecności online. Lint, TypeScript oraz trzy testy kontrolera obecności ponowiono po zmianie.
- Eksport webowy z konfiguracją Preview. Osobny test statycznego eksportu po poprawce potwierdził logowanie, chronione trasy, ukrycie narzędzi deweloperskich i bezpieczny raport Sentry w środowisku `preview`. Test przechwytuje API i telemetrię; nie modyfikuje prawdziwych kont.
- Pobrany APK: `pl.razemgo.app.dev`, wersja `1.1.0`, versionCode `4`, `debuggable=false`, brak DevLauncher, lokalny bundle i nowe funkcje. Potwierdzono konfigurację Supabase/Firebase Preview i brak backendu oraz zasobów aplikacji Firebase Dev.
- Certyfikat podpisujący jest identyczny jak w Preview 1.0.0 (2). SHA-256 certyfikatu: `940e42096e575610a5ccb398147c85237e9261066684f5b7a2f1c59d32ed9757`.

## Instalacja

Gotowy **RazemGo Preview 1.1.0 (4)**: [pobierz APK](https://expo.dev/artifacts/eas/LotUv6GyCKwFm87eh1Rkwfv84Xzzr83p2tIFjEzhcX8.apk) · [build EAS](https://expo.dev/accounts/sonislaw/projects/razemgo/builds/e44981d4-308d-4fe9-9142-c25020bbaa89). Build zakończył się `FINISHED` 26.10.2026.

Zainstaluj APK na obecnym Preview, bez odinstalowywania. Wydanie zachowuje pakiet `pl.razemgo.app.dev`, podpis i schemat logowania `razemgo`. Dev pozostaje osobną aplikacją. Preview działa samodzielnie, bez Metro.

Rozmiar APK: **124 923 618 bajtów**. SHA-256: `c24e8e7d229b1183d5e329a22a8e2c88044325c01c40e07cfdfe318a22073b8e`.

Testy logowania Google, aktualizacji APK, klawiatury i odbioru push na fizycznych telefonach wymagają sprawdzenia po instalacji. Kontrole komputerowe ich nie zastępują.
