# Automatyczne propozycje wyjazdów — Dev

**Aktualizacja 1.11.2026:** migracja `202611010003_proposal_criteria.sql` usuwa
preferencje rodzaju ekipy i wieku dzieci z automatycznych propozycji. Dopasowanie
korzysta z terminu i kierunku/regionu, zgodnie z poprawionym opisem ustawienia push.
Dawne pola pozostają dla starszych kontraktów, ale nie wpływają na propozycje,
również dla starszych ogłoszeń. Przed poprawką miały wartości w 179 ze 180
aktywnych publicznych ogłoszeń Dev; obecny formularz nie pozwala ich ustawiać.

Migracja `202610270002_background_proposals.sql` przeniosła tworzenie propozycji
z odczytu historii do pracy w tle. Poprawkę kryteriów z 1.11.2026 wdrożono tylko
w Supabase Dev `kswuakzcnoqgovnwejhb`; Preview pozostaje przy wydaniu 1.4.0.

## Działanie

- Publikacja, wznowienie lub zmiana terminu, miejsca i widoczności wyjazdu
  dodaje zadanie do prywatnej kolejki, jeśli wyjazd jest aktywny i publiczny.
  Rodzaj ekipy, wiek dzieci i dawne preferencje nie są kryteriami propozycji.
- Cron `razemgo-proposals` uruchamia procesor co minutę, niezależnie od
  uruchomienia aplikacji. Dopasowanie wymaga nakładającego się terminu oraz
  wspólnego kierunku/regionu; sam dzień wyjazdu jednej i przyjazdu drugiej ekipy
  nie wystarcza. Zwierzęta, transport i zainteresowania nie są wykluczeniem.
  Rozróżniamy regiony o podobnych nazwach i uwzględniamy poszukiwanie pomysłu
  na obszarze całej Polski.
- Obie strony muszą mieć aktualny, publiczny wyjazd. Blokady, zawieszenia
  kont oraz ukrycie przez moderację obowiązują również w procesorze.
- Propozycja powstaje także bez urządzenia push lub przy wyłączonym push.
  Ma trwały wpis w dzwonku, stan odczytu i bezpośredni link do wyjazdu.
- Jedna ekipa otrzymuje jeden wpis dotyczący danego proponowanego wyjazdu,
  również gdy pasuje on do kilku własnych planów. Wznowienie i ponowienie
  zadania nie tworzą kolejnej propozycji. Prywatny rejestr deduplikacji jest
  niezależny od usuwania wpisów przez moderację.
- Instalacja migracji nie uruchamia zaległej wysyłki ani nie usuwa historii,
  kont i wyjazdów. Dotychczasowe propozycje są wpisane do rejestru deduplikacji.

## Push

`Profil → Ustawienia → Propozycje do Twoich wyjazdów` steruje preferencją
`push_proposals` dla całego konta. Domyślnie jest włączona, tak jak wiadomości
i zaproszenia. Nadal wymaga zgody systemowej i aktywnej rejestracji telefonu.

Nowe propozycje zbieramy w oknach po pięć minut: jeden push na konto i jego
zarejestrowane urządzenia w danym oknie. Każdy wyjazd ma osobny wpis w dzwonku.
Przed wysłaniem wybierany jest nadal dostępny, nieodczytany wyjazd. Alert
zbiorczy prowadzi do niego i oznacza odczyt tylko tego wpisu. Pozostałe można
przejrzeć w dzwonku. Payload zawiera jedynie identyfikatory, bez opisów wyjazdów,
nazw ekip czy prywatnej treści rozmów.

Wyłączenie preferencji anuluje oczekującą wysyłkę. Ponowne włączenie nie
odtwarza starych alertów. Przed dostarczeniem ponownie sprawdzamy odczyt,
preferencję, sesję urządzenia, aktualność obu planów, blokady i moderację.
Odczyt lub ukrycie jednej pozycji nie blokuje pozostałych pozycji zbiorczego
alertu. Dotychczasowy dispatcher zachowuje retry, lease i receipts Expo.

## Backend i wdrożenie

