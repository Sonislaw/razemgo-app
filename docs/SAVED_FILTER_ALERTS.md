# Alerty zapisanych filtrów — Dev, 3.11.2026

W **Odkrywaj → Wyjazdy → Zapisane** każdy zestaw ma przełącznik
**„Powiadamiaj o nowych wyjazdach”**, domyślnie wyłączony. Dotyczy przyszłych
pierwszych publicznych publikacji pasujących do całego zestawu. Własny wyjazd
nie jest wymagany. Nie ma tej opcji w zestawach ekip.

Wyniki zestawu zbieramy w pięciominutowych oknach. Po zamknięciu okna powstaje
jeden wpis w dzwonku z nazwą zestawu i liczbą pasujących wyjazdów oraz zbiorczy
push na zarejestrowane urządzenia. Procesor działa co minutę, także przy zamkniętej
aplikacji. Wpisy powstają również bez telefonu lub przy wyłączonym push.
Kliknięcie wczytuje aktualne kryteria zestawu w **Odkrywaj → Wyjazdy**, zaczynając
od pierwszej strony. Również po przejściu z wcześniej otwartej zakładki Ekipy.

**Profil → Ustawienia → Wyniki zapisanych filtrów** steruje osobno systemowym
push dla tej kategorii na całym koncie. Wymagana jest też zgoda telefonu.
Przełącznik przy zestawie steruje obserwowaniem i tworzeniem wpisów w aplikacji.
Obecne propozycje do własnych wyjazdów i publikacje ulubionych ekip działają osobno.

## Zasady

- Włączenie, ponowne włączenie i zastąpienie kryteriów rozpoczyna obserwację
  przyszłych publikacji. Nie odtwarzamy zaległych wyników.
- Edycja, wznowienie i ponowny zapis istniejącego ogłoszenia nie tworzą nowego
  alertu. Wyjazd trafia do alertów danego zestawu najwyżej raz.
- Zmiana nazwy zachowuje obserwację; zmiana kryteriów zachowuje włączenie,
  rozpoczynając nowy okres i anulując poprzednią oczekującą wysyłkę.
- Wyłączenie opcji, usunięcie zestawu i wyłączenie globalnej kategorii push
  zatrzymują niewysłane alerty. Ponowne włączenie nie wznawia starej kolejki.
- Dla minionych dat nie można włączyć alertów. Zastąpienie kryteriów minionym
  terminem wyłącza obserwację. Daty i tolerancja nie są przesuwane automatycznie.
- Dopasowanie używa `discovery_private.candidates`: tryb, daty i tolerancja,
  miejsce, krajobraz, rodzaj ekipy, wiek uczestniczących dzieci, zwierzęta oraz
  „Tylko ulubione”. Dodanie istniejącego wyjazdu do ulubionych nie jest publikacją
  i samo nie tworzy nowego alertu.
- Przed zamknięciem okna i wysłaniem ponownie sprawdzamy dostępność i dopasowanie.
  Usunięte, prywatne, wstrzymane, zakończone i ukryte ogłoszenia oraz blokady
  i zawieszenia kont nie ujawniają się w nowych wynikach. Liczba w historii
  uwzględnia nadal dostępne pasujące pozycje.
- Usunięty lub zastąpiony zestaw może pozostawić niedostępny wpis historii.
  Linki wymagają zalogowania i dostępu do własnego katalogu.
- Synchronizacja opcji między urządzeniami nie stosuje filtrów samoczynnie.

## Backend

Migracja `202611030002_saved_filter_notifications.sql` dodaje flagę obserwacji,
czas rozpoczęcia i identyfikator generacji zestawu. Nowy RPC
`set_my_filter_set_notifications(target_id, enabled)` ustala właściciela z aktywnej
sesji. Ponowienie zapisu tej samej wartości nie rozpoczyna obserwacji od nowa.

Prywatne tabele przechowują pierwsze publikacje, zadania, trwałą deduplikację,
okna zbiorcze i ich pozycje. RLS i brak uprawnień klienta chronią te dane.
Cron **`razemgo-saved-filters`** wywołuje `process_filter_notifications(10)`
co minutę; RPC dostępne jest wyłącznie dla `service_role`.
Procesor ma blokadę przed równoległym wykonaniem i kontynuuje zadania po limicie
200 dopasowanych zestawów na publikację. Zapis ogłoszenia tylko kolejkuje zadanie.
Szczegóły starych okien usuwamy po 30 dniach; deduplikacja pozostaje do usunięcia
wyjazdu lub zestawu. Dane konta usuwają się kaskadowo.

Nowy rodzaj wpisu i push to `saved_filter`, preferencja to `push_saved_filters`,
kanał Androida to `razemgo-saved-filters`. Push przekazuje tylko identyfikatory
zdarzenia, konta, powiadomienia i zestawu. Nazwy, kryteria i opisy nie trafiają
do payloadu systemowego. Zachowujemy istniejące lease, retry i receipts Expo.

## Wdrożenie i weryfikacja

Wdrożono wyłącznie **Dev `kswuakzcnoqgovnwejhb`**: najpierw dispatcher,
potem migracja. Preview i Production nie wdrażano. Wystarczy odświeżyć Dev;
nie ma nowych modułów natywnych ani potrzeby nowego APK.

- `npm run test:filter-alerts` — SQL: domyślne wyłączenie, dokładne kryteria,
  zbiorcze okna, brak historycznej wysyłki, deduplikacja, uprawnienia, minione
  daty, anulowanie oczekujących wysyłek, globalna preferencja i kasowanie konta;
  testy payloadów i bezpiecznej nawigacji push.
- Testy magazynu: odpowiedź serwera, błędy i spóźnione odpowiedzi poprzedniego konta.
- Playwright: 320/390 px, przełączniki, ponowne logowanie, synchronizacja dwóch
  sesji, błędy, globalne ustawienie, historia, minione daty i linki do zestawów.
- Regresja zapisanych filtrów, powiadomień, propozycji i istniejących wysyłek;
  lint, TypeScript i testy Edge Functions.
- `scripts/filter-alerts-dev-smoke.sql` — rzeczywisty Dev, tymczasowe konta
  i `ROLLBACK`: opt-in, izolacja kont, dwie publikacje → jeden wpis i metadane
  kolejki push. Bez połączenia z Expo i bez fizycznej wysyłki.
- `scripts/check-dev-contracts.mjs` — rzeczywisty Dev: nowe RPC odrzucają gości.
  Harmonogram i ostatnie wykonanie można sprawdzić w Supabase Cron.

Interfejs zweryfikowano w przeglądarce. Odbiór systemowego push na fizycznym
telefonie pozostaje osobnym sprawdzeniem.
