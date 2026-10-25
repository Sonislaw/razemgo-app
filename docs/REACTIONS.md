# Reakcje na ogłoszenia — Dev

Funkcja jest wdrożona do Supabase Dev `kswuakzcnoqgovnwejhb` przez migrację `202610250010_trip_reactions.sql` i nową wersję `dispatch-push`. Preview nie jest aktualizowane. W Dev wystarcza odświeżenie aplikacji; nie dodano modułów natywnych.

## Obsługa

Pięć reakcji: ❤️ Podoba mi się, 🤩 Zazdroszczę!, 🧭 Ciekawy plan, 🔥 Ale przygoda!, 👏 Świetny pomysł. Każde konto ma jedną aktywną emocję na ogłoszenie. Wybranie innej zastępuje poprzednią; ponowne wybranie tej samej lub „Cofnij reakcję” usuwa aktywny wybór. Autor nie reaguje na własny wyjazd.

Na kartach Odkrywaj, ogłoszeniach w profilu ekipy oraz Start przycisk jest w lewym dolnym rogu, obok przejścia do szczegółów. Pokazuje do trzech najczęstszych emocji i łączną liczbę profili; po własnej reakcji wyróżnia wybraną ikonę. Panel wyboru pokazuje wyniki każdej emocji. Serce w prawym górnym rogu nadal służy wyłącznie do zapisywania w ulubionych.

Reakcje są też dostępne w szczegółach wyjazdu. W „Moich wyjazdach”, na Start dla własnego ogłoszenia i w szczegółach własnego planu przycisk otwiera wyniki oraz stronicowaną listę reagujących ekip. Tylko właściciel widzi tożsamość reagujących. Nazwa i avatar są widoczne wraz z emocją; przejście do profilu wymaga jego dostępności zgodnie z obecnymi zasadami widoczności i kontaktów. Dla szkiców i wycofanych własnych planów dostępny jest odczyt historii, bez dodawania nowych reakcji.

## Powiadomienia

Pierwsza reakcja danego profilu pod danym wyjazdem tworzy trwały wpis „Nowa reakcja na Twoje ogłoszenie” w dzwonku autora, z nazwą, avatarem, emocją i fragmentem opisu. Kliknięcie potwierdza odczyt w bazie i prowadzi do `/trips/[id]`. Zmiana emocji aktualizuje istniejący wpis bez resetowania odczytu i bez kolejnego push.

Cofnięcie oznacza wpis jako wycofany i odczytany oraz anuluje niewysłane alerty. Ponowne dodanie aktualizuje ten sam wpis, bez nowego alertu. Usunięty wyjazd nie pozostaje dostępnym celem nawigacji. Blokady obu stron i zawieszenia kont ukrywają wpisy i reagujących oraz blokują wysyłkę.

„Reakcje na ogłoszenia” to osobna, domyślnie włączona kategoria push w ustawieniach. Zapis jednej kategorii zachowuje pozostałe; wyłączenie anuluje niewysłane alerty i ponowne włączenie nie wysyła historii. Ogólna zgoda telefonu pozostaje bez zmian. Kanał Androida `razemgo-reactions` jest tworzony w czasie działania aplikacji. Payload zawiera tylko ogólny komunikat i identyfikatory, bez nazw ekip, emocji, opisów ani treści wiadomości.

## Dane i synchronizacja

Prywatna tabela `reactions_private.trip_reactions` ma RLS i odebrane bezpośrednie uprawnienia klientów. Unikalna para `(trip_id, actor_group_id)` oraz blokada transakcyjna konta serializują zapisy z wielu urządzeń. Cofnięte reakcje zachowują identyfikator z pustym `kind` do deduplikacji alertów. Usunięcie konta lub wyjazdu usuwa dane kaskadowo.

RPC `set_my_trip_reaction` wyznacza profil z aktywnej sesji. Sprawdza rodzaj emocji, dostęp do publicznego aktywnego wyjazdu, blokady, moderację i zawieszenia. Zapis reakcji, wpis w dzwonku i kolejka powstają atomowo. Limit 30 różnych ostatnio zmienianych ogłoszeń na minutę ogranicza masowe dodawanie; idempotentne ponowienie i cofnięcie pozostają dozwolone.

RPC `get_trip_reactions` przyjmuje maksymalnie 100 identyfikatorów i zwraca wyłącznie liczniki, własną emocję oraz dostępność. Wyniki pomijają niedostępne lub zablokowane profile. `get_my_trip_reactors` udostępnia autorowi do 30 profili na stronę z kursorem `(updated_at,id)`; inni użytkownicy nie mają dostępu do tej listy.

Wspólny stan konta łączy odczyty zamontowanych kart w partie. Wyniki własnego zapisu pojawiają się po odpowiedzi serwera, współdzielone między Start, Odkrywaj i szczegółami. Stary odczyt nie nadpisuje nowszego zapisu. Aktywna aplikacja odświeża wyniki co 20 sekund, po powrocie z tła i przy otwarciu panelu. Wpisy właściciela używają istniejącego prywatnego sygnału Realtime `mailbox_updates`. Zmiana konta usuwa pamięć poprzedniego użytkownika i ignoruje spóźnione odpowiedzi. Monitoring rejestruje tylko bezpieczne metadane operacji `reactions.load`, `reactions.save`, `reactions.people`.

## Weryfikacja

- `scripts/reactions-backend.test.mjs`: rzeczywisty SQL w PGlite, własność, liczniki, zmiana/cofnięcie, deduplikacja, wycofanie push, ustawienia, odczyt, nieaktywne ogłoszenia, blokady, zawieszenia, stronicowanie, rollback, ograniczenia API, limit i usuwanie danych.
- `scripts/reactions.test.mjs`: grupowanie odczytów, walidacja, zapisy potwierdzone, ponowienia, błędy, opóźnione odpowiedzi i izolacja kont.
- `scripts/push.test.mjs`: ogólny payload, nowy kanał, własne preferencje i bezpieczne przejście do szczegółów własnego wyjazdu.
- `scripts/browser/reactions.spec.mjs`: Start, Odkrywaj, szczegóły, błędy i utrata odpowiedzi po zapisie, lista autora, powiadomienie, ustawienia oraz szerokość 320 px.

25.10.2026 test API Dev na trzech tymczasowych kontach potwierdził również równoczesny zapis z dwóch sesji, trwałość odczytu i preferencji, właścicielską listę profili oraz odrzucanie niedozwolonych żądań. Wszystkie trzy konta usunięto. Nie rejestrowano urządzeń ani nie wysyłano fizycznych push. Odbiór i otwieranie systemowych powiadomień na telefonie wymagają osobnego sprawdzenia.

Ręczne sprawdzenie: profil A reaguje w Odkrywaj na ogłoszenie profilu B; B otwiera wpis w dzwonku, następnie listę reagujących w swoim wyjeździe. A zmienia i cofa emocję, a B sprawdza wyniki po odświeżeniu. Dla push oba telefony muszą mieć zgodę systemową oraz włączoną kategorię „Reakcje na ogłoszenia”; pierwszą reakcję sprawdzamy pod nowym ogłoszeniem, ponieważ zmiany istniejącej nie tworzą kolejnego alertu.