Prywatne tabele mają RLS i nie są udostępnione klientom. RPC
`process_proposal_notifications(batch_size)` dopuszcza wyłącznie `service_role`.
Jeden przebieg obsługuje do 10 zadań, maksymalnie 200 nowych par na zadanie;
nieukończone zadanie zostaje w kolejce na kolejny przebieg. Blokada transakcyjna
zapobiega równoczesnemu przetwarzaniu przez cron i diagnostykę. Zapis wyjazdu
nie wykonuje wyszukiwania dopasowań.

Najpierw wdrażamy nowy `dispatch-push`, który rozumie rodzaj `proposal`, potem
migrację `202610270002_background_proposals.sql`. Zakłada ona istniejący `pg_cron` używany przez push na Dev.
Powstaje osobny harmonogram `razemgo-proposals`; dotychczasowe harmonogramy
i sekrety wysyłki pozostają bez zmian. Historia wykonań jest dostępna w
Supabase Cron. Nowy kanał Androida `razemgo-proposals` tworzy się po odświeżeniu
aplikacji i synchronizacji powiadomień; nowy development build nie jest potrzebny.

Poprawka kryteriów z 1.11.2026 wymaga tylko migracji
`202611010003_proposal_criteria.sql`, bez ponownego wdrażania Edge Functions
ani budowania APK. Usuwa niepotrzebne wyzwalanie kolejki po zmianach składu ekipy
i dawnych preferencji. Zachowuje dane wyjazdów, historię, rejestr deduplikacji,
oczekujące zadania oraz stan wysyłek. Nie zleca masowego przeliczenia starych
ogłoszeń ani odtworzenia alertów. Zwykła kolejka i kontrola przed dostarczeniem
stosują nową regułę.

## Weryfikacja

Testy SQL obejmują zamkniętą aplikację, nowe i edytowane plany, deduplikację,
grupowanie, ustawienia push, odczyt, profile, daty, regiony, zwierzęta, blokady,
moderację, usuwanie kont i wyjazdów, zakończenie sesji oraz kontynuację po limicie
200 propozycji. Testy push sprawdzają bezpieczny payload i nawigację; testy
przeglądarkowe zapis ustawień, błędy zapisu, drugie urządzenie, zmianę konta
oraz otwieranie propozycji z dzwonka.

`scripts/proposal-criteria-backend.test.mjs` sprawdza aktualną regułę po pełnej
historii migracji: ignorowanie zapisanych preferencji i składu ekipy, wszystkie
województwa przy szukaniu w całej Polsce, granice dat, ograniczenia dostępu,
deduplikację, grupowanie, wyłączenie push i zachowanie danych podczas migracji.
Testy wcześniejszych migracji nadal sprawdzają ich historyczne kontrakty.

1.11.2026 poprawka kryteriów przeszła **583/583 testy Node/PGlite**, dwa
scenariusze przeglądarkowe ustawień push i otwierania propozycji, lint,
TypeScript i kontrolę granic źródeł. Migrację wdrożono na Dev; odczyt metadanych
potwierdził **45 migracji**, ignorowanie dawnych preferencji i zachowanie
ograniczeń uprawnień. Stare wartości pozostały w 179 ze 180 aktywnych
publicznych ogłoszeń, ale nie są już kryterium propozycji. Preview nie wdrażano.

Test rzeczywistego API używa dwóch tymczasowych kont i czeka na automatyczne
wykonanie harmonogramu. Nie rejestruje urządzeń push. Wynik jest zapisywany
w ignorowanym `.expo/proposal-notifications-dev-api-check.local.json`;
oba konta są usuwane po kontroli. Odbiór nowego rodzaju push na fizycznym
telefonie pozostaje osobnym sprawdzeniem.

27.10.2026 przeszły lint, TypeScript, **435 testów Node**, **7 scenariuszy
przeglądarkowych powiadomień**, **3 testy Edge z 10 krokami** i eksport Androida.
Migracja oraz `dispatch-push` są wdrożone w Dev. Test rzeczywistego API potwierdził
aktywne zadanie co minutę, jego zakończenie `succeeded`, automatyczne utworzenie
propozycji bez ręcznego wywołania procesora, brak wykluczenia psa, odmowę dostępu
do procesora zwykłemu kontu, zapis preferencji i odczytu, deduplikację po
wznowieniu i niedostępność po usunięciu wyjazdu. Usunięto oba konta kontrolne.
Dev ma 25 migracji. Preview nie było wdrażane.
