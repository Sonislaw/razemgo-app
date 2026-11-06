# Paszport podróżnika — Dev

Paszport znajduje się w profilu ekipy, pod opisem. Otwiera kolekcję 14 kategorii pamiątkowych odznak. Własna kolekcja pokazuje postęp do kolejnego stopnia, wymagania i daty przyznania. Inne ekipy widzą zdobyte stopnie i poziom, bez prywatnych liczników aktywności. Poziom pojawia się też na kartach ekip, kartach wyjazdów i przy organizatorze w szczegółach.

| Odznaka | Co naliczamy | Progi |
| --- | --- | --- |
| Poznajcie nas | Opis ekipy min. 20 znaków i zainteresowania | 1 |
| Organizator | Pierwsze publiczne publikacje „Mam plan” | 1 / 5 / 15 / 40 |
| Łowca pomysłów | Pierwsze publiczne publikacje „Szukam pomysłu” | 1 / 3 / 10 / 25 |
| Rozmówca | Wysłane wiadomości po zaakceptowaniu kontaktu | 10 / 50 / 200 / 500 |
| Dobry kompan | Różne ekipy z przyjętym zaproszeniem | 1 / 5 / 15 / 40 |
| Planer przygód | Różne wyjazdy dodane do ulubionych | 1 / 10 / 30 / 75 |
| Bliska ekipa | Różne ekipy dodane do ulubionych | 1 / 5 / 15 / 40 |
| Dobra energia | Różne wyjazdy z zostawioną reakcją | 1 / 10 / 30 / 100 |
| Małe gesty | Różne wiadomości z zostawioną reakcją | 1 / 10 / 50 / 150 |
| Własny kompas | Nowe zestawy różnych kryteriów filtrów | 1 / 3 / 5 / 10 |
| Stały bywalec | Dni korzystania z aplikacji, według czasu w Polsce | 1 / 7 / 30 / 100 |
| Nowe horyzonty | Różne miejscowości z pierwszych publikacji planów | 1 / 5 / 15 / 30 |
| Pod gwiazdami | Publiczne plany z podaną nazwą kempingu | 1 / 3 / 10 / 25 |
| Cztery krajobrazy | Morze, jezioro, góry, las z pierwszych publikacji planów | 1 / 2 / 3 / 4 |

Stopnie to Brąz, Srebro, Złoto i Platyna. Każdy nowy stopień dodaje odpowiednio **10, 20, 35 i 60 pkt** (łącznie 125 pkt za cztery stopnie kategorii). Można zdobyć 53 odznaki i maksymalnie 1635 pkt. „Poznajcie nas” ma jeden stopień.

| Poziom | Nazwa | Punkty od |
| --- | --- | --- |
| 1 | Początek drogi | 0 |
| 2 | W drodze | 30 |
| 3 | Odkrywcy | 100 |
| 4 | Podróżnicy | 250 |
| 5 | Doświadczona ekipa | 500 |
| 6 | Przewodnicy | 800 |
| 7 | Legenda szlaku | 1150 |
| 8 | Dookoła świata | 1500 |

Przy zdobyciu kolejnej odznaki pojawia się krótka informacja z przejściem do paszportu. Pierwsze wczytanie wcześniejszych osiągnięć nie wyświetla serii powiadomień. Nie wysyłamy dodatkowych pushy.

## Naliczanie i prywatność

- Liczniki oraz punkty są własnością serwera. Klient nie przesyła liczb ani żądanego poziomu.
- Zdarzenia mają trwałe klucze; ponowne wysłanie żądania, zmiana reakcji, usunięcie i dodanie tego samego ulubionego nie zwiększają wyniku. Dla filtrów rozpoznajemy tę samą treść i zakładkę niezależnie od nazwy zestawu.
- Osiągnięcia zostają po usunięciu dawnego wyjazdu, wiadomości czy ulubionego. Usunięcie konta usuwa cały jego paszport. Po ostatnim progu nie zbieramy dalszych identyfikatorów zdarzeń danej kategorii.
- Szkice i prywatne plany nie zwiększają postępu publikacji. Rodzaj, miejscowość i krajobraz zaliczamy przy pierwszej publicznej publikacji; dodanie kempingu później też może dać odznakę.
- Dni aktywności nie muszą następować po sobie; kilka urządzeń nie mnoży wyniku. Nie odtwarzamy historycznych dni logowania.
- Migracja zalicza istniejące, dostępne w bazie publikacje, kontakty, wiadomości, reakcje, ulubione, filtry i uzupełniony profil. Usunięta historia pozostaje nieznana.
- Publiczny poziom to aktywność w aplikacji. Opublikowanie planu nie stanowi dowodu odbycia podróży ani oceny wiarygodności ekipy.
- Dostęp do cudzego paszportu respektuje blokady, zawieszenia i usunięcie konta. Dokładne liczniki są dostępne wyłącznie właścicielowi z aktywną sesją.

## Wdrożenie

Migracja `202611050001_traveler_passport.sql` tworzy prywatne tabele, triggery i dwa RPC. Mały agregat poziomu jest częścią istniejących odpowiedzi wyszukiwania, bez żądania dla każdej karty. Domena synchronizacji `passport` odświeża własny postęp po aktywności i między urządzeniami.

Interfejs jest włączony wyłącznie dla wariantu Dev (oraz lokalnego demo). Preview i Production nie są częścią tego wdrożenia. Katalog i progi znajdują się w `shared/passport-catalog.json`; zmiany reguł serwerowych wymagają kolejnej migracji.

Weryfikacja: `node --test scripts/passport.test.mjs scripts/passport-backend.test.mjs`, `npx playwright test scripts/browser/passport.spec.mjs`, lint i TypeScript.
