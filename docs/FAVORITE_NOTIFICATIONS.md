# Nowe wyjazdy ulubionych ekip — Dev

Pierwsza publikacja aktywnego, publicznego wyjazdu tworzy powiadomienie **Nowy wyjazd ulubionej ekipy** u osób, które w tej chwili mają organizatora w ulubionych. Nie trzeba mieć własnego wyjazdu. Zapisanie wyłącznie ogłoszenia serduszkiem nie obserwuje wszystkich publikacji jego organizatora.

Powiadomienie jest w dzwonku i historii, niezależnie od uprawnień telefonu. Ma avatar i nazwę organizatora oraz fragment opisu. Kliknięcie potwierdza odczyt w bazie i otwiera konkretny `/trip/[id]`. Odczyt jest wspólny dla urządzeń. Gdy ogłoszenie jest usunięte, prywatne, wstrzymane, zakończone lub ukryte przez moderację, wpis pokazuje niedostępność zamiast otwierać wyjazd.

W **Profil → Ustawienia → Jakie powiadomienia chcesz otrzymywać?** jest osobny przełącznik **Wyjazdy ulubionych ekip**. Push dla tej kategorii jest domyślnie włączony, tak jak dla wiadomości i zaproszeń. Zmiana zapisuje preferencję konta dla wszystkich urządzeń; telefon wymaga też ogólnego włączenia powiadomień. Ponowne włączenie nie wysyła starych wpisów. Android ma oddzielny kanał `razemgo-favorite-trips`.

Powiadomienie pojawia się raz na wyjazd. Edycja, ponowienie zapisu po utracie odpowiedzi, wstrzymanie i wznowienie nie ogłaszają tego samego planu ponownie. Dodanie ekipy do ulubionych nie pobiera historycznych publikacji. Migracja oznacza istniejące publikacje jako historyczne, bez tworzenia nowych wpisów.

Wyłączenie kategorii push lub usunięcie ekipy z ulubionych anuluje jej niewysłane alerty. Ponowne włączenie lub dodanie nie przywraca starej kolejki. Aktualne uprawnienia są sprawdzane także przed wysyłką: status wyjazdu, blokady w obie strony, zawieszenie kont, moderacja, aktywna sesja urządzenia, preferencja, obserwowanie ekipy i odczyt wpisu. Żądania już przyjęte przez dostawcę push nie mogą zostać cofnięte.

## Implementacja

Migracja `202610250008_favorite_trip_notifications.sql` rozszerza istniejące `notifications` i `notification_preferences`. Prywatna tabela `notifications_private.favorite_trip_publications` zapisuje pierwszą publikację każdego wyjazdu, również bez obserwujących. Trigger działa w transakcji publikacji. Powiadomienia i kolejka używają tego samego identyfikatora, istniejących odczytów oraz prywatnego sygnału `mailbox_updates` w Realtime. Profil organizatora nie otrzymuje informacji, kto go obserwuje.

Migracja `202610250009_default_favorite_trip_push.sql` ustawia domyślnie włączony push w tabeli, odczycie ustawień, zapisie pozostałych kategorii i kwalifikowaniu nowych zdarzeń do wysyłki. Zachowuje wszystkie wcześniej zapisane preferencje, w tym ręczne wyłączenia. Nie tworzy ani nie wznawia historycznych powiadomień.

Dispatcher zachowuje dotychczasowe dzierżawy, ponowienia, potwierdzenia i monitoring. API `claim_push_deliveries` dodaje kolumnę `trip_id`; stare pola nie zmieniają znaczenia. Payload telefonu zawiera identyfikatory i ogólny tekst, bez nazw ekip, opisów, treści rozmów ani dowolnych URL.

Kolejność wdrożenia w Dev: dispatcher obsługujący nowy rodzaj → migracja → odświeżenie aplikacji. Dla urządzeń Dev wystarcza odświeżenie JavaScript; nie dodano modułów natywnych. Preview nie jest częścią tego wdrożenia.

## Weryfikacja

- `scripts/favorite-notifications-backend.test.mjs`: rzeczywiste migracje w PostgreSQL/PGlite; domyślnie włączony push, zachowanie wyłączeń, historia, publikacja szkicu i prywatnego planu, idempotencja, wiele urządzeń, anulowanie kolejki, odczyt, blokady, moderacja, RLS i usuwanie kont.
- `scripts/push.test.mjs`: payload, osobny kanał, walidacja identyfikatora wyjazdu, właściwe konto, nawigacja po odtworzeniu sesji i niezależne preferencje.
- `scripts/browser/notifications.spec.mjs`: dzwonek → wyjazd, odczyt po przeładowaniu, niedostępne ogłoszenie oraz zapis ustawień, błędy i izolacja kont/urządzeń.

Odbiór systemowego push i kliknięcie z zamkniętej aplikacji na fizycznym telefonie sprawdzamy osobno od testów na komputerze.

25.10.2026 wdrożono dispatcher i migrację wyłącznie do Supabase Dev `kswuakzcnoqgovnwejhb`. Przeszły lint, TypeScript, 322 testy Node, sześć testów Playwright powiadomień oraz cztery testy Edge z dziesięcioma krokami. Test rzeczywistego API Dev na trzech tymczasowych kontach potwierdził publikację, izolację obserwujących, odczyt w drugiej sesji, preferencje, brak duplikatów, blokowanie i niedostępność wycofanej oferty. Trzy konta i ich dane usunięto; test API nie rejestrował urządzeń i nie wysyłał fizycznych push. Sprawdzono też rzeczywisty bundle Androida Dev. Preview pozostało bez zmian.

Tego samego dnia wdrożono do Dev migrację `202610250009_default_favorite_trip_push.sql`: domyślna wartość jest teraz włączona, a zapisane wyłączenia pozostają bez zmian. Ponownie przeszły lint, TypeScript, 322 testy Node i sześć testów Playwright powiadomień. API Dev na trzech nowych kontach potwierdziło domyślne włączenie, trwałość ręcznego wyłączenia przy zapisie innej kategorii oraz brak wysyłki historycznych wpisów. Konta kontrolne usunięto; nie rejestrowano urządzeń ani nie wysyłano fizycznych push.
