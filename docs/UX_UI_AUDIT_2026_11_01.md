# Analiza UX/UI RazemGo — 1.11.2026

**Aktualizacja po analizie:** trzy pierwsze zalecenia zostały wdrożone w kodzie
Dev. Szczegóły i weryfikację opisuje [raport zmian](UX_FIRST_IMPROVEMENTS_2026_11_01.md).
Poniższe obserwacje i zrzuty przedstawiają stan sprzed tych poprawek.

Punkt 4 uzupełniono o otwieranie wyjazdu zdjęciem i tytułem, z zachowaniem
pozycji listy po powrocie. Zgodnie z decyzją użytkownika wielkość nagłówka
i wygląd karty pozostają takie same; zmniejszenie ich nie jest częścią poprawki.

Wdrożono też punkty 6 i 8: podpisy pod ilustracjami w wyborze transportu oraz
hierarchię menu „Zarządzaj wyjazdem”. Edycja ma główny przycisk, zakończenie
i anulowanie osobną grupę z opisami, a usuwanie jest oddzielone na dole
i oznaczone czerwonym tekstem oraz koszem.

Największą słabością jest hierarchia działań: użytkownik ogląda dużo treści,
zanim zobaczy możliwość otwarcia wyjazdu lub skontaktowania się z ekipą.
Druga istotna grupa problemów dotyczy edycji: utraty niezapisanych zmian profilu
oraz długości i obsługi błędów formularza wyjazdu.

Analiza dotyczy kodu 1.4.0, commit `a910b13`, po ujednoliceniu podglądu wyjazdu
z kartą Odkrywaj. Obejmuje przegląd kodu i interaktywną inspekcję webowej wersji
mobilnej: przede wszystkim 390 × 844 px, dodatkowo Odkrywaj 320 × 800 px.
Zebrano 31 ujęć ekranów i stanów, obejmujących wejście, rejestrację, onboarding,
Start, wyjazdy, filtry, szczegóły, kontakt, profile, ustawienia, rozmowy i puste listy.

Wykorzystano izolowane dane testowe i datę 24.10.2026. Podane liczby opisują
te scenariusze, nie rzeczywistą liczbę ogłoszeń ani zachowanie użytkowników Dev.
Nie wykonywano zmian danych hostowanego backendu. To ocena ekspercka,
bez badań z użytkownikami i pomiarów konwersji. Klawiatura systemowa, TalkBack,
większy rozmiar tekstu i fizyczny telefon wymagają osobnego sprawdzenia.

Priorytet **P1** oznacza utratę pracy lub utrudnienie głównego zadania.
**P2** oznacza problem czytelności, spójności lub dodatkowy wysiłek.
Wnioski o wpływie na konwersję są hipotezami; opisane zachowania i wymiary
sprawdzono w interfejsie lub kodzie.

| Priorytet | Najsłabsze miejsce | Zalecany kierunek |
| --- | --- | --- |
| P1 | Kontakt z ekipy na szczegółach wyjazdu dopiero na dole | Stały przycisk kontaktu i wcześniejsza prezentacja organizatora |
| P1 | Wyjście z edycji profilu odrzuca zmiany bez pytania | Ochrona niezapisanych zmian, spójna z kreatorem wyjazdu |
| P1 | Drugi krok formularza jest długi, a błąd odsyła na początek | Najpierw pola wymagane, zwijane dodatki, błędy przy polach |
| P1 | Pierwsza karta w Odkrywaj nie pokazuje przycisku otwarcia bez przewinięcia; nagłówek nie reaguje na kliknięcie | Przewidywalne otwieranie karty, mniejszy nagłówek i oszczędniejsza prezentacja |
| P2 | Pusta baza wygląda jak nietrafione filtry | Osobne komunikaty dla braku ogłoszeń i braku wyników filtrowania |
| P2 | Wybór transportu opiera się wyłącznie na obrazkach | Widoczne podpisy przy każdej opcji |
| P2 | „Propozycje”, „wyjazdy” i dawne „preferencje” mieszają znaczenia | Jedno słownictwo dla przeglądania i jawnych filtrów |
| P2 | Sześć równorzędnych akcji zarządzania wyjazdem | Hierarchia działań i wyraźne oddzielenie usuwania |
| P2 | Białe cyfry na pomarańczowych licznikach mają słaby kontrast | Ciemniejszy tekst lub ciemniejsze tło licznika |

## 1. Kontakt jest schowany pod szczegółami — P1

