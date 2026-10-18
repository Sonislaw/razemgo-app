# RazemGo — App Shell MVP

Mobilna aplikacja do poznawania towarzyszy wspólnych wyjazdów. Pierwsza wersja interfejsu zawiera pięć zakładek: **Start, Odkrywaj, Wyjazdy, Wiadomości, Profil**.

## Uruchomienie w Expo Go

Projekt zachowuje **Expo SDK 57**, React Native 0.86 i Expo Router. Do pracy zalecany jest Node.js 24 (wbudowana obsługa TypeScript jest również używana w testach).

```powershell
cd C:\Users\dev\www\razemgo
npm ci
npx expo start
```

Otwórz Expo Go obsługujące SDK 57 na telefonie z Androidem i zeskanuj kod QR z terminala. Telefon i komputer powinny znajdować się w tej samej sieci. Klawisz `w` otwiera pomocniczy podgląd webowy. Klawisz `a` wymaga skonfigurowanego emulatora lub urządzenia Android.

## Co działa

- Pięć zakładek, skróty pomiędzy ekranami oraz historia zakładek dla przycisku „wstecz”.
- Domyślny jasny motyw niezależny od ustawień urządzenia, wspólne tokeny i lokalne ilustracje. Paleta ciemna pozostaje przygotowana pod przyszły wybór motywu w aplikacji.
- Sześć fikcyjnych propozycji, dwa własne plany oraz przykładowy profil.
- Profil: kompaktowa karta ekipy, edycja nazwy, okolicy, liczby dorosłych i dzieci, przybliżonych przedziałów wieku, sposobów podróżowania oraz zainteresowań. Każda sekcja otwiera swoją część edytora; wyjście bez zapisu odrzuca zmiany.
- „Kogo chcemy poznać?” przechowuje osobne preferencje dotyczące grup i wieku dzieci. Preferowany wiek służy do objaśniania zgodności w Odkrywaj; jawnie wybrany filtr wieku ma pierwszeństwo. Procentowe oceny nadal są stałymi przykładami demo.
- Ustawienia aplikacji są osobnym ekranem pod ikoną koła zębatego. Konto, prywatność, powiadomienia i bezpieczeństwo mają widoczne statusy „Wkrótce”. Motyw pozostaje jasny.
- Zapis profilu odświeża też informacje o własnej ekipie w Wyjazdach i dane do porównań. Stan jest lokalny dla bieżącej sesji; restart przywraca przykładowy profil. Oznaczenie „Wersja demonstracyjna” zależy od `IS_DEMO_MODE` w `src/constants/app.ts`.
- Odkrywaj: krótki nagłówek, pasek filtrów oraz zwarte karty z przyciskiem „Zobacz wyjazd”. Termin, miejsce/region i wiek dzieci wybiera się w panelu od dołu. Dopiero „Pokaż wyniki” zatwierdza filtry; zamknięcie panelu odrzuca zmiany.
- Karty pokazują stałą, jawnie demonstracyjną ocenę zgodności, przedziały wieku dzieci oraz wspólne noce liczone z wybranego terminu. Przy braku terminu porównują przykładowe własne plany; nie sumują kilku pobytów.
- Szczegóły wyjazdu zawierają ilustrację, opis, informacje o grupie i wyjaśnienie porównania. Powrót do listy zachowuje filtry.
- Filtry zachowują się podczas zmiany zakładki. Pełne ponowne uruchomienie aplikacji resetuje stan.
- Wyszukiwanie ignoruje wielkość liter i polskie znaki. Filtry terminu, miejsca i wieku łączą się warunkiem AND; wybrane przedziały wieku — OR.
- Wspólny termin wymaga co najmniej jednej wspólnej nocy. Miejsce zamieszkania nie ogranicza wyników.
- Oba tryby wyszukiwania pokazują zarówno ustalone plany, jak i elastyczne obszary.

Terminy maj/czerwiec 2027 są stałymi przykładami, niezależnymi od daty urządzenia. Wyniki nie pochodzą z produkcyjnego algorytmu dopasowań.

## Struktura

- `src/app/` — główny stos Expo Router; `(tabs)/` zawiera pięć zakładek, a `trip/[id].tsx` szczegóły otwierane ponad nimi. Adresy zakładek pozostają bez zmian.
- `src/components/ui/` — wspólne elementy UI, typografia i ikony.
- `src/components/trips/` — karty wyjazdów i ilustracje.
- `src/constants/` — motywy, odstępy, typografia oraz zakładki.
- `src/data/mocks/` — jawnie fikcyjne grupy i plany.
- `src/features/discovery/` — czysta logika filtrów i stan bieżącej sesji.
- `src/features/profile/` — profil bieżącej sesji, formularze i walidacja; `edit-profile.tsx` i `settings.tsx` w `src/app/` zawierają osobne ekrany edycji i ustawień.
- `src/types/` — kontrakty domenowe.
- `scripts/discovery.test.mjs` — testy logiki na wbudowanym runnerze Node.

