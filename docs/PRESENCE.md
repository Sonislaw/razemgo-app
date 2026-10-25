# Status online

Wdrożenie obejmuje wyłącznie **RazemGo Dev** i Supabase `kswuakzcnoqgovnwejhb`. Migracje: `202610250005_group_presence.sql` oraz `202610250006_online_group_filter.sql` (wspólna definicja aktywności i filtr ekip). Preview pozostaje bez zmian.

Kropka z białą obwódką jest zawsze widoczna na avatarze ekipy: zielona oznacza aktywną, zalogowaną aplikację z utworzonym profilem i ostatnio potwierdzonym połączeniem, a szara — offline lub brak potwierdzenia aktywności. Sama zapamiętana sesja logowania nie wystarcza. Wspólny `GroupAvatar` pokazuje wskaźnik na listach ekip, profilach, ogłoszeniach, zaproszeniach, w rozmowach i powiadomieniach. Wybór ilustracji avatara pozostaje bez wskaźnika; niezalogowany podgląd ogłoszeń nie symuluje obecności online.

## Aktualizacja

- Aplikacja na pierwszym planie potwierdza aktywność co 30 sekund. Status widocznych w interfejsie ekip sprawdza zbiorczo co 15 sekund; identyfikatory są deduplikowane, maksymalnie 100 na żądanie. Nowy avatar inicjuje odświeżenie bez czekania na kolejny interwał.
- Tło, ukryta karta przeglądarki i wylogowanie zamykają bieżące połączenie. Wylogowanie próbuje to zrobić przed unieważnieniem tokenu. Błąd wylogowania przywraca monitorowanie, jeżeli konto nadal jest zalogowane.
- Nagłe zamknięcie aplikacji lub utrata sieci może uniemożliwić wysłanie informacji o wyjściu. Serwer wygasza aktywność po 75 sekundach; z odświeżeniem drugiego urządzenia usunięcie kropki może zająć około 90 sekund. Błąd własnego odczytu usuwa niepotwierdzone wskaźniki, a kolejne odświeżenie ponawia próbę.
- Każde wejście na pierwszy plan otrzymuje osobny losowy identyfikator. Zamkniętego połączenia nie przywróci spóźniony heartbeat. Kilka telefonów lub kart przeglądarki działa niezależnie: wystarczy jedno aktywne połączenie ekipy.
- Natywnie używamy `AppState`; na webie `visibilitychange`, `online`, `offline` i `pagehide`. Nowy moduł natywny ani przebudowa APK nie są potrzebne.

## Uprawnienia

Prywatna tabela `presence_private.connections` ma RLS bez dostępu klientów. Zapis RPC ustala ekipę i identyfikator sesji na podstawie JWT oraz sprawdza istnienie i ważność sesji w `auth.sessions`. Klient nie wysyła właściciela ani czasu aktywności. Zamknięcie sesji i usunięcie konta wyłączają jej obecność; rekordy powiązane z usuniętą sesją lub profilem usuwają się kaskadowo. Stare połączenia są sprzątane partiami przy zapisie.

`get_online_groups` zwraca tylko identyfikatory aktywnych ekip z podanej listy. Obejmuje własny profil oraz dostępne profile publiczne, organizatorów publicznych ogłoszeń i kontakty z oczekującym lub zaakceptowanym zaproszeniem. Ukryta ekipa bez ogłoszeń i relacji kontaktu nie ujawnia statusu. Blokady obu stron i zawieszenie konta są sprawdzane przy każdym odczycie. RPC odrzuca anonimowe lub unieważnione sesje. Nie ujawniamy czasu ostatniej aktywności ani identyfikatorów urządzeń/sesji.

Filtr `online_only` w `list_ranked_public_groups`, dotychczasowym `list_public_groups` i `count_public_groups` korzysta z tego samego prywatnego pomocnika `presence_private.group_is_online`. Parametr jest opcjonalną wartością logiczną, domyślnie `false`; inne typy są odrzucane. Przy włączonym filtrze weryfikowana jest również sesja wyszukującego. Reguły widoczności katalogu pozostają bardziej restrykcyjne od dostępu do kontaktu: ukrytego profilu nie zwróci wyszukiwarka nawet przy istniejącej rozmowie. Pomocnik nie jest dostępny bezpośrednio klientom.

## Sprawdzenie

`node --test scripts/presence.test.mjs scripts/presence-backend.test.mjs` sprawdza cykl życia, opóźnione odpowiedzi, błędy połączenia, limity żądań, wiele urządzeń, wygasanie, blokady, ukryte profile, cofnięte sesje i kaskadowe usuwanie danych. Scenariusz Playwright `online avatar dots` sprawdza wskaźniki na dwóch kontach oraz tło, powrót i wylogowanie. Test rzeczywistego API Dev używa tymczasowych kont, które usuwa po weryfikacji. Test przeglądarkowy i bundle Androida nie zastępują próby na fizycznych telefonach.

Dokumentacja: [Supabase — sesje](https://supabase.com/docs/guides/auth/sessions), [funkcje bazy](https://supabase.com/docs/guides/database/functions), [React Native — AppState](https://reactnative.dev/docs/appstate).

## Wynik 25.10.2026

Przeszły lint, TypeScript i 298 testów Node (w tym 10 nowych kontroli obecności). Scenariusz Playwright na dwóch kontach potwierdził wskaźniki na własnym profilu, liście i szczegółach ekipy, wyjście do tła, powrót i wylogowanie. Przeszły także scenariusze zapisu i odtwarzania profilu, kontaktu z ekipą bez ogłoszenia oraz Google PKCE, resetu hasła i usunięcia konta.

Po wdrożeniu migracji wyłącznie do Dev rzeczywiste Auth/PostgREST potwierdziły status ekipy, odrzucenie spóźnionego heartbeat zamkniętego połączenia, wiele urządzeń, wylogowanie, odmowę użycia cofniętego JWT, prywatność ukrytej ekipy i blokady. Usunięto trzy tymczasowe konta oraz testowe zgłoszenie i zweryfikowano sprzątnięcie. Manifest i bundle Androida na porcie 8081 wskazują pakiet Dev, backend Dev oraz oba endpointy obecności, bez adresu Preview. Wygląd wskaźnika sprawdzono na zrzucie ekranu 390 px. Test na fizycznych telefonach pozostaje do wykonania.

Po dodaniu filtra „Tylko online” przeszło **300 testów Node** oraz dwa scenariusze Playwright dotyczące filtra i licznika. Sprawdzono wynik 0, pojawienie się ekipy po zmianie aktywności, automatyczne przeliczenie, wyczyszczenie filtra, filtrowanie przed stronicowaniem ponad 20 profili, obie kolejności sortowania, zgodność z kropkami oraz wykluczenie ukrytych, zablokowanych, zawieszonych i nieaktywnych sesji. Migrację `202610250006_online_group_filter.sql` wdrożono do Dev; test rzeczywistego API potwierdził strony wyników i licznik online, wiele urządzeń oraz wylogowanie. Tymczasowe konta i zgłoszenie usunięto. Bundle Androida zawiera nowy filtr i nadal wskazuje wyłącznie Dev.
