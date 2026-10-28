# RazemGo

Aplikacja do poznawania osób podróżujących kamperem, przyczepą, kampervanem, namiotem lub samochodem. Obsługuje rodziny, pary, osoby solo i grupy znajomych. Główną platformą jest Android; zachowujemy działanie webu.

## Środowiska

| | Dev | Preview |
| --- | --- | --- |
| Android | `pl.razemgo.app.development` | `pl.razemgo.app.dev` |
| Schemat linków | `razemgo-dev` | `razemgo` |
| Supabase | `kswuakzcnoqgovnwejhb` | `tueqqnbdvuazdxoqtpvk` |
| Konfiguracja lokalna | `.env.local` | `.env.preview.local` |
| EAS | `development` | `preview` |

Pracujemy w Dev. Preview ma własne konta, dane i samodzielny APK dla testerów. Zmiana kodu lub wdrożenie do Dev nie aktualizuje Preview. Procedura wydawania: [ENVIRONMENTS.md](docs/ENVIRONMENTS.md).

## Uruchomienie

Wymagane są Node.js 24.3 lub nowszy z linii 24 i npm. Projekt używa Expo SDK 58, React Native 0.88 i Expo Router. Konfiguracja pochodzi z `app.json` i `app.config.js`; katalogi natywne są generowane przez Expo.

```powershell
npm ci
# Utwórz .env.local na podstawie .env.example i ustaw publiczne dane Supabase Dev.
npm run check:dev
npm run start:dev
```

Do Google i push używaj APK Dev zbudowanego przez `npm run build:dev`, nie Expo Go. Dev wymaga Metro. Aktualizacja modułów natywnych wymaga nowego APK. Web uruchamia `npm run web`.

Do `EXPO_PUBLIC_*` trafiają wyłącznie publiczne dane konfiguracji. Sekrety Google, klucze administracyjne Supabase i Firebase pozostają poza aplikacją i repozytorium. Konfiguracja logowania, SMTP i usuwania konta: [supabase/README.md](supabase/README.md).

## Aktualne funkcje

- **Konto i profil:** Google lub e-mail/hasło, potwierdzenie adresu, reset hasła, onboarding, trwała sesja, wylogowanie i usuwanie konta. Jedno konto zarządza jedną ekipą. Profile mają ilustrowany avatar, nazwę do 20 znaków i numer widoczny w szczegółach profilu.
- **Start:** dwa główne skróty, najnowsze dostępne ogłoszenie i dzwonek. „Znajdź ekipę” otwiera Odkrywaj z wyzerowanymi filtrami.
- **Wyjazdy:** „Mam plan” i „Szukam pomysłu”, szkice, publikacja, edycja, pauza, wznowienie, zakończenie, anulowanie, duplikowanie i usuwanie. Nagłówek powstaje z opisu. Tolerancja dat występuje wyłącznie w wyszukiwaniu. Mapa i oś czasu uzupełniają szczegóły.
- **Odkrywaj:** aktualne wyjazdy i widoczne ekipy. Filtry, zgodność i liczniki oblicza Supabase. Listy pobierają po pięć elementów, są wirtualizowane i zachowują miejsce po powrocie ze szczegółów. [Wyjazdy](docs/TRIP_DISCOVERY.md), [ekipy](docs/GROUPS.md), [wydajność list](docs/LIST_PERFORMANCE.md).
- **Społeczność:** obecność online, ulubione ekipy i wyjazdy, pozytywne reakcje na ogłoszenia. Zwierzęta są zwykłą preferencją, bez automatycznego wykluczania ekip. [Obecność](docs/PRESENCE.md), [ulubione](docs/FAVORITES.md), [reakcje](docs/REACTIONS.md).
- **Kontakt:** zaproszenia z wyjazdu lub profilu, rozmowa po akceptacji, historia, odczyty, ponawianie wysyłki, blokady i zgłoszenia. Kontakty w szczegółach wyjazdu oznaczają zaakceptowane rozmowy, nie potwierdzone uczestnictwo.
- **Powiadomienia:** trwała historia, synchronizacja odczytu i ustawień, push o wiadomościach, zaproszeniach, reakcjach i ogłoszeniach ulubionych ekip. Dostarczanie ma kolejkę, rezerwacje, retry i kontrolę receipts. [Instrukcja push](supabase/PUSH.md).
- **Moderacja:** panel `/admin` dla uprawnionego konta, zgłoszenia, zachowane dowody, ukrywanie ogłoszeń, zawieszanie kont i audyt decyzji. [MODERATION.md](docs/MODERATION.md).
- **Monitoring:** Sentry aplikacji i backendu z ograniczeniem raportowanych pól; niezależny monitor push i heartbeat Sentry Crons. [MONITORING.md](docs/MONITORING.md), [PUSH_HEALTH.md](docs/PUSH_HEALTH.md).

