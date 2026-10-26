# Ulubione ekipy i ogłoszenia

Funkcja działa wyłącznie w **RazemGo Dev**, Supabase `kswuakzcnoqgovnwejhb`. Migracja `202610250007_favorites.sql` została wdrożona do Dev; Preview nie było aktualizowane.

## Obsługa

- W Odkrywaj serduszko przy ekipie lub wyjeździe zapisuje tę konkretną pozycję. Pełne, czerwone serce oznacza ulubioną pozycję. Kolejne naciśnięcie ją usuwa, bez potwierdzenia. Na kartach wyjazdów mniejsze, lekko przezroczyste koło serca znajduje się w prawym górnym rogu zdjęcia klimatu, a zgodność w jego prawym dolnym rogu.
- Te same serduszka są dostępne w szczegółach ekipy i wyjazdu oraz na ogłoszeniach w profilu innej ekipy. W profilu ekipy serce znajduje się po lewej stronie przycisku kontaktu lub przejścia do rozmowy. Na ekranie „Wyjazd” serce jest w prawym górnym rogu zdjęcia klimatu. Własnych ogłoszeń nie dodajemy do ulubionych.
- Serce przy najnowszym ogłoszeniu na Start zapisuje ten sam wyjazd co w Odkrywaj. Na przykładowym kafelku strony powitalnej ma taki sam wygląd, ale prowadzi do utworzenia konta i nie zapisuje przykładowych danych.
- Nowe publiczne wyjazdy ulubionych ekip trafiają do dzwonka. Push dla tej kategorii jest domyślnie włączony, tak jak dla wiadomości i zaproszeń; można go osobno wyłączyć w ustawieniach. Szczegóły: [powiadomienia ulubionych ekip](FAVORITE_NOTIFICATIONS.md).
- Filtr **Tylko ulubione** jest osobny dla Ekip i Wyjazdów, domyślnie wyłączony. Łączy się z pozostałymi kryteriami, w tym zgodnością, nazwą i „Tylko online”. „Wyczyść” zeruje również ten filtr. Zapis ekipy nie dodaje automatycznie jej wyjazdów.
- Emocje w lewym dolnym rogu ogłoszenia są osobną funkcją: ich wyniki są widoczne innym, a autor otrzymuje powiadomienie. Nie zapisują pozycji w ulubionych. Szczegóły: [reakcje na ogłoszenia](REACTIONS.md).
- Stan jest potwierdzany po odpowiedzi serwera. W trakcie zapisu przycisk pokazuje zajętość. Błąd nie zmienia ostatniego potwierdzonego wyboru i udostępnia ponowienie. Ponowienie zachowuje żądany stan nawet wtedy, gdy po utracie odpowiedzi odczyt z serwera potwierdzi zapis.
- Ulubione są dostępne po ponownym logowaniu i na innym urządzeniu. Aktywna aplikacja odświeża je co 30 sekund oraz przy powrocie z tła. Widok Ekip z filtrem ulubionych odświeża wyniki co 15 sekund, po własnej zmianie wyboru i po powrocie na ekran.
- Odczyt nieudany przy pierwszym uruchomieniu pokazuje błąd i możliwość ponowienia; nie udaje pustej listy zapisanych pozycji. Po zmianie konta stan jest tworzony od nowa, a spóźnione odpowiedzi poprzedniego konta są ignorowane.

## Dane i uprawnienia

`favorites_private.group_favorites` i `favorites_private.trip_favorites` mają klucz właściciel–cel, klucze obce z usuwaniem kaskadowym, RLS i brak bezpośrednich uprawnień klientów. RPC `get_my_favorites`, `set_my_group_favorite`, `set_my_trip_favorite` ustalają właściciela na podstawie zalogowanego konta i weryfikują aktywną sesję. Klient wysyła wyłącznie identyfikator celu i żądany stan. Powtórzenie zapisu jest bezpieczne i nie tworzy duplikatów.

Serduszko nie udostępnia prywatnych danych i nie wysyła powiadomienia ekipie. Dodawanie wymaga dostępnego profilu lub aktywnego, publicznego ogłoszenia innego właściciela. Odczyt uwzględnia widoczność, blokady obu stron, moderację, status i termin wyjazdu. Czasowa niedostępność zachowuje prywatną relację w bazie, lecz nie pokazuje niedostępnej pozycji. Po usunięciu konta, profilu lub wyjazdu relacje usuwają się kaskadowo. Usuwanie własnego zapisu jest dozwolone również wtedy, gdy cel przestał być dostępny.

Filtr `favorites_only` dla katalogu Ekip jest sprawdzany po stronie SQL **przed** sortowaniem i stronicowaniem; `count_public_groups` używa tego samego warunku, bez limitu 20 profili. Ukryta ekipa nie wróci do wyszukiwarki dzięki serduszku, nawet jeśli pozostaje dostępna przez wcześniejszy kontakt. Dotychczasowe API działa bez nowego, opcjonalnego parametru JSON.

W wydaniu Preview 1.1.0 filtr Wyjazdów przecina zbiór dostępnych ogłoszeń z prywatnymi identyfikatorami zapisanych wyjazdów. Od 26.10.2026 w Dev filtrowanie ulubionych odbywa się w SQL przed sortowaniem i limitem strony; licznik stosuje ten sam warunek. Aplikacja pobiera maksymalnie 20 wyników na żądanie. Szczegóły: [wyszukiwanie wyjazdów](TRIP_DISCOVERY.md).

`FavoritesProvider` jest częścią stanu konta. Żądania są przypinane do tokenu konkretnego użytkownika. Zapisy blokują ponowne wysłanie tej samej operacji w trakcie oczekiwania, a stary odczyt nie nadpisze nowszego zapisu. Monitoring używa etykiet `favorites.load` i `favorites.save`, bez treści profili i tokenów.

Osobny podgląd `start:demo` pozwala wybierać ulubione wyłącznie w pamięci. Nie korzysta z bazy ani nie zachowuje wyborów po przeładowaniu. Nie jest zwykłą aplikacją Dev.

## Weryfikacja

`node --test scripts/favorites.test.mjs scripts/favorites-backend.test.mjs` sprawdza potwierdzone zapisy, ponowienia, opóźnione odczyty, izolację kont, wiele sesji, filtry przed limitem 20, licznik, niedostępne cele i kaskadowe usuwanie.

Playwright sprawdza serduszka w listach i szczegółach, przeładowanie aplikacji, filtry i ich licznik, odfiltrowanie po usunięciu serduszka, synchronizację dwóch sesji, zmianę konta oraz ponowienie po utracie odpowiedzi już zatwierdzonego zapisu. Zrzuty kontrolne są w ignorowanym `.expo/`.

Przeszło 310 testów Node. Po wdrożeniu wykonano test prawdziwego API Dev na trzech tymczasowych kontach: zapis obu typów ulubionych, ponowienia, druga sesja, izolacja trzeciego konta, filtr i licznik, ukrywanie, blokada oraz usunięcie wyjazdu. Konta, profile i testowe zgłoszenie usunięto po weryfikacji. Sprawdzono też bundle Androida wskazujący Dev i nowe RPC. Testy na fizycznych telefonach pozostają osobnym krokiem.

Nie dodano bibliotek natywnych ani nie przebudowywano APK; w Dev wystarczy odświeżyć aplikację.
