# Pierwsze poprawki UX — Dev, 1.11.2026

Zmiana realizuje trzy wskazane przez użytkownika punkty
[analizy UX/UI](UX_UI_AUDIT_2026_11_01.md).

## Kontakt na szczegółach wyjazdu

Organizator znajduje się przed opisem i mapą. Dolny pasek kontaktu jest
osobnym elementem układu, pozostaje widoczny podczas przewijania i uwzględnia
bezpieczny obszar ekranu. Treść przewija się nad nim, bez zasłaniania końca listy.

Pasek korzysta z istniejącego `TripContactAction`: zaproszenie, oczekiwanie,
odpowiedź na otrzymane zaproszenie, rozmowa i blokady zachowują dotychczasowe
reguły. Niedostępny wyjazd nie wyświetla paska.

## Ochrona edycji profilu

Porównanie z kopią profilu z chwili otwarcia rozpoznaje niezapisane zmiany.
Powrót przyciskiem nagłówka lub nawigacją wstecz proponuje:

- „Zapisz i wyjdź” — opuszcza edycję po udanym zapisie;
- „Kontynuuj edycję” — zachowuje formularz;
- „Odrzuć zmiany i wyjdź” — wykonuje wcześniej wybraną nawigację.

Błąd walidacji lub sieci pozostawia dane i potwierdzenie do ponowienia zapisu
albo powrotu do edycji. Formularz bez zmian nie pyta o zapis.
Używany jest [`usePreventRemove` z Expo Router SDK 58](https://docs.expo.dev/versions/v58.0.0/sdk/router/#usepreventremovepreventremove-callback-options), który obejmuje również
ostrzeżenie przed przeładowaniem strony. Na webie to ostatnie potwierdzenie
ma wygląd nadawany przez przeglądarkę.

## Drugi krok kreatora wyjazdu

Kreator zachowuje dwa kroki. W drugim kolejność to miejsce, opis, uczestnicy,
transport i widoczność. Nazwa i adres kempingu, zainteresowania, klimat,
zwierzęta oraz podgląd znajdują się w rozwijanych sekcjach. Ich zwinięcie
nie usuwa wybranych wartości; podsumowania pokazują zachowane informacje.
Rozwinięty podgląd zachowuje tę samą kartę i szerokość co Odkrywaj.

Walidacja zwraca również identyfikator pola. Dotychczasowe
`validateTripForm()` nadal zwraca te same komunikaty tekstowe dla pozostałych
wywołań aplikacji. Kontroler wyświetla błędy przy polach i przechodzi do
pierwszego błędu zgodnie z kolejnością widoku. Niepoprawny termin otwiera
pierwszy krok; błąd danych opcjonalnych rozwija odpowiednią sekcję.
Pola tekstowe otrzymują fokus i powiązanie z komunikatem; grupy wyboru
otrzymują fokus na sekcji. Zapis niepełnego szkicu pozostaje dostępny.

RN Web usuwa fokus przy programowym przewijaniu, jeśli włączone jest
`keyboardDismissMode="on-drag"`. Dlatego kreator na webie używa `none`;
Android i iOS zachowują dotychczasowy tryb zamykania klawiatury gestem.

Zmiana nie wymaga migracji, publikacji Edge Functions ani nowego APK.
Zwykłe odświeżenie Dev pobiera nowy interfejs. Preview i Production nie były
publikowane ani konfigurowane.

## Weryfikacja

Przeszły **583/583 testy Node/PGlite**, **12/12 scenariuszy przeglądarkowych**,
lint, TypeScript i kontrola granic źródeł. Scenariusze obejmują:

- widoczność kontaktu przy przewijaniu, na ekranach 390 × 844, 320 × 800
  i 390 × 480, zmianę akcji po zaproszeniu i akceptacji oraz brak paska dla
  usuniętego wyjazdu;
- kontynuację i odrzucenie edycji profilu, cofnięcie historii, zatrzymanie
  przeładowania strony, niepoprawne dane i ponowienie zapisu po błędzie sieci;
- błędy i fokus dat, miejsca, opisu oraz składu, zachowanie zwiniętych danych,
  publikację prywatną, ponowną edycję, publiczną publikację, niepełny szkic,
  oba tryby wyjazdu i podgląd odpowiadający karcie w Odkrywaj;
- wcześniejszy przepływ zaproszenie → akceptacja → rozmowa, odczyty, ponowienia,
  drugie urządzenie, blokady i zgłoszenia.

W przykładowym scenariuszu z wybraną lokalizacją i błędem pustego opisu
zwinięty drugi krok miał 1498 px treści przy obszarze przewijania 656 px.
Pomiar dotyczy kontrolowanych danych testowych. Mała wysokość okna nie zastępuje
sprawdzenia natywnej klawiatury; fizycznego telefonu w tej kontroli nie używano.
