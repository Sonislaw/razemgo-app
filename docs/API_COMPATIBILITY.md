# Kontrakty wydań

| Wydanie aplikacji | Bieżące odczyty |
| --- | --- |
| Preview 1.3.0 | V1: `search_public_trips`, `get_discovery_trip`, `list_ranked_public_groups`, wcześniejsze odczyty profilu |
| Dev z 31.10 przed 1.4.0 | V3: `search_public_trips_v3`, `list_public_groups_v3`, `get_discovery_trip_v3`, `get_public_group_v3`, odświeżenia V3 |
| 1.4.0 | Te same V3 z dodatkowym `result_revision`; `list_my_trip_page` z rewizją; `get_my_sync_state` z osobnymi domenami zmian |

Stare RPC i pola bazy zachowano dla zainstalowanych klientów i procesu propozycji. Modele aktualnego interfejsu nie przywracają preferencji `matching`; referencyjne testy V1 robią to przez adapter w `scripts/support/legacy-matching`.

Dodanie obowiązkowego składu wyjazdu jest wcześniejszą zmianą Dev promowaną w 1.4.0: starsze APK bez tego formularza wymagają aktualizacji do publikowania i edycji treści wyjazdu. Odczyt starszych ogłoszeń, pauzowanie i archiwizacja pozostają obsługiwane; nie przypisujemy historycznym wyjazdom składu z dzisiejszego profilu. Przy edycji należy go uzupełnić.

Nie usuwać V1/V2 ani dawnych kolumn bez osobnej decyzji o zakończeniu obsługi starszych wydań. Rewizja strony jest optymalizacją cache, nie uprawnieniem; każdy odczyt nadal sprawdza sesję, widoczność, zawieszenie i blokady.

1.11.2026 Dev otrzymał migracje `202611010001_profile_about.sql` i
`202611010002_always_visible_groups.sql`. `save_my_profile` zapisuje opcjonalny
opis `about` w tej samej transakcji i zwraca go w odpowiedzi. Profile są zawsze
dostępne dla zalogowanych użytkowników, z zachowaniem blokad i moderacji.
Stare RPC ustawień profilu zachowują sygnatury i zapis opisu, ale ignorują żądanie
ukrycia oraz zwracają `discoverable=true`. Kolumnę zabezpiecza ograniczenie bazy;
bieżący klient nie korzysta z tego ustawienia ani jego RPC. Preview pozostaje
przy backendzie wydania 1.4.0 i wymaga obu migracji przy przyszłej promocji.