Wyłącznie kod i backend Dev zawierają obecnie reakcje na wiadomości i automatyczne propozycje tworzone co minutę, ze zbiorczymi push co pięć minut. Etap 0 rozszerza monitoring i aktualizuje narzędzia. Preview 1.2.0 pozostaje osobnym wydaniem. [Reakcje wiadomości](docs/CHAT_REACTIONS.md), [propozycje](docs/PROPOSAL_NOTIFICATIONS.md), [etap 0](docs/STAGE_0.md).

W bazie obowiązują RLS i serwerowa kontrola uprawnień. Zapis jest potwierdzany po odpowiedzi backendu. Prywatne preferencje nie są udostępniane innym kontom; jawne dane zwracają osobne funkcje wyszukiwania. Nowe konta zaczynają bez własnych przykładowych wyjazdów i rozmów.

## Kontrole i CI

```powershell
npm run lint
npm run typecheck
npm test
npm run test:web
npx expo install --check
npx expo-doctor
```

Node sprawdza logikę oraz rzeczywiste migracje i uprawnienia w lokalnym PostgreSQL/PGlite, bez Dockera. Playwright uruchamia osobne Metro na porcie 8085 i kontrolowane API, bez prawdziwych kont lub backendów Dev/Preview.

GitHub Actions uruchamia te kontrole, testy Edge Functions i eksporty Androida oraz webu dla push i pull requestów. Używa fikcyjnej konfiguracji, nie otrzymuje sekretów i niczego nie wdraża. Raporty nieudanych testów przeglądarkowych są przechowywane siedem dni.

Google, dostarczenie e-maila, klawiatura Androida i rzeczywiste push wymagają oddzielnej kontroli na telefonach. Eksport i test przeglądarkowy nie potwierdzają działania tych usług na urządzeniu.

## Wdrożenia

```powershell
npm run backend:dev -- plan
npm run backend:dev -- migrate
# Deploy wybranej funkcji zgodnie z instrukcją konkretnej zmiany.
npm run build:dev
```

Skrypty wybierają jawnie środowisko i sprawdzają izolację. Migracje dodajemy jako nowe pliki, zachowując zgodność starszych klientów. Nie kopiujemy danych między bazami i nie resetujemy ich przy budowaniu APK. Aktualizacja Preview jest osobnym wydaniem: [PREVIEW.md](docs/PREVIEW.md).

## Podgląd demonstracyjny i zasoby

`npm run start:demo` włącza lokalny podgląd fikcyjnych danych; nie jest źródłem danych prawdziwego konta. Powitanie zawsze korzysta z pięciu przykładowych ogłoszeń. [Historyczny opis prototypu](docs/archive/INTERFACE_PROTOTYPE.md) nie opisuje aktualnego zachowania aplikacji.

Polski katalog miejscowości pochodzi z [jjbartek/polskie-miejscowosci](https://github.com/jjbartek/polskie-miejscowosci). Metadane źródła i licencji: `src/data/locations/polish-localities-source.json` oraz `data/locations/`. Aktualizacja: `npm run locations:import`.