## Kontrole

```powershell
npm run lint
npm run typecheck
npm run test:discovery
npm run test:profile
npx expo install --check
npx expo export --platform android --output-dir .expo/export-android
```

Testy obejmują wspólne noce, zmianę czasu, łączenie filtrów, przedziały wieku, polskie znaki, oba tryby planowania, rozdzielenie miejsca zamieszkania od celu, reset bez modyfikacji danych, pierwszeństwo wybranego terminu, porównanie pojedynczego własnego planu i brak wymyślonych dopasowań wieku.

Weryfikacja obejmuje lint, TypeScript, 19 testów logiki (14 wyszukiwania i 5 profilu), zgodność zależności i eksport Androida oraz istniejącego podglądu webowego. Testy przeglądarkowe obejmują filtry, szczegóły, powrót do listy oraz profil: zapis, anulowanie, walidację, niezależność liczby dzieci od przedziałów wieku, edycję sekcji, preferencje, odświeżanie danych w innych zakładkach i ustawienia. Sprawdzono szerokość 320 px, tekst powiększony do 150% oraz zmniejszenie wysokości podglądu do 460 px. Nie wykonano testu na fizycznym telefonie ani emulatorze Androida.

Node może wyświetlić informacyjne ostrzeżenie `MODULE_TYPELESS_PACKAGE_JSON` podczas bezpośredniego uruchamiania testów TypeScript. Nie wymaga ono zmiany formatu modułów aplikacji.

## Szybki test na telefonie

1. Otwórz wszystkie pięć zakładek; sprawdź „wstecz” Androida oraz skróty na Start i Wiadomości.
2. W Odkrywaj otwórz **Filtry**, wybierz **21–24 maja**, wpisz **Pomorze**, zaznacz **7–9 lat**, a następnie **Pokaż wyniki**. Powinna zostać jedna propozycja z informacją o dwóch wspólnych nocach.
3. Przejdź do Profilu i wróć — filtry powinny pozostać.
4. Wybierz „Zobacz wyjazd”, sprawdź szczegóły i wróć do listy. Filtry powinny pozostać. Wybierz „Szukam pomysłu” i otwórz panel — zmienią się opisy pól.
5. W panelu wpisz **Atlantyda** i zatwierdź, sprawdź pusty stan i wybierz „Pokaż wszystkie propozycje” — wróci sześć wyników. Sprawdź też, że zamknięcie panelu bez zatwierdzenia odrzuca zmiany.
6. Sprawdź „Wkrótce” przy dodawaniu wyjazdu i zaproszeniach.
7. Sprawdź przewijanie do końca ekranów, otwartą klawiaturę i większy tekst systemowy. Włącz ciemny motyw telefonu — aplikacja powinna pozostać jasna.
8. W Profilu wybierz „Edytuj profil”. Zmień nazwę i zapisz — karta ekipy i Wyjazdy powinny pokazać nową nazwę. Zmień dane ponownie, ale wyjdź bez zapisu — poprzednia wersja powinna pozostać.
9. Otwórz każdą sekcję profilu i „Kogo chcemy poznać?”. Sprawdź zmianę preferencji, ustawienia pod kołem zębatym oraz powrót do profilu. Restart aplikacji powinien przywrócić przykładowe dane.

## Granice wersji demonstracyjnej

Tworzenie i edycja planów, konta użytkowników, zaproszenia, czat, onboarding i obsługa linków instalacyjnych pozostają kolejnymi etapami. Edycja profilu działa na danych lokalnych w bieżącej sesji. Aplikacja nie integruje backendu, map, GPS, płatności, analityki ani powiadomień.

Przeglądarkowy podgląd o wymiarach telefonu i poprawny eksport Androida nie zastępują testu fizycznego urządzenia w Expo Go.

## Stan zależności

Podczas wdrożenia `expo install --check` potwierdził zgodność z SDK 57. Audyt npm zgłosił 29 podatności (11 moderate, 18 high), obejmujących drzewo zależności Expo/React Native. Proponowane automatyczne naprawy zmieniają główne wersje frameworka; wymagają osobnego przeglądu kompatybilności. Nie uruchamiano `npm audit fix --force`.
