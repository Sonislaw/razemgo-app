# RazemGo

Osobne aplikacje **Dev i Preview**: identyfikatory, stan konfiguracji oraz sposób wydawania zmian opisano w [Środowiska](docs/ENVIRONMENTS.md). Preview zachowuje dotychczasowy backend; `.env.local` służy wyłącznie nowemu Dev, a `.env.preview.local` kontroli Preview.

## Supabase — konta, profile, wyjazdy i rozmowy

Samodzielny APK Androida dla testerów buduje profil **preview**: `npm run build:preview`. Działa bez Metro i Expo Go, korzysta z obecnej bazy testowej oraz środowiska Sentry `preview`. Konfiguracja EAS, kontrola przed buildem i scenariusz na dwóch telefonach: **[Wersja preview](docs/PREVIEW.md)**.

Aplikacja ma przygotowane logowanie Google i e-mail/hasło, potwierdzanie adresu, reset hasła, onboarding, zapis profilu i ustawienia konta. Wymaga konfiguracji projektu Supabase: **[instrukcja wdrożenia](supabase/README.md)** zawiera migracje, Google, SMTP, funkcję usuwania konta oraz development build Androida.

Domyślnie bez logowania dostępny jest ekran powitalny z pięcioma losowanymi przykładami. Prawdziwe konta zapisują profil oraz własne wyjazdy w Supabase. Kreator obsługuje szkic, publikację i edycję; menu pozwala wstrzymać lub wznowić poszukiwania, zakończyć, anulować, duplikować i usunąć plan. Zmiana zostaje potwierdzona po odpowiedzi serwera.

Odkrywaj i Start pobierają publiczne, aktualne ogłoszenia innych ekip. Filtry oraz sortowanie działają lokalnie na pobranych rekordach. Zgodność jest liczona z planów i preferencji; stałe przykładowe procenty pozostają jedynie na ekranie powitalnym. Kafelki mają wspólny komponent `TripListingCard`.

Migracja `202610240001_trips.sql` dodaje wyjazdy, walidację i RLS. Profile i preferencje pozostają prywatne; osobna funkcja udostępnia tylko jawne pola organizatora powiązane z publicznym ogłoszeniem. Szkice, prywatne, wstrzymane, zakończone i anulowane plany nie trafiają do Odkrywaj. Listy odświeżają się przy wejściu na ekran i powrocie aplikacji na pierwszy plan; błąd daje możliwość ponowienia.

Zaproszenia, rozmowy, wiadomości, odczyty, blokady i zgłoszenia zapisują się w Supabase. Akceptacja zaproszenia atomowo tworzy jedną rozmowę z kontekstem wyjazdu. Historia działa na drugim urządzeniu; powtórzona wysyłka używa tego samego klucza i nie duplikuje danych. Realtime powiadamia o zmianie skrzynki, a aplikacja pobiera wyłącznie dane uprawnionego uczestnika. Przy rozłączeniu działa okresowe odświeżanie oraz ponowienie ręczne.

Migracja `202610240003_messaging.sql` dodaje uprawnienia i funkcje skrzynki. Nowe konta zaczynają z pustą skrzynką. Zablokowanie kontaktu wstrzymuje wysyłanie po obu stronach i ukrywa wzajemne ogłoszenia. Zgłoszenia trafiają do panelu moderacji opisanego poniżej.

Powiadomienia push o nowych wiadomościach, zaproszeniach i ich akceptacji mają rejestr urządzeń, kolejkę serwerową, worker Expo, retry i receipts. Kliknięcie otwiera właściwy widok po odtworzeniu sesji. Firebase/FCM dla testowego Androida jest skonfigurowane w EAS. Push wymagają APK z obsługą `expo-notifications`; instalacja modułu natywnego i zmiana ikony wymagają nowego buildu. Konfiguracja i scenariusze telefonu: **[Push — instrukcja](supabase/PUSH.md)**.