Na szczegółach przykładowego wyjazdu przycisk „Zaproś do kontaktu” zaczynał
się na wysokości **1602 px** od początku treści, przy ekranie wysokości 844 px.
Przed nim znajdują się ilustracja, termin, lokalizacja, opis, mapa, skład wyjazdu
i organizator. Pierwszy ekran nie zapowiada wyraźnie głównej akcji.

Ryzyko: osoba zainteresowana wyjazdem może odczytać ekran jako opis miejsca,
bez łatwego przejścia do poznania organizatora.

Zalecenie: umieścić przy dolnej krawędzi stały pasek z aktualną akcją kontaktu:
„Zaproś do kontaktu”, „Zobacz wysłane zaproszenie” lub „Przejdź do rozmowy”.
Zachować obecny mechanizm akceptacji zaproszeń. Organizatora pokazać wcześniej,
obok najważniejszych informacji. Mapę można przenieść niżej lub zwijać.

Dowody: [góra szczegółów](../.expo/ux-ui-audit/08-trip-detail-top.png),
[dół z przyciskiem](../.expo/ux-ui-audit/09-trip-detail-contact.png),
[kolejność sekcji w ekranie](../src/app/trip/[id].tsx),
[stany kontaktu](../src/features/messaging/trip-contact-action.tsx).

## 2. Niezapisana edycja profilu przepada — P1

Odtworzenie: „Edytuj profil” → zmiana nazwy → „Wróć do profilu” → ponowna
edycja. Zmieniona nazwa wróciła do poprzedniej wartości. Nie pojawiło się
potwierdzenie odrzucenia zmian ani zapis szkicu.

To szczególnie uciążliwe przy dłuższym opisie ekipy. Formularz przechowuje
zmiany lokalnie, a jego przycisk powrotu od razu nawiguje do profilu.
Kreator wyjazdu ma już ochronę przed podobnym wyjściem, więc zachowanie
poszczególnych edytorów jest niespójne.

Zalecenie: przy zmienionym formularzu oferować „Zapisz”, „Odrzuć zmiany”
i „Wróć do edycji”. Ochrona powinna obejmować przycisk w nagłówku i systemowe
cofnięcie. Dłuższe opisy można dodatkowo chronić lokalnym szkicem.

Dowody: [formularz](../.expo/ux-ui-audit/13-profile-editor.png),
[obsługa powrotu i lokalnego formularza](../src/features/profile/profile-editor.tsx),
[istniejąca ochrona kreatora](../src/features/trips/trip-editor-controller.tsx).

## 3. Drugi krok formularza skupia zbyt wiele pracy — P1

Pierwszy krok obejmuje tryb i daty. Drugi zawiera miejsce, opcjonalną nazwę
i adres kempingu, opis, uczestników, transport, zainteresowania, klimat,
zwierzęta, widoczność i podgląd. W sprawdzonym scenariuszu jego treść miała
**2259 px przy 656 px widocznego obszaru**, czyli około 3,4 wysokości obszaru
formularza. „Krok 2 z 2” słabo oddaje ilość pozostałej pracy.

Po próbie publikacji bez opisu ekran przewinął się na początek i pokazał
komunikat zbiorczy. Fokus pozostał na `BODY`, a pole opisu nie zostało
zaznaczone jako błędne ani otrzymało fokusu. Użytkownik musi ponownie znaleźć
pole, przechodząc przez opcjonalne dane kempingu.

Zalecenie: zachować dwa kroki, ale w drugim najpierw pokazać wymagane minimum.
Dane kempingu i dodatkowe szczegóły umieścić w zwijanych sekcjach.
Błędy pokazywać przy właściwych polach; publikacja powinna przewijać
i przenosić fokus do pierwszego błędu. Podgląd może być rozwijany na żądanie.
Przycisk publikacji powinien jasno informować, które minimum jeszcze pozostało.

Dowody: [drugi krok](../.expo/ux-ui-audit/17-trip-step-two.png),
[błąd opisu](../.expo/ux-ui-audit/18-trip-validation.png),
[układ pól](../src/features/trips/trip-editor-steps.tsx),
[przewijanie po błędzie](../src/features/trips/trip-editor-controller.tsx),
[wspólne pole bez obsługi błędu](../src/features/profile/profile-form-fields.tsx).

## 4. Odkrywaj utrudnia szybkie otwieranie i porównywanie wyjazdów — P1

Przy 390 px pierwsza karta zaczynała się na wysokości **410 px**, miała
**496 px** wysokości, a jej „Zobacz wyjazd” zaczynało się na **847 px**.
Obszar nad dolną nawigacją miał 771 px. Przycisku nie było widać przy wejściu.
Przy 320 px pierwsza karta miała 518 px wysokości i zaczynała się na 428 px.

