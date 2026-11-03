# Udostępnianie w Dev

Stan: 2.11.2026. Kod 1.5.0, nowy APK Dev z modułem schowka.

## Zakres

- Ikona udostępniania jest na kartach i w szczegółach dostępnych wyjazdów
  oraz ekip, w tym własnej ekipy i opublikowanego własnego wyjazdu.
- Ikona otwiera panel z akcją „Kopiuj link”. Sukces i błąd kopiowania mają
  osobne komunikaty; błąd można ponowić. Prywatne szkice nie mają tej akcji.
- Wyjazd: `razemgo-dev://trip/<uuid>`; ekipa: `razemgo-dev://crew/<uuid>`.
  Adres używa ID obiektu, nie nazwy, numeru ekipy ani ID konta Auth.
- Czat rozpoznaje te adresy również w dłuższej wiadomości, zachowując tekst
  i interpunkcję. Nie otwiera obcych schematów, adresów Auth ani linków Dev
  zagnieżdżonych w adresie obcej strony.
- Link do własnej ekipy otwiera Mój profil. Dla wyjazdu ekran pośredni
  sprawdza własność przez `get_my_trip`, niezależnie od stron pobranej listy:
  właściciel trafia do `/trips/[id]`, odbiorca do `/trip/[id]`.
  Ograniczenia widoczności, blokady i moderacja pozostają sprawdzane przez backend.
- Funkcja działa przy `extra.appVariant=development`, także w profilu
  performance. W Preview pozostaje wyłączona. Nie dodano domeny HTTPS,
  systemowego udostępniania ani konfiguracji Production.

## Instalacja

Dodano `expo-clipboard ~58.0.4`, zgodnie z Expo SDK 58. Starszy APK Dev
nie zawiera tego modułu: przed kopiowaniem na telefonie trzeba zainstalować
nową paczkę. Import modułu następuje dopiero po wybraniu „Kopiuj link”, więc
starszy APK nadal pozwala uruchomić pozostałą aplikację. Web korzysta bezpośrednio
z Clipboard API przeglądarki i potwierdza sukces dopiero po zapisaniu schowka.

Build: [Dev 1.5.0 (5)](https://expo.dev/accounts/sonislaw/projects/razemgo/builds/2771ef29-fa31-4de7-bc0a-69335e0dd53d),
profil `development`, pakiet `pl.razemgo.app.development`.
Build zakończył się `FINISHED`.
[Pobierz APK Dev 1.5.0 (5)](https://expo.dev/artifacts/eas/9bX8hOaKEZIOOdLX9G0Vm3ksGXjoOFBks0lDuaDAlM4.apk).
Zweryfikowano manifest: `pl.razemgo.app.development`, wersja `1.5.0`,
versionCode `5`. Pliki DEX zawierają natywny `expo.modules.clipboard.ClipboardModule`.
Lokalna kopia: `.expo/razemgo-dev-1.5.0.apk`, 286 041 508 B.
SHA-256: `30258be5e426f87233893471b0c8f65e36565ba9933340ea78f7f8a11cefb8d7`.
Dev wymaga serwera Metro na porcie 8081.

## Weryfikacja

- `node --test scripts/share-links.test.mjs scripts/messaging.test.mjs`: 15 testów.
- `scripts/browser/sharing.spec.mjs`: dwa testy z rzeczywistym schowkiem
  przeglądarki, wklejeniem klawiaturą, wysłaniem wiadomości i otwarciem linków
  na dwóch kontach. Sprawdzono też odmowę schowka, ponowienie, prywatny szkic
  i niedostępny wyjazd.
- Test karty ekipy z przytrzymaniem i test reakcji na wiadomości: przeszły.
- Lint, TypeScript, granice źródeł i konfiguracja Dev: przeszły.

Testy interakcji wykonano w przeglądarce na odizolowanym backendzie testowym.
Nie wysyłano wiadomości do rzeczywistych użytkowników. Nie testowano telefonu.