Dzwonek na Start prowadzi do trwałej historii powiadomień, z filtrem nieodczytanych, stronicowaniem i oznaczaniem odczytu na wszystkich urządzeniach. Wiadomości i zaproszenia pozostają w historii także bez zgody na push. Nowe propozycje do własnych publicznych wyjazdów są wyliczane przy pobraniu historii, wyłącznie w aplikacji. W **Profil → Ustawienia** można osobno włączyć push wiadomości i zaproszeń dla całego konta; osobny przełącznik urządzenia nadal decyduje o danym telefonie. Migracja `202610240005_notification_center.sql` nie wymaga nowego APK ani nowych sekretów. Monitoring i moderacja są podłączone; bieżący etap to samodzielna wersja preview przed pilotażem.

```powershell
npm ci
# Skopiuj .env.example do .env.local i uzupełnij publiczne dane projektu Supabase.
npm run start:dev
```

Testy: `npm test`, `npm run lint`, `npm run typecheck`. Testy migracji i RLS wykonują się na lokalnym PostgreSQL w PGlite bez Dockera. Pełna weryfikacja Google, wysyłki e-maili i telefonu wymaga podłączonych usług.

Monitoring błędów JavaScript, logowania, operacji bazy i własnych Edge Functions jest podłączony do oddzielnych projektów Sentry aplikacji i backendu w środowisku testowym. Potwierdzono odbiór raportu z wdrożonej funkcji Supabase; powtórzenie kontroli: `node scripts/check-backend-monitoring.mjs`. Wysyłka jest wyłączona bez DSN, a raporty przechodzą przez ścisłą listę dozwolonych pól. Konfiguracja panelu, test diagnostyczny i zakres raportów: **[Monitoring](docs/MONITORING.md)**.

Niezależna funkcja `monitor-push` kontroluje kolejkę i harmonogram co 5 minut. Błędy konfiguracji, zaległości i nadmierne ponowienia tworzą incydenty w Sentry z trwałym limitem powtórzeń. Sentry Crons pilnuje także zatrzymania samej kontroli. Stan: `node scripts/check-push-health.mjs`. Progi, reguły e-mail i wdrożenie: **[Kontrola push](docs/PUSH_HEALTH.md)**.

