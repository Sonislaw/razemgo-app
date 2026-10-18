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
- Sześć fikcyjnych propozycji, dwa początkowe własne plany oraz przykładowy profil. Własne wyjazdy można dodawać i zmieniać lokalnie.
- Profil: kompaktowa karta ekipy, edycja nazwy, okolicy, liczby dorosłych i dzieci, przybliżonych przedziałów wieku, sposobów podróżowania oraz zainteresowań. Każda sekcja otwiera swoją część edytora; wyjście bez zapisu odrzuca zmiany.
- „Kogo chcemy poznać?” przechowuje osobne preferencje dotyczące grup i wieku dzieci. Preferowany wiek służy do objaśniania zgodności w Odkrywaj; jawnie wybrany filtr wieku ma pierwszeństwo. Procentowe oceny nadal są stałymi przykładami demo.
- Ustawienia aplikacji są osobnym ekranem pod ikoną koła zębatego. Konto, prywatność, powiadomienia i bezpieczeństwo mają widoczne statusy „Wkrótce”. Motyw pozostaje jasny.
- Zapis profilu odświeża dane do porównań i ustawienia początkowe nowego wyjazdu. Sposób podróżowania i preferencje zapisane w konkretnym planie pozostają niezależne. Stan jest lokalny dla bieżącej sesji; restart przywraca przykładowy profil. Oznaczenie „Wersja demonstracyjna” zależy od `IS_DEMO_MODE` w `src/constants/app.ts`.
- Wyjazdy: krótki nagłówek **Moje wyjazdy**, działający przycisk **Dodaj**, kompaktowe karty bez powtarzania profilu ekipy oraz podział **Aktywne / Archiwum**. Aktywne są sortowane według najbliższego terminu, archiwum od najnowszego. Szkice bez terminu trafiają na koniec aktywnych. Filtry nazwy, miejsca i terminu otwierają się w panelu; ich kategorie łączą się warunkiem AND.
- Typ planu (**Mam plan / Szukam pomysłu**) jest niezależny od statusu: **Szkic, Szukamy towarzystwa, Wstrzymany, Zakończony, Anulowany**. Opublikowane lub wstrzymane plany po terminie powrotu są pokazywane jako zakończone, według daty urządzenia. Szkice nie są automatycznie kończone.
- Kreator dodawania i edycji ma trzy kroki: typ i termin, kierunek i podróżowanie, preferencje i podgląd. Terminy można wybrać z kalendarza, wpisać jako DD.MM.RRRR albo użyć przykładowych dat. Stały dolny pasek udostępnia przejście dalej i zapis szkicu; niepełny szkic nie wymaga dat ani miejsca. Publikacja wymaga poprawnego pobytu z co najmniej jedną nocą, przyszłego powrotu, nazwy, miejsca/obszaru, regionu i sposobu podróżowania.
- Kreator zapisuje elastyczność dat, opis, zainteresowania, sposób podróżowania, preferowane grupy i przedziały wieku oraz widoczność. Plan prywatny jest wstrzymany. Zapis edycji zachowuje wstrzymanie lub status archiwalny; wznowienie poszukiwań wymaga osobnej akcji i udostępnia plan społeczności. „Publikacja” oznacza w tym demo wyłącznie zmianę stanu lokalnego.
- Szczegóły własnego planu pod `/trips/[id]` zawierają ilustrację, opis, preferencje, liczbę rzeczywistych lokalnych propozycji, powiązane zaproszenia i zaakceptowane ekipy z przejściem do czatu. Dotychczasowe przykładowe zaproszenia nad morze i jezioro mają jawne powiązania z własnymi planami; nie przypisujemy ekip na podstawie zbliżonego terminu.
- „Znajdź towarzystwo” przenosi do Odkrywaj termin, region i preferencje danego planu. Elastyczność oznacza przesunięcie całego pobytu o maksymalnie wybraną liczbę dni; nie wydłuża go ani nie zawyża wspólnych nocy. Nowe zaproszenie wysłane w tym kontekście jest przypisywane do własnego wyjazdu. Szkice, plany wstrzymane i archiwalne nie rozpoczynają nowych poszukiwań.
- Menu wyjazdu pozwala edytować, wstrzymywać/wznawiać poszukiwania, duplikować jako niezależny prywatny szkic, kończyć, anulować i usuwać. Usunięcie, anulowanie i ręczne zakończenie wymagają potwierdzenia. Rozmowy pozostają po usunięciu planu; duplikat nie przejmuje jego kontaktów. Po zapisie lista pokazuje potwierdzenie z bezpośrednim przejściem do wyjazdu, a Start i porównania korzystają z aktualnego stanu planów.
- Odkrywaj: krótki nagłówek, pasek filtrów oraz zwarte karty z przyciskiem „Zobacz wyjazd”. Termin, miejsce/region i wiek dzieci wybiera się w panelu od dołu. Dopiero „Pokaż wyniki” zatwierdza filtry; zamknięcie panelu odrzuca zmiany.
- Karty pokazują stałą, jawnie demonstracyjną ocenę zgodności, przedziały wieku dzieci oraz wspólne noce liczone z wybranego terminu. Przy braku terminu porównują przykładowe własne plany; nie sumują kilku pobytów.
- Szczegóły wyjazdu zawierają ilustrację, opis, informacje o grupie i wyjaśnienie porównania. Powrót do listy zachowuje filtry.
- Wiadomości: kompaktowy nagłówek i dwa widoki **Rozmowy / Zaproszenia**. Zaproszenia dzielą się na otrzymane i wysłane, z widocznymi statusami. Początkowo skrzynka zawiera dwa oczekujące zaproszenia otrzymane, jedno wysłane i jedno odrzucone.
- Akceptacja zaproszenia tworzy rozmowę; odrzucenie nie wymaga przyczyny. Wysłane zaproszenie można wycofać. Ze szczegółów innego wyjazdu można wysłać lokalne zaproszenie, bez duplikowania otwartego kontaktu.
- Rozmowy mają wiersze wysokości 88 dp przy standardowym tekście, nazwę powiązanego wyjazdu, podgląd ostatniej wiadomości i licznik nieprzeczytanych. Większy tekst może zwiększyć wysokość. Licznik dolnej zakładki sumuje nieprzeczytane wiadomości i oczekujące otrzymane zaproszenia; otwarcie czatu oznacza wiadomości jako przeczytane.
- Czat zawiera przypięty kierunek i termin wyjazdu, daty, dymki, lokalne statusy wysłania oraz pole pisania nad klawiaturą. Nie otwiera kontaktu przed akceptacją i nie dodaje do wiadomości danych dzieci.
- Menu rozmowy udostępnia lokalne blokowanie, odblokowanie i przykładowe zgłoszenie z wyborem powodu. Osobny ekran zasad pokazuje zablokowane ekipy i lokalne zgłoszenia. **Zgłoszenia nie trafiają do moderatora; demo nie weryfikuje wieku ani tożsamości.**
- Mały przycisk **Demo** otwiera scenariusze: początkowe zaproszenia, trzy rozmowy z nieprzeczytanymi wiadomościami, pusta skrzynka, symulowane ładowanie i błąd. Można też zasymulować błąd wysyłania, przychodzącą wiadomość oraz akceptację wysłanego zaproszenia przez drugą ekipę. Ponowienie nie duplikuje wiadomości. Wybór scenariusza zastępuje lokalny stan skrzynki.
- Filtry zachowują się podczas zmiany zakładki. Pełne ponowne uruchomienie aplikacji resetuje stan.
- Wyszukiwanie ignoruje wielkość liter i polskie znaki. Filtry terminu, miejsca i wieku łączą się warunkiem AND; wybrane przedziały wieku — OR.
- Wspólny termin wymaga co najmniej jednej wspólnej nocy. Miejsce zamieszkania nie ogranicza wyników.
- Oba tryby wyszukiwania pokazują zarówno ustalone plany, jak i elastyczne obszary.

