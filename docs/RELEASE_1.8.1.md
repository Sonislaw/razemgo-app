# Preview 1.8.1 — poprawka uruchamiania, 18.11.2026

Status: **APK Preview 1.8.1 (11) gotowy; awaria uruchamiania usunięta**.
**[Pobierz APK](https://expo.dev/artifacts/eas/6ZmIBnCVymgiy4nidtL9FB4qvKegaKbXOTFASndVyJs.apk)** ·
[zakończona kompilacja EAS](https://expo.dev/accounts/sonislaw/projects/razemgo/builds/034ff1d1-ff0c-4be6-b018-58443be5a396).
Można zainstalować jako aktualizację dotychczasowego Preview.

## Przyczyna i poprawka

APK Preview 1.8.0 (9) kończył działanie na ekranie z logo. Odtworzono awarię
na emulatorze Pixel 7, Android API 37. Logcat wskazał
`Unable to get provider androidx.startup.InitializationProvider` i
`Failed to create an instance of class androidx.work.impl.WorkDatabase.canonicalName`.

`react-native-maps` 1.29.11 dołącza WorkManager 2.9.1 i Room 2.5.0.
Analiza DEX wadliwego APK potwierdziła brak konstruktorów w `WorkDatabase_Impl`,
`OverwritingInputMerger` i `ArrayCreatingInputMerger`. Są tworzone przez refleksję,
a optymalizacja R8 nie zachowała ich na podstawie reguł starych bibliotek.
Kod JavaScript, logowanie i monitoring nie zdążyły się uruchomić.

Dodano zgodny z Expo SDK 58 plugin `expo-build-properties` i dwie reguły
`extraProguardRules`: zachowanie publicznych konstruktorów bezargumentowych
klas dziedziczących po `androidx.room.RoomDatabase` i `androidx.work.InputMerger`.
Pozostała optymalizacja wydania pozostaje włączona. Zmiana wymaga nowego APK.

Google opisuje analogiczny problem konstruktorów usuwanych przez R8 w
[poprawce AndroidX](https://android.googlesource.com/platform/frameworks/support/+/5f93d291ff2c25a557567cbe0d3e7ff04bcc7eea).
Konfiguracja korzysta z udokumentowanego
[extraProguardRules](https://docs.expo.dev/versions/v58.0.0/sdk/build-properties/#pluginconfigtypeandroid).

## Kontrole

- Lint, TypeScript, zgodność wersji i kontrola źródeł przeszły.
- 19 testów konfiguracji środowisk i monitoringu przeszło.
- Pełny zestaw Node: **741/741**.
- Rzeczywisty prebuild Androida w ignorowanym katalogu roboczym przeszedł;
  wygenerowany `android/app/proguard-rules.pro` zawiera obie reguły.
- Gotowy APK zainstalowano jako aktualizację na emulatorze Pixel 7, Android API 37.
  **Trzy zimne uruchomienia przeszły**; proces pozostaje aktywny, pojawia się
  ekran główny, poprzednia sesja i profil są prawidłowo odtwarzane.
- Otworzono Odkrywaj (20 ogłoszeń „Szukam pomysłu”), szczegóły rzeczywistego
  ogłoszenia i profil zalogowanej ekipy. Test obejmował przywracanie sesji,
  bez ponownego logowania Google ani wysyłania wiadomości.
- DEX nowego APK zawiera publiczne konstruktory bezargumentowe wszystkich
  trzech wcześniej uszkodzonych klas. Regresyjna kontrola starego APK wykrywa
  brak tych konstruktorów i przerwanie procesu przy uruchamianiu.
- Podpis jest poprawny i zgodny z wcześniejszym Preview. Pakiet, backend,
  Firebase i klucz Maps mają konfigurację Preview; backend Dev jest nieobecny.

Rozmiar APK: **124 994 677 bajtów**. SHA-256:
`64cb83105d362b324a3d7e61f40b20dbe0373a2085d6487623cb62b501e3145b`.

Dodano `npm run test:android:startup -- --apk PLIK.apk --serial emulator-5554`.
Kontrola instaluje aktualizację bez kasowania danych i sprawdza trzy starty
rzeczywistego APK. Wyniki pozostają lokalnie w ignorowanym `.expo/android-startup/`.

## Konfiguracja mapy Preview — potwierdzona

Podczas pierwszej kontroli Google Maps SDK zwracał **Authorization failure**.
18.11.2026 właściciel uzupełnił konfigurację klucza w Google Cloud. Ponowne
uruchomienie tego samego APK 1.8.1 (11) na emulatorze potwierdziło poprawne
pobieranie mapy i wyświetlenie **10 wyjazdów „Mam plan”** jako znaczników
i grup znaczników. Kliknięcie znacznika w Ustce otworzyło podgląd, a przycisk
„Zobacz wyjazd” — właściwe szczegóły ogłoszenia. Logi nowego procesu nie zawierają
błędu autoryzacji ani awarii natywnej. Nowy APK nie był potrzebny.

W Google Cloud → APIs & Services → Credentials klucz użyty jako
`GOOGLE_MAPS_ANDROID_API_KEY` dla Preview wymaga włączonego
Maps SDK for Android oraz ograniczenia dopuszczające tę usługę i parę:

- Pakiet: `pl.razemgo.app.dev`.
- SHA-1: `08:A8:5A:D5:42:49:D8:EB:63:6F:62:44:E5:1A:A5:DA:CA:14:EE:69`.

Dotychczasowe wpisy Dev należy zachować. Zmiana ograniczeń istniejącego klucza
nie wymaga kolejnego APK. Administracja Google Cloud pozostaje po stronie
właściciela. Instrukcja:
[Google Maps SDK for Android](https://developers.google.com/maps/documentation/android-sdk/get-api-key).

Baza i dane Preview nie wymagają zmian. Zachowano 30 nowych ekip i ogłoszeń,
cztery pozostałe konta oraz wiadomości. Dev korzysta z tej samej poprawionej
konfiguracji przy następnym budowaniu klienta.
