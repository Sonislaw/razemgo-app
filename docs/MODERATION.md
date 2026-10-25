# Panel administracyjny RazemGo

Panel jest częścią aplikacji webowej pod `/admin`. Działa z rzeczywistymi zgłoszeniami Supabase, w układzie dwóch kolumn na komputerze i z osobnym widokiem szczegółów na wąskim ekranie. Nie używa klucza administracyjnego w przeglądarce. Brak zgłoszeń oznacza pustą kolejkę; nie dodajemy do niej fikcyjnych spraw.

## Otwieranie

1. Uruchom aplikację: `npx expo start --dev-client`.
2. Otwórz w przeglądarce [panel lokalny](http://localhost:8081/admin). Zaloguj się tym samym kontem, któremu nadano rolę. Gdy logowanie skieruje na Start, otwórz adres ponownie albo przejdź do **Profil → Ustawienia → Panel administracyjny**.
3. Jeśli nadano rolę w trakcie działania aplikacji, użyj odświeżenia albo poczekaj do 30 sekund. Dostęp jest ponownie sprawdzany przy odtworzeniu sesji i powrocie aplikacji na pierwszy plan.

Migrację `202610240007_moderation.sql` wdrożono w testowym projekcie `tueqqnbdvuazdxoqtpvk`. Zgodnie z dyspozycją użytkownika rola została przypisana wskazanemu, potwierdzonemu kontu. Adres konta nie jest zapisany w kodzie ani dokumentacji. Serwer Metro na 8081 udostępnia bieżący kod; nowe APK nie jest potrzebne do tych zmian JavaScript. Test na fizycznym telefonie i wejście na prawdziwym koncie użytkownik potwierdza osobno.

## Obsługa zgłoszeń

- Lista pokazuje ekipę, powód, rodzaj treści, autora zgłoszenia, czas i status. Są filtry **Otwarte, Nowe, W trakcie, Zamknięte, Wszystkie**, wyszukiwanie ekipy/powodu oraz stronicowanie po 25 spraw.
- Szczegóły zawierają zapis z chwili zgłoszenia. Dla rozmowy jest to maksymalnie 20 ostatnich wiadomości z momentu zgłoszenia. Panel nie daje administratorowi API do przeglądania dowolnych, niezgłoszonych rozmów. Aktualna edycja ogłoszenia nie zastępuje jego zachowanego zapisu.
- Statusy można zmieniać między **Nowe**, **W trakcie** i **Zamknięte**. Zamkniętą sprawę można otworzyć ponownie.
- Każda decyzja wymaga uzasadnienia o długości 8–500 znaków i potwierdzenia. Historia pokazuje działanie, administratora, uzasadnienie i czas. Zapis decyzji oraz wpis do historii są jedną transakcją.
- Ponowienie po utracie odpowiedzi używa tego samego klucza żądania. Nie tworzy drugiej decyzji. Ochrona wersji wykrywa zmianę przez drugiego administratora; przed kolejnym działaniem trzeba odświeżyć szczegóły.

### Ukrywanie ogłoszeń

Ukryty wyjazd znika z Odkrywaj i propozycji. Nowe zaproszenia odnoszące się do ukrytego planu są blokowane przez bazę. Plan pozostaje na liście właściciela z informacją o moderacji; edycja statusu lub treści nie usuwa blokady. Administrator może przywrócić widoczność z tej samej sprawy. Wtedy nadal obowiązują daty, status i publiczna widoczność planu. Istniejące rozmowy nie są kasowane.

### Blokowanie kont

To blokada dostępu do **RazemGo**, przechowywana w bazie. Nie usuwa konta Auth ani danych ekipy i nie blokuje konta Google. Użytkownik może zalogować się, lecz zobaczy informację o blokadzie. Nadal może się wylogować lub potwierdzić usunięcie własnego konta.

RLS oraz współdzielone funkcje RPC ograniczają stare, nadal ważne JWT: profil i plany nie są dostępne, nie można publikować, wysyłać wiadomości, zaproszeń ani korzystać z powiadomień. Inne osoby nie otrzymują nowych propozycji tej ekipy i nie mogą nawiązać z nią nowego kontaktu. Tokeny push blokowanego konta są usuwane, a kolejka weryfikuje stan obu stron przed wysyłką. Wysłanego już do dostawcy powiadomienia nie można cofnąć.

Odblokowanie przywraca dostęp do danych i funkcji. Rejestracja telefonu następuje ponownie zgodnie z ustawieniami push; historyczne alerty nie są odtwarzane. Administrator nie może zablokować siebie ani innego konta administracyjnego z panelu.

## Skąd trafiają zgłoszenia

W szczegółach cudzego wyjazdu działa **Zgłoś ogłoszenie**. Wybrany powód i zapis planu trafiają do kolejki. W menu bezpieczeństwa rozmowy pozostaje **Zgłoś konto**. Powody: Spam, Niewłaściwe treści, Podszywanie się, Inny powód. Limit wynosi 20 nowych zgłoszeń dziennie na ekipę; ponowienie już przyjętego zgłoszenia nie zużywa kolejnego wpisu. Nie można zgłosić własnego, prywatnego, zakończonego lub niedostępnego planu. Wariant demonstracyjny nie zapisuje zgłoszeń wyjazdów do backendu.

## Uprawnienia i wdrożenie

Rola jest w `moderation_private.administrators`. Ustawienia `user_metadata`, parametry URL i dane przysłane przez formularz nie nadają uprawnień. Każde administracyjne RPC sprawdza rolę w bazie przy wywołaniu. Zmiana lub odebranie roli działa bez wymiany JWT. Zwykłe konto nie odczyta tabel zgłoszeń, ról, blokad i historii ani nie zapisze w nich zmian bezpośrednio.

Akcje przyjmują identyfikator zgłoszenia; cel wyjazdu lub konta wynika z tego zgłoszenia po stronie bazy. Interfejs nie może podstawić dowolnego właściciela. Stany panelu nie są zapisywane w localStorage; wylogowanie i zmiana konta usuwają stan poprzedniego użytkownika. Monitoring błędów nadal odrzuca treść zgłoszeń, uzasadnienia i wiadomości.

Dla kolejnego środowiska:

```powershell
npx supabase@latest db push --linked
node scripts/manage-admin.mjs grant administrator@example.com
```

Konto musi już istnieć i mieć potwierdzony adres. Skrypt sprawdza, czy połączony projekt odpowiada konfiguracji aplikacji, aktualizuje dokładnie jedno konto i zapisuje zmianę w audycie. Działa wyłącznie z zaufanym CLI bazy. Nie publikuj skryptu ani klucza serwerowego jako API panelu. Odebranie roli: `node scripts/manage-admin.mjs revoke administrator@example.com`. Tymczasowy plik SQL jest ignorowany przez Git i usuwany po wykonaniu; dane konta nie są wypisywane w wyniku skryptu.

## Weryfikacja

```powershell
npm run test:moderation
npm test
npm run test:web
npm run lint
npm run typecheck
npx supabase@latest db query --linked --file scripts/check-moderation-remote.sql
```

Test zdalny tworzy odizolowane konta testowe, sprawdza uprawnienia, ukrycie, blokadę, przywracanie i historię, po czym wykonuje `ROLLBACK`. Nie zmienia prawdziwych spraw ani użytkowników; zaplanowane przez fixture wywołania `pg_net` też są cofane. Testy przeglądarki używają fikcyjnego backendu i DSN, a nie rzeczywistych wiadomości użytkowników.

Weryfikacja 25.10.2026: lint, TypeScript i **250 testów Node** przeszły. Przeszły również **21 różnych scenariuszy Playwright**, w tym 4 scenariusze panelu: praca na komputerze, odmowa dostępu zwykłemu kontu, obsługa na wąskim ekranie i ponowienie po błędzie oraz odtworzenie sesji zablokowanego konta z możliwością wylogowania. Zdalny test transakcyjny potwierdził uprawnienia, decyzje i audyt; wszystkie fixture zostały cofnięte. Eksporty webu i Androida zakończyły się powodzeniem. Pozostaje wcześniejsze ostrzeżenie zależności Sentry/Expo Router o opcjonalnym `router-store`; nie zmieniano wersji pakietów w tym zadaniu. Wygląd sprawdzono w przeglądarce na szerokości 1440 i 390 px. Test fizycznego telefonu, rzeczywistego logowania administratora oraz publicznego hostingu nie należał do wykonanych kontroli.

Pierwsza wersja nie obejmuje zbiorczego przeglądania kont, arbitralnego podglądu rozmów, automatycznej oceny treści ani nadawania ról z panelu. Historia i snapshoty zgłoszeń pozostają materiałem moderacyjnym po usunięciu powiązanej treści; przed pilotażem trzeba ustalić ich retencję i opisać obsługę zgłoszeń w zasadach aplikacji. Panel działa obecnie na serwerze deweloperskim; publiczny hosting webowy jest osobnym wdrożeniem.

Źródła: [Expo Router — protected routes](https://docs.expo.dev/router/advanced/protected/), [Supabase — RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
