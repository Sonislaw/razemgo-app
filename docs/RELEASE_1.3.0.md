# RazemGo 1.3.0 — Preview i klient deweloperski

## Zakres wydania

Wydanie przenosi bieżący, sprawdzony kod Dev na Preview. Zachowuje wygląd aplikacji, porcje po pięć w Odkrywaj i ogłoszeniach ekipy oraz powrót do obejrzanej karty.

- Reakcje na otrzymane wiadomości, wybierane przytrzymaniem, i poprawki stabilności rozmowy oraz wylogowania.
- Automatyczne propozycje bez otwartej aplikacji, zbiorcze push i monitoring harmonogramu oraz wieku kolejki.
- Jedna synchronizacja konta, odświeżanie aktywnej rozmowy, lżejsze podsumowania i stronicowanie własnych wyjazdów oraz skrzynki.
- Optymalizacja rankingu przy zachowaniu wyników i kolejności. Słownik miejscowości jest inicjalizowany dopiero przy wyszukiwaniu, a ilustracje zoptymalizowane.
- Bezpieczne anulowanie żądań po zmianie konta, limity zapisów, kontrola dostępu i ograniczenie nawigacji map.
- Widoczna wersja zainstalowanego APK w ustawieniach, zgodne poprawki 12 pakietów SDK 58 i mapy źródeł Preview w Sentry.

Szczegółowe raporty: [architektura](ARCHITECTURE_HARDENING.md), [ranking na różnych danych](DIVERSE_RANKING_OPTIMIZATION.md), [monitoring](MONITORING.md).

## Backend i dane testerów

Preview `tueqqnbdvuazdxoqtpvk` otrzymało 12 migracji od `202610270001_message_reactions.sql` do `202610280009_relative_ranking_keys.sql` i aktualne funkcje `delete-account`, `dispatch-push`, `monitor-push`. Oba backendy mają **35 migracji**; końcowe plany nie zgłaszają zaległości. Nie modyfikowano wcześniejszych plików migracji ani nie resetowano baz.

Przed wdrożeniem zapisano lokalną, ignorowaną kopię 27 tabel oraz identyfikatorów kont, bez haseł i danych logowania Auth. Porównanie po wdrożeniu potwierdziło zachowanie **34 kont, 34 profili i preferencji, 158 ogłoszeń, 48 wiadomości, 7 zaproszeń oraz administratora**. Nie kopiowano kont ani ogłoszeń Dev. Ustawienia Google, SMTP, Firebase i osobne klucze dispatchera pozostały zachowane.

Harmonogramy `razemgo-dispatch-push` i `razemgo-proposals` wykonują się co minutę, a `razemgo-monitor-push` co pięć minut. Kontrola potwierdziła udane wykonania, brak zaległości i przyjęty heartbeat Sentry z HTTP 200. Backend Preview zachowuje historyczne środowisko monitoringu `development` i monitor `razemgo-push-health`; Dev używa `dev` oraz `razemgo-push-health-dev`. Wersję backendu Preview oznaczono `1.3.0`.

Weryfikacja objęła 123 kontrakty funkcji i 14 tabel publicznych z RLS, odmowę anonimowym żądaniom pięciu sprawdzonych RPC oraz trzem Edge Functions i odmowę diagnostyki zwykłym kontom. W hostowanym Supabase zachowano dodatkowe serwerowe uprawnienia `service_role` do 58 funkcji publicznych oraz istniejący helper monitora dostępny wyłącznie właścicielowi. Role klientów, prywatne helpery, sygnatury i ustawienia funkcji są zgodne z przejrzanym manifestem.

Test rzeczywistego API na tymczasowych kontach potwierdził zapis i ponowne pobranie profilu, izolację dwóch kont, strony 5+2, ranking, ulubione, obecność, zaproszenie, rozmowę, reakcje wiadomości i nowe liczniki. Konta kontrolne i ich dane usunięto. Test nie rejestrował urządzeń push ani nie wysyłał wiadomości e-mail i fizycznych push.

## Weryfikacja kodu

- Lint, TypeScript, kontrola granic źródeł i sekretów, zgodność wersji aplikacji.
- **512 testów Node/PGlite**, **59 scenariuszy Playwright**, **5 testów Edge Functions z 12 krokami**.
- Zgodność pakietów SDK 58 i **20/20 Expo Doctor**.
- Statyczny eksport webowy z rzeczywistą publiczną konfiguracją Preview: logowanie i chronione trasy, brak narzędzi Dev oraz oczyszczony raport Sentry z `environment=preview`. W tym teście API i telemetria były przechwycone.
- Metro na 8081: manifest `RazemGo Dev`, wersja 1.3.0, schemat `razemgo-dev`, aktualne kontrakty w bundlu Androida i backend Dev; brak adresu Preview i tokena Sentry w bundlu.