Terminy maj/czerwiec 2027 są stałymi przykładami, niezależnymi od daty urządzenia. Wyniki nie pochodzą z produkcyjnego algorytmu dopasowań.

## Struktura

- `src/app/` — główny stos Expo Router; `(tabs)/` zawiera pięć zakładek, `trip/[id].tsx` szczegóły cudzych wyjazdów, `trips/[id].tsx` szczegóły własnych, a `trip-editor.tsx` wspólny kreator dodawania i edycji. Adresy zakładek pozostają bez zmian.
- `src/components/ui/` — wspólne elementy UI, typografia i ikony.
- `src/components/trips/` — karty wyjazdów i ilustracje.
- `src/constants/` — motywy, odstępy, typografia oraz zakładki.
- `src/data/mocks/` — jawnie fikcyjne grupy i plany.
- `src/features/discovery/` — czysta logika filtrów i stan bieżącej sesji.
- `src/features/profile/` — profil bieżącej sesji, formularze i walidacja; `edit-profile.tsx` i `settings.tsx` w `src/app/` zawierają osobne ekrany edycji i ustawień.
- `src/features/messaging/` — reducer skrzynki, lokalny kontekst, panele demo, zaproszenia i opcje bezpieczeństwa. `src/app/chat/[id].tsx` zawiera czat, a `messaging-safety.tsx` zasady i blokady.
- `src/features/trips/` — stan własnych planów, statusy, walidacja, kalendarz, filtry i menu zarządzania. Wyjazdy i Odkrywaj korzystają ze wspólnej obudowy `CompactTripCard`; panele używają wspólnego `BottomSheet`.
- `src/types/` — kontrakty domenowe.
- `scripts/discovery.test.mjs` — testy logiki na wbudowanym runnerze Node.