Kliknięcie nagłówka karty pozostawiło użytkownika w Odkrywaj. Ilustracja
i tytuł nie otwierają szczegółów; służy do tego dolny przycisk. Osobno aktywny
jest wiersz ekipy, prowadzący do innego ekranu.

Ryzyko: użytkownik widzi atrakcyjną kartę, ale nie od razu widzi sposób jej
otwarcia. Duży nagłówek, ilustracja i oś czasu wydłużają porównywanie wyników.
Termin jest przedstawiony zarówno na osi, jak i tekstem pod miejscem.

Zalecenie: zdjęcie i tytuł powinny otwierać wyjazd. Serce i profil ekipy
powinny zachować odrębne działania. Zmniejszyć wysokość nagłówka na ekranach
roboczych oraz uprościć kartę listy, eksponując kierunek, daty i ekipę.
Rozbudowana ilustracja i oś czasu mogą pozostać ważniejszym elementem szczegółów.
Oszczędniejszy widok listy warto sprawdzić z użytkownikami przed wdrożeniem.

Dowody: [390 px](../.expo/ux-ui-audit/04-explore-390.png),
[320 px](../.expo/ux-ui-audit/05-explore-320.png),
[karta Odkrywaj](../src/components/trips/discovery-trip-card.tsx),
[wspólna karta](../src/components/trips/trip-listing-card.tsx).

## 5. Pusta lista kieruje do czynności, która nic nie zmieni — P2

Przy pustej bazie i domyślnych filtrach aplikacja pokazuje „Żaden plan nie
pasuje do tych filtrów” oraz „Pokaż wszystkie propozycje”. Wszystkie wyniki
już są pokazane: jest ich zero. Przycisk jedynie resetuje filtry.

Zalecenie: rozdzielić dwa przypadki. Dla aktywnych filtrów proponować zmianę
lub usunięcie kryteriów. Przy braku jakichkolwiek ogłoszeń pokazać komunikat
wprost oraz „Dodaj pierwszy wyjazd” i możliwość poznania ekip.

Dowody: [pusta lista](../.expo/ux-ui-audit/24-explore-empty.png),
[wspólny komunikat i reset](../src/app/(tabs)/explore.tsx).

## 6. Obrazki transportu nie mają widocznych nazw — P2

W onboardingu i edycji transport wybiera się z ilustracji. Nazwy istnieją
w etykietach dostępności, ale nie są wyświetlane obok opcji. Rozróżnienie
kampera i vana wymaga interpretacji rysunków. W formularzu wyjazdu lista
dodatkowo przewija się poziomo, z ukrytym paskiem przewijania.

Zalecenie: wyświetlić podpisy „Przyczepa”, „Kamper”, „Namiot”, „Kampervan”,
„Samochód”. Przy wyborze pojedynczej opcji pozostawić wyraźne zaznaczenie.
Jeśli lista jest pozioma, ostatnia częściowo widoczna opcja lub inny sygnał
powinny pokazywać możliwość jej przesunięcia.

Dowody: [dolna część onboardingu](../.expo/ux-ui-audit/30-onboarding-bottom.png),
[wybór transportu](../src/features/profile/travel-mode-ui.tsx),
[przewijane opcje](../src/components/ui/chip-row.tsx).

## 7. Nazewnictwo nadal sugeruje wycofane preferencje i rekomendacje — P2

Odkrywaj pokazuje wszystkie wyniki pod nagłówkiem „Propozycje”, choć lista
nie jest personalizowana ani rankingowana. Po „Znajdź towarzystwo” z własnego
wyjazdu w filtrach pojawia się „Towarzystwo z preferencji wyjazdu”, mimo że
formularz nie zbiera takich preferencji. Potwierdzono obecność tej etykiety
w działającym interfejsie.

Przycisk „Znajdź ekipę” na Start kieruje do Odkrywaj, którego początkowym
widokiem są „Wyjazdy”; obok istnieje odrębna zakładka „Ekipy”. Słowo „ekipa”
raz oznacza cel kontaktu, a raz konkretną listę.

Zalecenie: listę nazywać „Wyjazdy” lub „Ogłoszenia”. „Propozycje do Twoich
wyjazdów” pozostawić dla automatycznych powiadomień. Filtry opisywać jako
jawny wybór użytkownika; przy kryteriach z ogłoszenia pokazać „Dla wyjazdu: …”.
Dopasować nazwę głównego przycisku do otwieranego widoku.