Wcześniejszy przebieg CI z rzeczywistym PostgreSQL/PostgREST oraz pomiarami rankingu opisano w [raporcie rankingu](DIVERSE_RANKING_OPTIMIZATION.md). Nie ponawiano obciążenia 200 sesji na hostowanym Preview. Wyniki syntetycznego CI nie stanowią pomiaru zasobów tego projektu.

## APK i dalsza praca

Budowy EAS wydania 1.3.0:

| | Preview | Dev |
| --- | --- | --- |
| Profil EAS | `preview` | `development` |
| Pakiet | `pl.razemgo.app.dev` | `pl.razemgo.app.development` |
| Numer kompilacji | 6 | 2 |
| Działanie | Samodzielne, bez Metro | Klient deweloperski z Metro |
| Build | [4c353a24](https://expo.dev/accounts/sonislaw/projects/razemgo/builds/4c353a24-8ae2-4b06-82b9-956c8cfceba0) | [e6a27459](https://expo.dev/accounts/sonislaw/projects/razemgo/builds/e6a27459-76f1-4e29-b0b5-7fcc8e7d1f04) |
| APK | [Pobierz Preview](https://expo.dev/artifacts/eas/pcWqLjohJqT-f-19Ohm98rRPAT5mm_28Oy47vIOOyfc.apk) | [Pobierz Dev](https://expo.dev/artifacts/eas/zxbjhTQ_UJbaYmy94iElffAe2QMzqT8HYaBnTqvGiGg.apk) |

Dev zakończył się `FINISHED` 28.10.2026 o 22:59 UTC. Pobrany APK ma wersję **1.3.0 (2)**, `debuggable=true`, Dev Launcher i schemat `razemgo-dev`. Potwierdzono zasoby właściwej aplikacji Firebase Dev i brak zasobów Firebase Preview. Certyfikat podpisujący jest identyczny jak w poprzednim APK Dev. Rozmiar: **285 860 686 B**, SHA-256: `48ffd638c41943367c48fab1b342742f5510360a2249790dc47f6e9d63f1f7fc`.

Preview zakończyło się `FINISHED` 28.10.2026 o 23:07 UTC (29.10 po północy w Polsce). Pobrany APK ma wersję **1.3.0 (6)**, `debuggable=false`, lokalny bundle JS i brak Dev Launchera. Potwierdzono właściwy callback Google i zasoby Firebase Preview, nowe kontrakty aplikacji oraz brak adresu backendu Dev, zasobów Firebase Dev i prywatnego tokena Sentry. Automatyczna inicjalizacja natywna Sentry pozostaje wyłączona w manifeście. Certyfikat podpisujący jest identyczny jak w Preview 1.2.0: SHA-256 `940e42096e575610a5ccb398147c85237e9261066684f5b7a2f1c59d32ed9757`. Rozmiar APK: **122 042 298 B**, SHA-256 pliku: `16a5b48bbec7d745929acc5ec5c48ff6d40937e22ac41d14a6791ea671ee5a7d`.

W logach Preview potwierdzono przyjęcie map źródeł przez Sentry, bez błędów uploadu. Development buduje wariant debug bez produkcyjnego zadania uploadu bundla aplikacji; jego logi nie stanowią potwierdzenia wysłania map release. Symbolikację konkretnego zdarzenia z fizycznego telefonu należy sprawdzić osobno.

Instaluj każdy APK na odpowiadającej mu aplikacji, bez odinstalowywania. Preview i Dev pozostają obok siebie, z oddzielnymi danymi. Nowy APK Dev zastępuje samodzielny build `performance` i przywraca Dev Launcher. Do dalszej pracy:

```powershell
npm run check:dev
npm run start:dev
```

Telefon i komputer muszą być w tej samej sieci. Kolejne zmiany JavaScript odświeża Metro; zmiany modułów natywnych wymagają kolejnego APK Dev. Nie publikuj kolejnych zmian backendu ani aplikacji do Preview bez osobnego polecenia.

Podczas przekazania Metro działa pod `http://192.168.1.6:8081` (adres Wi-Fi tego komputera). Po zmianie sieci użyj bieżącego adresu pokazanego przez Expo; adres LAN nie jest stałą konfiguracją aplikacji.

Na fizycznym telefonie pozostają do sprawdzenia aktualizacja z poprzedniego APK, Google i powrót z przeglądarki, klawiatura, odbiór i otwieranie push. Testy komputerowe ich nie zastępują.