## Kontrole

```powershell
npm run lint
npm run typecheck
npm run test:discovery
npm run test:profile
npm run test:messaging
npm run test:trips
npx expo install --check
npx expo export --platform android --output-dir .expo/export-android
```

Testy obejmują wspólne noce, zmianę czasu, łączenie filtrów, przedziały wieku, polskie znaki, oba tryby planowania, rozdzielenie miejsca zamieszkania od celu, reset bez modyfikacji danych, pierwszeństwo wybranego terminu, porównanie pojedynczego własnego planu i brak wymyślonych dopasowań wieku.

Kontrole logiki obejmują 42 testy: 14 wyszukiwania, 5 profilu, 12 wiadomości i 11 własnych wyjazdów. Testy wyjazdów sprawdzają szkice i publikację, poprawność dat, zmianę typu, niezależność statusu, prywatność, archiwum, kopiowanie bez modyfikacji źródła, łączenie filtrów, przesuwanie pobytu bez dodawania nocy oraz usuwanie i reset. Testy wiadomości obejmują zgodę na kontakt, brak duplikatów, odrzucanie i wycofywanie, liczniki, ponawianie wysłania, blokady i lokalne zgłoszenia.

Weryfikacja komputerowa obejmuje lint, TypeScript, testy logiki, zgodność zależności i eksport Androida oraz pomocniczego podglądu webowego. Testy przeglądarkowe obejmują wyszukiwanie, profil, Wiadomości oraz cały przepływ własnego wyjazdu: szkic → publikacja → edycja → wyszukiwanie → powiązane zaproszenie → akceptacja → czat. Sprawdzono też zarządzanie statusami, potwierdzenia, filtry, archiwum, pusty stan i reset. Dwie pełne karty własnych planów mieszczą się w podglądzie 390 × 844 px. Sprawdzono szerokość 320 px, tekst powiększony do 150% oraz stały pasek kreatora przy wysokości 460 px. Nie wykonano testu na fizycznym telefonie ani emulatorze Androida; zachowanie natywnej klawiatury i przycisku „wstecz” wymaga sprawdzenia w Expo Go.

Node może wyświetlić informacyjne ostrzeżenie `MODULE_TYPELESS_PACKAGE_JSON` podczas bezpośredniego uruchamiania testów TypeScript. Nie wymaga ono zmiany formatu modułów aplikacji.

## Szybki test na telefonie

