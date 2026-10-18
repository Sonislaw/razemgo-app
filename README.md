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
- Jasny i ciemny motyw zgodny z ustawieniami urządzenia, wspólne tokeny i lokalne ilustracje.
- Sześć fikcyjnych propozycji, dwa własne plany oraz przykładowy profil.
- Odkrywaj: zmiana trybu, wybór terminu, wyszukiwanie miejsca/regionu, przedziały wieku dzieci, licznik wyników i reset.
- Filtry zachowują się podczas zmiany zakładki. Pełne ponowne uruchomienie aplikacji resetuje stan.
- Wyszukiwanie ignoruje wielkość liter i polskie znaki. Filtry terminu, miejsca i wieku łączą się warunkiem AND; wybrane przedziały wieku — OR.
- Wspólny termin wymaga co najmniej jednej wspólnej nocy. Miejsce zamieszkania nie ogranicza wyników.
- Oba tryby wyszukiwania pokazują zarówno ustalone plany, jak i elastyczne obszary.

Terminy maj/czerwiec 2027 są stałymi przykładami, niezależnymi od daty urządzenia. Wyniki nie pochodzą z produkcyjnego algorytmu dopasowań.

## Struktura

- `src/app/` — ekrany i główny layout Expo Router.
- `src/components/ui/` — wspólne elementy UI, typografia i ikony.
- `src/components/trips/` — karty wyjazdów i ilustracje.
- `src/constants/` — motywy, odstępy, typografia oraz zakładki.
- `src/data/mocks/` — jawnie fikcyjne grupy i plany.
- `src/features/discovery/` — czysta logika filtrów i stan bieżącej sesji.
- `src/types/` — kontrakty domenowe.
- `scripts/discovery.test.mjs` — testy logiki na wbudowanym runnerze Node.

## Kontrole

```powershell
npm run lint
npm run typecheck
npm run test:discovery
npx expo install --check
npx expo export --platform android --output-dir .expo/export-android
```

Testy obejmują wspólne noce, zmianę czasu, łączenie filtrów, przedziały wieku, polskie znaki, oba tryby planowania, rozdzielenie miejsca zamieszkania od celu oraz reset bez modyfikacji danych.

Weryfikacja wdrożenia: lint, TypeScript, 10 testów logiki, zgodność zależności i eksport Androida zakończyły się powodzeniem. Metro uruchomiło aplikację i zwróciło manifest Androida dla SDK 57. Automatyczny test przeglądarkowy sprawdził pięć zakładek, skróty, filtry, ich zachowanie po zmianie zakładki i reset po przeładowaniu — bez błędów JavaScript. Oceniono również podglądy przy szerokości 390 i 320 px, oba motywy oraz tekst powiększony do 150%. Nie wykonano testu na fizycznym telefonie ani emulatorze Androida.

Node może wyświetlić informacyjne ostrzeżenie `MODULE_TYPELESS_PACKAGE_JSON` podczas bezpośredniego uruchamiania testów TypeScript. Nie wymaga ono zmiany formatu modułów aplikacji.

## Szybki test na telefonie

1. Otwórz wszystkie pięć zakładek; sprawdź „wstecz” Androida oraz skróty na Start i Wiadomości.
2. W Odkrywaj wybierz **21–24 maja**, wpisz **Pomorze**, zaznacz **7–9 lat**. Powinna zostać jedna propozycja z informacją o dwóch wspólnych nocach.
3. Przejdź do Profilu i wróć — filtry powinny pozostać.
4. Wybierz „Szukam pomysłu”: zmieni się opis pola i poszukiwania.
5. Wpisz **Atlantyda**, sprawdź pusty stan i wybierz „Pokaż wszystkie propozycje” — wróci sześć wyników.
6. Sprawdź „Wkrótce” przy dodawaniu wyjazdu, zaproszeniach i edycji profilu.
7. Sprawdź przewijanie do końca ekranów, otwartą klawiaturę, większy tekst systemowy i oba motywy.

## Granice wersji demonstracyjnej

Tworzenie i edycja planów, profile kont, zaproszenia, czat, onboarding i obsługa linków instalacyjnych pozostają kolejnymi etapami. Aplikacja nie integruje backendu, map, GPS, płatności, analityki ani powiadomień. Nie przechowuje rzeczywistych danych rodzin.

Przeglądarkowy podgląd o wymiarach telefonu i poprawny eksport Androida nie zastępują testu fizycznego urządzenia w Expo Go.

## Stan zależności

Podczas wdrożenia `expo install --check` potwierdził zgodność z SDK 57. Audyt npm zgłosił 29 podatności (11 moderate, 18 high), obejmujących drzewo zależności Expo/React Native. Proponowane automatyczne naprawy zmieniają główne wersje frameworka; wymagają osobnego przeglądu kompatybilności. Nie uruchamiano `npm audit fix --force`.
