# Samodzielny Android APK — preview

Aktualny podział na niezależne Dev i Preview opisano w [Środowiska](ENVIRONMENTS.md). Dotychczasowy Supabase pozostaje backendem Preview; nowy Dev ma osobny pakiet i własny projekt Supabase `kswuakzcnoqgovnwejhb`.

Profil `preview` buduje podpisany APK z kodem JavaScript i ilustracjami wewnątrz aplikacji. Nie wymaga Expo Go, Metro ani komputera. Internet nadal jest potrzebny do Supabase, Google, wiadomości, map i push. Konfiguracja dystrybucji odpowiada [EAS internal distribution](https://docs.expo.dev/build/internal-distribution/).

## Środowisko

To wydanie korzysta z obecnego **testowego Supabase**. Nie tworzy bazy produkcyjnej ani nie kopiuje danych. Nowe konto ma własny profil oraz pustą listę wyjazdów i rozmów. Przykłady na ekranie powitalnym pozostają częścią interfejsu.

W EAS projektu `sonislaw/razemgo`, środowisko **preview** zawiera:

| Nazwa | Rodzaj | Widoczność |
| --- | --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | string | sensitive |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | string | sensitive |
| `EXPO_PUBLIC_SENTRY_DSN` | string | sensitive |
| `GOOGLE_SERVICES_JSON` | file | secret |

Pierwsze trzy wartości są publiczną konfiguracją, widoczną także w APK. Oznaczenie sensitive ogranicza wyświetlanie ich przez EAS, nie szyfruje zawartości aplikacji. Nie dodawaj kluczy Supabase Secret/service role, Google Client Secret ani klucza prywatnego Firebase. Plik `GOOGLE_SERVICES_JSON` to konfiguracja aplikacji Android pobrana z Firebase, a nie plik konta serwisowego.

Flagi w `eas.json` wymuszają `EXPO_PUBLIC_APP_ENV=preview`, `EXPO_PUBLIC_ENABLE_DEMO=false` i `EXPO_PUBLIC_MONITORING_IN_DEV=false`. Sentry raportuje błędy aplikacji do środowiska **preview**; raporty współdzielonego testowego backendu nadal mają **development**. W tym APK nie ma karty diagnostyki deweloperskiej ani przełączników demo.

Zachowujemy pakiet `pl.razemgo.app.dev`, projekt EAS oraz schemat `razemgo`. Korzystamy z istniejącej konfiguracji Firebase/FCM i przeglądarkowego Google OAuth przez Supabase. Adresy powrotu pozostają `razemgo://auth/callback` oraz `razemgo://auth/callback?flow=recovery`. Nie potrzeba nowego klienta Google ani certyfikatu SHA dla tego przepływu przeglądarkowego. Przy testowaniu Google poza własnym kontem sprawdź listę testerów ekranu zgody w Google Cloud.

APK Preview zachowuje dotychczasowy pakiet i podpis. Nowy Dev (`pl.razemgo.app.development`) instaluje się obok Preview; wymaga własnego development buildu. EAS korzysta z istniejącego klucza podpisującego Preview; `autoIncrement` podnosi Android versionCode przy kolejnym wydaniu. Dane kont pozostają na serwerze, a aktualizacja Preview powinna zachować sesję.

## Kontrola i budowanie

W katalogu projektu:

```powershell
npm run lint
npm run typecheck
npm test
npx expo install --check
npx expo-doctor
npm run check:preview -- --online
```

`check:preview` sprawdza lokalną konfigurację z `.env.preview.local` z flagami profilu preview, zgodność pakietu Firebase i schemat Google. Opcja `--online` sprawdza połączenie z Supabase Auth oraz włączenie Google, e-maila i rejestracji. Nie tworzy kont i niczego nie zapisuje. Nie testuje pełnego logowania Google, dostarczenia e-maila ani push na telefonie.

Przed buildem sprawdź także rzeczywiste wartości EAS, bez nadpisywania `.env.local`:

```powershell
npx eas-cli@latest env:pull --environment preview --path .expo/eas-preview.env --non-interactive
npm run check:preview -- .expo/eas-preview.env --online
npm run build:preview
```

Sekretnego pliku Firebase nie pobiera `env:pull`; lokalna kontrola używa ignorowanego `google-services.json`. EAS udostępnia plik przez `GOOGLE_SERVICES_JSON` podczas buildu. `app.config.js` sprawdza konfigurację ponownie na serwerze EAS i przerywa build preview przy brakujących wartościach, niewłaściwym kluczu lub pliku Firebase. Konfiguracja używa [zmiennych EAS](https://docs.expo.dev/eas/environment-variables/usage/), a nie pliku `.env.local` wysyłanego z komputera.

Budowanie nie publikuje aplikacji w Google Play i nie uruchamia EAS Update. Zmiany kodu w tej wersji wymagają kolejnego APK. Po zakończeniu EAS udostępnia stronę instalacji i link do pobrania; przekaż testerom link do konkretnego wydania.

## Krótki scenariusz na dwóch telefonach

1. Zainstaluj APK, wyłącz Metro na komputerze lub odłącz komputer od sieci i uruchom aplikację z ikony. Powinien otworzyć się ekran powitalny lub wcześniej zalogowane konto, bez launchera Expo i pola adresu serwera.
2. Na telefonie A sprawdź Google; na B rejestrację e-mailem, potwierdzenie i utworzenie profilu. Zamknij i uruchom aplikację ponownie — sesja i profil mają pozostać. Sprawdź reset hasła, wylogowanie i ponowne logowanie.
3. A publikuje przyszły publiczny wyjazd, B widzi go w Odkrywaj. Szkic i prywatny plan nie powinny być widoczne dla B.
4. B wysyła zaproszenie, A je akceptuje. Obie strony widzą rozmowę. Sprawdź wiadomości, status odczytu i liczniki.
5. Zaakceptuj zgodę na push. Schowaj aplikację na A i wyślij wiadomość z B. Kliknięcie alertu powinno otworzyć właściwy czat. Powtórz przy aplikacji zamkniętej zwykłym usunięciem z ostatnich aplikacji (nie używaj systemowego „Wymuś zatrzymanie”).
6. Wyłącz internet, spróbuj pobrać lub zapisać dane, przywróć internet i ponów. Błąd nie powinien zmienić się w pustą listę ani pozorne potwierdzenie zapisu. W Sentry sprawdź środowisko preview; oczekiwane błędy hasła i walidacji nie tworzą alarmów.
7. Zgłoś wyjazd z B, obsłuż go z konta administratora: ukryj, przywróć, zablokuj konto i odblokuj. Potwierdzenia mają być widoczne bez awarii; blokada ma obejmować również istniejącą sesję.

Zapisz numer wydania, model telefonu i wynik scenariusza. Kontrole komputerowe oraz udany build nie zastępują testów instalacji, przeglądarki Google, klawiatury i dostarczenia push na fizycznych urządzeniach.

## Wydanie 1.1.0 — 26.10.2026

Gotowy **RazemGo Preview 1.1.0 (4)**: [pobierz APK](https://expo.dev/artifacts/eas/LotUv6GyCKwFm87eh1Rkwfv84Xzzr83p2tIFjEzhcX8.apk) · [EAS](https://expo.dev/accounts/sonislaw/projects/razemgo/builds/e44981d4-308d-4fe9-9142-c25020bbaa89).

Backend Preview ma komplet 20 migracji oraz aktualne funkcje serwerowe. Konta i dane testerów zachowano. Sprawdzono gotowy APK, konfigurację Preview i zgodność certyfikatu podpisującego z poprzednim wydaniem. Aktualizuj istniejące Preview bez odinstalowywania; Dev nadal działa osobno.

Zakres, kontrolę danych i wyniki testów opisano w [wydaniu 1.1.0](RELEASE_1.1.0.md).

## Wydanie 25.10.2026

Gotowy **RazemGo 1.0.0 (2)**: [pobierz APK](https://expo.dev/artifacts/eas/1VTujDT3rSFmldfcGsP7wqPACh6pUSqj029xqoIFNUg.apk) · [build EAS](https://expo.dev/accounts/sonislaw/projects/razemgo/builds/adaeb4ad-236e-4d33-924d-a6d9a4af224a).

- EAS zakończył build preview Androida. Pakiet `pl.razemgo.app.dev`, versionCode **2**, APK **124 800 286 bajtów**.
- Pobranie i kontrola APK potwierdziły `debuggable=false`, brak aktywności DevLauncher, lokalny bundle JavaScript, schemat `razemgo`, zasoby właściwej aplikacji Firebase i publiczną konfigurację Supabase/Sentry w bundlu. Karta diagnostyki deweloperskiej nie trafiła do bundla. Pliki `.env.local` i `google-services.json` nie są dołączone jako pliki źródłowe APK.
- Przeszły lint, TypeScript, **256 testów Node**, **22 scenariusze Playwright**, kontrola zależności Expo i **20/20** kontroli Expo Doctor. Wyrównano siedem wersji poprawek w obrębie SDK 58; dodano wymagany plugin `expo-image`.
- Eksporty Androida i webu przeszły. Osobny test gotowego statycznego eksportu webowego, bez Metro, potwierdził logowanie, chronione trasy, ukrycie narzędzi deweloperskich oraz bezpieczny raport Sentry z `environment=preview`. Ten test przechwytywał API i telemetrykę; nie zapisywał danych do prawdziwych kont.
- Kontrola online rzeczywistego Supabase Auth potwierdziła odpowiedź serwera oraz włączenie Google, e-maila i rejestracji. Testy pełnego logowania, instalacji, aktualizacji i push **na fizycznym telefonie pozostają do wykonania przez testera**.

SHA-256 APK: `22be18a5eb824438638b0b1adc90b06a8bcf83bf859c0d4cb14931529b831717`.