1. Otwórz wszystkie pięć zakładek; sprawdź „wstecz” Androida oraz skróty na Start i Wiadomości.
2. W Odkrywaj otwórz **Filtry**, wybierz **21–24 maja**, wpisz **Pomorze**, zaznacz **7–9 lat**, a następnie **Pokaż wyniki**. Powinna zostać jedna propozycja z informacją o dwóch wspólnych nocach.
3. Przejdź do Profilu i wróć — filtry powinny pozostać.
4. Wybierz „Zobacz wyjazd”, sprawdź szczegóły i wróć do listy. Filtry powinny pozostać. Wybierz „Szukam pomysłu” i otwórz panel — zmienią się opisy pól.
5. W panelu wpisz **Atlantyda** i zatwierdź, sprawdź pusty stan i wybierz „Pokaż wszystkie propozycje” — wróci sześć wyników. Sprawdź też, że zamknięcie panelu bez zatwierdzenia odrzuca zmiany.
6. W Wyjazdach wybierz „Dodaj”, zapisz niepełny szkic, a następnie dokończ go w kreatorze i opublikuj. Wyjazd powinien pojawić się na liście z potwierdzeniem zapisu. Sprawdź edycję, drugi tryb planowania i prywatny plan.
7. Sprawdź przewijanie do końca ekranów, otwartą klawiaturę i większy tekst systemowy. Włącz ciemny motyw telefonu — aplikacja powinna pozostać jasna.
8. W Profilu wybierz „Edytuj profil”. Zmień nazwę i zapisz — karta ekipy powinna pokazać nową nazwę. Zmień dane ponownie, ale wyjdź bez zapisu — poprzednia wersja powinna pozostać. Dane istniejących wyjazdów powinny zachować swoje ustawienia.
9. Otwórz każdą sekcję profilu i „Kogo chcemy poznać?”. Sprawdź zmianę preferencji, ustawienia pod kołem zębatym oraz powrót do profilu. Restart aplikacji powinien przywrócić przykładowe dane.
10. W Wiadomościach wybierz **Demo → 3 rozmowy**. Otwórz rozmowę z dwiema nieprzeczytanymi wiadomościami. Licznik powinien spaść z 3 do 1. Sprawdź powrót systemowy, przypięty wyjazd i pole pisania przy otwartej klawiaturze.
11. W panelu Demo czatu włącz błąd wysyłania. Napisz wiadomość, wyłącz symulację i wybierz „Ponów wysyłanie”. Z menu rozmowy zgłoś konto i zablokuj ekipę; odblokuj ją na ekranie zasad. Sprawdź też pustą skrzynkę, ładowanie i błąd z przyciskiem ponowienia.
12. Z Odkrywaj otwórz wyjazd grupy bez aktualnego zaproszenia, np. „Słońce, plaża i planszówki”. Wyślij zaproszenie. W Wiadomościach pojawi się ono w Wysłanych; panel Demo pozwala zasymulować jego akceptację.
13. Z menu własnego planu wstrzymaj i wznów poszukiwania, skopiuj go, a następnie sprawdź anulowanie, zakończenie i usuwanie z potwierdzeniem. Kopia powinna być prywatnym szkicem bez przejętych ekip. Użyj filtrów miejsca i terminu; po usunięciu wszystkich aktywnych planów sprawdź zachętę do utworzenia pierwszego.
14. W szczegółach „Nasz weekend nad morzem” wybierz „Znajdź towarzystwo”. Kryteria w Odkrywaj powinny odpowiadać temu wyjazdowi. Zaakceptuj jego przykładowe zaproszenie w Wiadomościach i wróć do szczegółów — powinna pojawić się jedna zaakceptowana ekipa z przyciskiem rozmowy.

## Granice wersji demonstracyjnej

Konta użytkowników, onboarding i obsługa linków instalacyjnych pozostają kolejnymi etapami. Własne plany, profil, zaproszenia, czat, blokady i zgłoszenia działają wyłącznie lokalnie w bieżącej sesji. Restart przywraca fikcyjne dane. Własny opublikowany plan nie jest wysyłany do serwera ani dodawany do sześciu propozycji innych ekip w Odkrywaj. Nie ma wymiany wiadomości z innymi urządzeniami, rzeczywistej moderacji, weryfikacji dorosłości ani powiadomień push. Aplikacja nie integruje backendu, map, GPS, płatności ani analityki.

Przeglądarkowy podgląd o wymiarach telefonu i poprawny eksport Androida nie zastępują testu fizycznego urządzenia w Expo Go.

## Stan zależności

Podczas wdrożenia `expo install --check` potwierdził zgodność z SDK 57. Audyt npm zgłosił 29 podatności (11 moderate, 18 high), obejmujących drzewo zależności Expo/React Native. Proponowane automatyczne naprawy zmieniają główne wersje frameworka; wymagają osobnego przeglądu kompatybilności. Nie uruchamiano `npm audit fix --force`.