Dowody: [etykieta po szukaniu towarzystwa](../.expo/ux-ui-audit/31-inherited-filter-label.png),
[ekran i nazwy wyników](../src/app/(tabs)/explore.tsx),
[dawne określenie preferencji](../src/features/discovery/discovery-filters-sheet.tsx),
[nawigacja ze Start](../src/app/(tabs)/index.tsx).

## 8. Zarządzanie wyjazdem ma sześć równorzędnych przycisków — P2

Dla aktywnego wyjazdu ten sam wygląd mają: edycja, wstrzymanie, duplikowanie,
zakończenie, anulowanie i usunięcie. Ich częstotliwość użycia i skutki są różne.
Różnica między wstrzymaniem a anulowaniem jest wyjaśniana dopiero po wyborze
odpowiedniej akcji. Potwierdzenia anulowania, zakończenia i usunięcia już istnieją.

Zalecenie: wyróżnić edycję i wstrzymanie/wznowienie. Zakończenie i anulowanie
zebrać w osobnej grupie z krótkim objaśnieniem skutków. Usunięcie oddzielić
od pozostałych działań i nadać mu wyraźny charakter operacji destrukcyjnej.

Dowody: [menu](../.expo/ux-ui-audit/20-own-trip-menu.png),
[akcje i istniejące potwierdzenia](../src/features/trips/trip-actions.tsx).

## 9. Liczniki powiadomień mają zbyt mały kontrast — P2

`CountBadge` używa białych cyfr `#FFFFFF` na pomarańczowym `#FE881E`,
w rozmiarze 12. Obliczony kontrast wynosi **2,40:1**. Małe liczniki są widoczne
m.in. w Wiadomościach, przy zakładkach i w dolnej nawigacji.

Zalecenie: użyć odpowiednio ciemnego tekstu lub przyciemnić tło, zachowując
kontrast co najmniej 4,5:1 dla małych cyfr. Taki poziom dla małego tekstu
zalecają [wytyczne Androida](https://developer.android.com/guide/topics/ui/accessibility/apps#increase-text-visibility).
Sam rozmiar ikon nie jest rozmiarem obszaru dotykowego; wielu kontrolkom
aplikacja prawidłowo zapewnia 48 jednostek wysokości.

Dowody: [liczniki w Wiadomościach](../.expo/ux-ui-audit/26-conversations.png),
[kolory](../src/constants/theme.ts),
[renderowanie licznika](../src/features/messaging/messaging-ui.tsx).

## Kolejność pracy

1. **Ochrona pracy i główna akcja:** zabezpieczenie edycji profilu, dostępny
   stale kontakt na szczegółach oraz otwieranie wyjazdu z widocznej części karty.
2. **Publikacja wyjazdu:** błędy przy polach i fokus, wymagane minimum przed
   opcjonalnymi danymi, zwijane dodatki i podgląd.
3. **Szybkie poprawki czytelności:** puste stany, podpisy transportu,
   spójne nazwy i kontrast liczników. Te poprawki można realizować niezależnie
   od większych zmian układu.
4. **Porównywanie wyników i zarządzanie:** oszczędniejszy nagłówek/lista oraz
   uporządkowane menu wyjazdu. Układ listy porównać w krótkim badaniu zadaniowym.

Przy sprawdzaniu zmian warto poprosić użytkowników o znalezienie wyjazdu
w określonym terminie, wysłanie pierwszego zaproszenia, publikację planu
i zmianę opisu ekipy. Obserwować powodzenie zadania, błędne kliknięcia,
powroty i miejsce pierwszego zawahania. W działającej aplikacji mierzyć
przejścia lista → szczegóły → zaproszenie oraz rozpoczęcie → publikacja wyjazdu.

## Elementy, które już pomagają

- Spójna kolorystyka i ilustracje budują rozpoznawalny charakter aplikacji.
- Profil innej ekipy ma czytelny opis i łatwiej dostępny kontakt niż szczegóły wyjazdu.
- Podgląd wyjazdu korzysta już z tej samej karty co Odkrywaj.
- Kreator pozwala zachować szkic i ostrzega przed odrzuceniem zmian.
- Onboarding odracza zainteresowania i zwierzęta do późniejszej edycji.
- Wyszukiwanie pokazuje liczbę wyników przed zastosowaniem filtrów.
- Istnieją stany błędów, ponowienia odczytów i potwierdzenia ważnych operacji.

Raport nie zmienia reguł dostępności profili ani kryteriów automatycznych
propozycji. Nie wprowadzono zmian interfejsu, migracji ani publikacji aplikacji.
Lint i TypeScript przeszły. Ujęcia i surowe obserwacje są lokalnie
w ignorowanym katalogu `.expo/ux-ui-audit/`; nie są częścią wersjonowanego raportu.