Panel administracyjny jest dostępny pod `/admin` oraz w **Profil → Ustawienia** dla kont z rolą administratora. Obsługuje zgłoszenia rozmów i wyjazdów, statusy, podgląd zachowanych treści, ukrywanie ogłoszeń, blokowanie/odblokowanie kont i historię uzasadnionych decyzji. Dostęp i skutki moderacji egzekwuje baza, również dla istniejących sesji. Wejście lokalne: [localhost:8081/admin](http://localhost:8081/admin). Uprawnienia, wdrożenie i granice dostępu: **[Moderacja](docs/MODERATION.md)**.

## Dokumentacja wcześniejszego podglądu interfejsu

Poniższy opis dotyczy lokalnego podglądu przykładowych funkcji. Włącza go wyłącznie w development `EXPO_PUBLIC_ENABLE_DEMO=true`; nie opisuje źródeł danych prawdziwego konta.

Mobilna aplikacja do poznawania towarzyszy wspólnych wyjazdów. Pierwsza wersja interfejsu zawiera pięć zakładek: **Start, Odkrywaj, Wyjazdy, Wiadomości, Profil**.

Interfejs nie pokazuje oznaczeń wersji demonstracyjnej ani dopisków o przykładowych danych. Dane i stan nadal działają lokalnie jak wcześniej. `IS_DEMO_MODE` w `src/constants/app.ts` jest domyślnie wyłączone i steruje wyłącznie oznaczeniami oraz narzędziami scenariuszy opisanymi poniżej; nie zmienia źródła danych.

## Uruchomienie w Expo Go

Projekt używa **Expo SDK 58**, React Native 0.88, React 19.3 i Expo Router. Do pracy zalecany jest Node.js 24.3 lub nowszy z linii 24 (wbudowana obsługa TypeScript jest również używana w testach).

```powershell
cd C:\Users\dev\www\razemgo
npm ci
npx expo start
```

Otwórz Expo Go obsługujące SDK 58 na telefonie z Androidem i zeskanuj kod QR z terminala. Telefon i komputer powinny znajdować się w tej samej sieci. Klawisz `w` otwiera pomocniczy podgląd webowy. Klawisz `a` wymaga skonfigurowanego emulatora lub urządzenia Android. Po zmianie SDK uruchom `npx expo start --clear`, aby odświeżyć cache Metro. Komunikat o Expo Go dla SDK 58 i projekcie SDK 57 oznacza niezgodność głównych wersji — sama aktualizacja poprawki SDK 57 jej nie usuwa.

## Co działa

- Start jest krótkim panelem codziennego korzystania: powitanie z nazwą ekipy, akcje **Znajdź ekipę / Dodaj wyjazd** i jeden najbliższy rzeczywisty plan z bezpośrednim przejściem do szczegółów. Nie pokazuje szkiców, anulowanych ani zakończonych podróży jako nadchodzących; wstrzymany lub prywatny plan pozostaje rzeczywistym wyjazdem. Przy braku podróży proponuje pierwszy/kolejny plan albo dokończenie istniejącego szkicu.
- Start pokazuje maksymalnie trzy zwarte propozycje innych ekip. Lokalny dobór uwzględnia opublikowane własne plany, wspólne noce, region i preferencje; bez pasujących wyjazdów korzysta z zainteresowań profilu, a przy braku takich zgodności pokazuje jawne inspiracje. Pomija zablokowane ekipy, własną grupę, minione propozycje i duplikaty ekip. Przyczyny są konkretne; Start nie pokazuje procentowego rankingu. Wszystkie propozycje nadal pochodzą z danych demonstracyjnych.
- Nowe otrzymane zaproszenia i nieprzeczytane wiadomości mają osobne moduły na Start, widoczne wyłącznie przy dodatniej liczbie. Dzwonek otwiera odpowiedni widok Wiadomości i korzysta z tego samego licznika co dolna zakładka. Stan ładowania lub błędu skrzynki ma odrębny skrót do Wiadomości.
- Żółta karta „Wasz kierunek. Wasze towarzystwo.” jest na osobnym ekranie `/welcome`. Wariant nowego użytkownika ma rzeczywisty lokalny stan bez utworzonego profilu, krótką zachętę na Start i przejście do istniejącego edytora. Poprawny zapis tworzy profil lokalnie i odświeża Start; wyjście bez zapisu zachowuje wariant bez profilu. Pełny onboarding z trwałym oznaczeniem pierwszego uruchomienia pozostaje kolejnym etapem.
- Przycisk **Demo** na Start otwiera warianty: wyjazdy i zaproszenia, nowy użytkownik z ekranem powitalnym, profil bez wyjazdów, sam szkic i nieprzeczytane rozmowy. Wybór zastępuje lokalny profil, plany, skrzynkę oraz filtry i jest dostępny tylko w trybie demonstracyjnym. Ustawienia i edycja profilu otwarte ze Start wracają na Start; wejścia z Profilu zachowują dotychczasowy powrót.
- Pięć zakładek, skróty pomiędzy ekranami oraz historia zakładek dla przycisku „wstecz”.
- Domyślny jasny motyw niezależny od ustawień urządzenia, wspólne tokeny i lokalne ilustracje. Paleta ciemna pozostaje przygotowana pod przyszły wybór motywu w aplikacji.
- Dolna nawigacja ma własne ikony: namiot, kompas, przyczepę, dymek z ogniskiem i podróżnika z szelkami plecaka. Natywne zakładki i web używają tych samych grafik, z osobnym kolorem i mocniejszym obrysem aktywnego stanu. Źródła SVG i obrazy PNG w skalach 1x/2x/3x są w `assets/icons/navigation/`; polecenie `npm exec --yes --package=sharp -- node scripts/render-navigation-icons.cjs` odtwarza PNG po edycji SVG, bez dodawania zależności aplikacji.
- Sześć fikcyjnych propozycji, dwa początkowe własne plany oraz przykładowy profil. Własne wyjazdy można dodawać i zmieniać lokalnie.
- Profil: kompaktowa karta ekipy, edycja nazwy, okolicy, liczby dorosłych i dzieci, przybliżonych przedziałów wieku, sposobów podróżowania oraz zainteresowań. Każda sekcja otwiera swoją część edytora; wyjście bez zapisu odrzuca zmiany.
- „Kogo chcemy poznać?” przechowuje osobne preferencje dotyczące grup i wieku dzieci. Preferowany wiek służy do objaśniania zgodności w Odkrywaj; jawnie wybrany filtr wieku ma pierwszeństwo. Procentowe oceny nadal są stałymi przykładami demo.
- Ustawienia aplikacji są osobnym ekranem pod ikoną koła zębatego. Konto, prywatność, powiadomienia i bezpieczeństwo mają widoczne statusy „Wkrótce”. Motyw pozostaje jasny.
- Zapis profilu odświeża dane do porównań i ustawienia początkowe nowego wyjazdu. Sposób podróżowania i preferencje zapisane w konkretnym planie pozostają niezależne. Stan jest lokalny dla bieżącej sesji; restart przywraca przykładowy profil. Oznaczenie „Wersja demonstracyjna” zależy od `IS_DEMO_MODE` w `src/constants/app.ts`.
- Wyjazdy: krótki nagłówek **Moje wyjazdy**, działający przycisk **Dodaj**, kompaktowe karty bez powtarzania profilu ekipy oraz podział **Aktywne / Archiwum**. Aktywne są sortowane według najbliższego terminu, archiwum od najnowszego. Szkice bez terminu trafiają na koniec aktywnych. Filtry nazwy, miejsca i terminu otwierają się w panelu; ich kategorie łączą się warunkiem AND.
- Typ planu (**Mam plan / Szukam pomysłu**) jest niezależny od statusu: **Szkic, Szukamy towarzystwa, Wstrzymany, Zakończony, Anulowany**. Opublikowane lub wstrzymane plany po terminie powrotu są pokazywane jako zakończone, według daty urządzenia. Szkice nie są automatycznie kończone.
- Kreator dodawania i edycji ma trzy kroki: typ i termin, kierunek i podróżowanie, preferencje i podgląd. Termin wybiera się jako zakres w kalendarzu. Stały dolny pasek udostępnia przejście dalej i zapis szkicu; niepełny szkic nie wymaga dat, miejsca ani opisu. Publikacja wymaga poprawnego pobytu z co najmniej jedną nocą, przyszłego powrotu, wybranej lokalizacji, sposobu podróżowania i opisu wyjazdu. Opis jest wymagany w obu trybach, przy przejściu z drugiego kroku, publikacji i edycji: minimum 20 znaków po pominięciu zbędnych spacji, maksimum 1000 znaków. Pole pokazuje licznik; krótki lub pusty opis można zachować w szkicu.
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
- Wspólny termin wymaga co najmniej jednej wspólnej nocy.
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
- `src/features/home/` — kompaktowe podglądy i warianty demonstracyjne Startu; dobór propozycji jest czystą funkcją w `features/discovery/filter-trips.ts`, a wybór najbliższego planu w `features/trips/own-trips-state.ts`. `TripThumbnail` jest wspólny dla własnych wyjazdów i Startu.
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
npm run test:home
npx expo install --check
npx expo export --platform android --output-dir .expo/export-android
```

Testy obejmują wspólne noce, zmianę czasu, łączenie filtrów, przedziały wieku, polskie znaki, oba tryby planowania, filtrowanie według celu wyjazdu, reset bez modyfikacji danych, pierwszeństwo wybranego terminu, porównanie pojedynczego własnego planu i brak wymyślonych dopasowań wieku.

Kontrole logiki obejmują 50 testów: 14 wyszukiwania, 5 profilu, 12 wiadomości, 11 własnych wyjazdów i 8 Startu. Testy Startu sprawdzają najbliższy i trwający wyjazd, statusy, prawdziwe wspólne noce, elastyczność bez wydłużania pobytu, preferencje, inspiracje bez wymyślonej zgodności, blokady, limit i unikalność propozycji oraz brak modyfikacji danych. Testy wyjazdów obejmują szkice, publikację, daty, prywatność, archiwum, kopiowanie, filtry, usuwanie i reset. Testy wiadomości sprawdzają zgodę na kontakt, brak duplikatów, liczniki, ponawianie, blokady i lokalne zgłoszenia.

Weryfikacja komputerowa obejmuje lint, TypeScript, testy logiki, zgodność zależności i eksport Androida oraz pomocniczego podglądu webowego. Testy przeglądarkowe obejmują wyszukiwanie, profil, Wiadomości oraz cały przepływ własnego wyjazdu: szkic → publikacja → edycja → wyszukiwanie → powiązane zaproszenie → akceptacja → czat. Sprawdzono też zarządzanie statusami, potwierdzenia, filtry, archiwum, pusty stan i reset. Dwie pełne karty własnych planów mieszczą się w podglądzie 390 × 844 px. Sprawdzono szerokość 320 px, tekst powiększony do 150% oraz stały pasek kreatora przy wysokości 460 px. Nie wykonano testu na fizycznym telefonie ani emulatorze Androida; zachowanie natywnej klawiatury i przycisku „wstecz” wymaga sprawdzenia w Expo Go.

Sprawdzenia Startu obejmują oba główne skróty, szczegóły własnego i proponowanego planu, kryteria przekazywane do Odkrywaj, zmianę najbliższego wyjazdu po anulowaniu, odczyt zaproszeń i wiadomości, pusty stan, szkic, utworzenie profilu i powroty do właściwego ekranu. W podglądzie 390 × 844 px całe powitanie, akcje, najbliższy plan oraz pierwsza propozycja mieszczą się przed dolną nawigacją; przy 320 × 568 px dane najbliższego planu są widoczne bez przewijania. Sprawdzono większy tekst, długą nazwę ekipy, ekran powitalny i pozostawanie przy jasnym motywie mimo ciemnych ustawień przeglądarki.

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
15. Na Start wybierz **Znajdź ekipę**, sprawdź kryteria najbliższego wyjazdu i wróć. Otwórz najbliższy plan oraz krótką propozycję. Odrzuć otrzymane zaproszenia — ich moduł powinien zniknąć. Odczyt rozmowy powinien zmniejszyć licznik wiadomości na Start.
16. W **Demo** na Start sprawdź brak wyjazdów, sam szkic i nowego użytkownika. W nowym wariancie użyj ekranu powitalnego lub „Rozejrzyj się”, uzupełnij profil i zapisz. Start powinien pokazać nazwę ekipy i zachętę do pierwszego wyjazdu. Utwórz plan, wróć na Start i sprawdź aktualny najbliższy wyjazd. Restart przywraca domyślne demo z profilem i dwoma planami.

## Granice wersji demonstracyjnej

Konta użytkowników, pełny onboarding z trwałym stanem pierwszego uruchomienia i obsługa linków instalacyjnych pozostają kolejnymi etapami. Własne plany, profil, zaproszenia, czat, blokady i zgłoszenia działają wyłącznie lokalnie w bieżącej sesji. Restart przywraca fikcyjne dane. Własny opublikowany plan nie jest wysyłany do serwera ani dodawany do sześciu propozycji innych ekip w Odkrywaj. Nie ma wymiany wiadomości z innymi urządzeniami, rzeczywistej moderacji, weryfikacji dorosłości ani powiadomień push. Aplikacja nie integruje backendu, map, GPS, płatności ani analityki.

Przeglądarkowy podgląd o wymiarach telefonu i poprawny eksport Androida nie zastępują testu fizycznego urządzenia w Expo Go.

## Stan zależności

Zależności są dopasowane do SDK 58 przez Expo CLI. Przy aktualizacji należy uruchomić `npx expo install --check` i `npx expo-doctor`. Natywne zakładki korzystają ze stabilnego `expo-router/native-tabs`, a referencje komponentów z typów `*Instance` React Native 0.88.

Pomocniczy podgląd webowy działa jako aplikacja kliencka (`web.output: "single"`) z synchronicznie ładowanymi ekranami (`asyncRoutes.web: false`). Omija to błąd modułów w renderowaniu serwerowym SDK 58 przy wielokrotnym otwieraniu bezpośrednich linków. Panele webowe stosują odstępy safe area przez CSS; Android i iOS nadal korzystają z natywnych obszarów bezpiecznych.
