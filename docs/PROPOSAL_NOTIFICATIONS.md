# Automatyczne propozycje wyjazdów — Dev

Migracja `202610270002_background_proposals.sql` przenosi tworzenie propozycji
z odczytu historii do pracy w tle. Zmiana jest wdrażana tylko w Supabase Dev
`kswuakzcnoqgovnwejhb`; Preview pozostaje niezależne.

## Działanie

- Publikacja, wznowienie lub zmiana terminu, miejsca i preferencji wyjazdu
  dodaje zadanie do prywatnej kolejki. Zmiana rodzaju ekipy lub wieku dzieci
  także zleca ponowne sprawdzenie jej aktywnych ogłoszeń.
- Cron `razemgo-proposals` uruchamia procesor co minutę, niezależnie od
  uruchomienia aplikacji. Dopasowanie wymaga wspólnego terminu, kierunku/regionu
  i spełnienia preferencji organizatora dotyczących rodzaju ekipy oraz wieku
  dzieci. Zwierzęta nie są wykluczeniem. Rozróżniamy regiony o podobnych nazwach
  i uwzględniamy poszukiwanie pomysłu na obszarze całej Polski.
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
migrację. Migracja zakłada istniejący `pg_cron` używany przez push na Dev.
Powstaje osobny harmonogram `razemgo-proposals`; dotychczasowe harmonogramy
i sekrety wysyłki pozostają bez zmian. Historia wykonań jest dostępna w
Supabase Cron. Nowy kanał Androida `razemgo-proposals` tworzy się po odświeżeniu
aplikacji i synchronizacji powiadomień; nowy development build nie jest potrzebny.

## Weryfikacja

Testy SQL obejmują zamkniętą aplikację, nowe i edytowane plany, deduplikację,
grupowanie, preferencje, odczyt, profile, daty, regiony, zwierzęta, blokady,
moderację, usuwanie kont i wyjazdów, zakończenie sesji oraz kontynuację po limicie
200 propozycji. Testy push sprawdzają bezpieczny payload i nawigację; testy
przeglądarkowe zapis ustawień, błędy zapisu, drugie urządzenie, zmianę konta
oraz otwieranie propozycji z dzwonka.

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
