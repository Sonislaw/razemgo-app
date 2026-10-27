# Wylogowanie z urządzenia

Zmiana przygotowana na Dev. Nie wymaga migracji bazy ani nowego development
builda. Preview otrzyma ją dopiero z kolejnym wydaniem.

Wylogowanie wykonuje równolegle trzy niezależne czynności: zakończenie obecności
online, wyrejestrowanie urządzenia push i usunięcie powiadomień z telefonu. Mają
wspólny limit 3 sekund. Przekroczenie limitu anuluje żądanie wyrejestrowania push
i pozwala przejść do usunięcia sesji. Żądanie push jest przypisane do tokenu
konta, z którego użytkownik się wylogowuje.

Następnie aplikacja próbuje odwołać bieżącą sesję przez publiczne wywołanie SDK
`auth.admin.signOut(userAccessToken, 'local')`. Wykorzystuje ono token samego
użytkownika, bez klucza administracyjnego, i ma limit 5 sekund. Nie odświeża
tokenu przed wylogowaniem. Pozostałe żądania Auth mają limit 10 sekund; zapytania
do danych zachowują własne limity i sygnały anulowania.

Niezależnie od odpowiedzi serwera aplikacja usuwa sesję z SecureStore lub
localStorage, a następnie wywołuje `auth.signOut({ scope: 'local' })` bez zapisanej
sesji. SDK usuwa stan PKCE i emituje `SIGNED_OUT`; wszystkie dane konta w
providerach są usuwane przez ich ponowne zamontowanie. Błąd faktycznego usunięcia
sesji z pamięci urządzenia jest zgłaszany użytkownikowi. Uszkodzony manifest
sesji nie blokuje jego usunięcia.

Brak połączenia uniemożliwia potwierdzenie odwołania sesji i wyrejestrowania push
na serwerze, lecz nie blokuje lokalnego wylogowania. Aktywny status obecności
wygasa zgodnie z mechanizmem obecności. Pozostałe urządzenia pozostają zalogowane.

Weryfikacja:

- `node --test scripts/auth-sign-out.test.mjs scripts/auth.test.mjs` — prawdziwy
  klient Supabase z adapterem dzielonego zapisu SecureStore; błędy sieci i
  serwera, transport ignorujący anulowanie, wygasła sesja, spóźnione odświeżenie
  tokenu i odpowiedź wylogowania, zmiana konta oraz uszkodzenie i błąd pamięci.
- `npx playwright test scripts/browser/auth.spec.mjs` — logowanie i onboarding,
  wylogowanie przy niedziałającym Auth i obecności, ponowne otwarcie aplikacji,
  ochrona tras i izolacja kolejnego konta; ponadto Google PKCE i odzyskiwanie hasła.

Testy przeglądarkowe korzystają wyłącznie z odizolowanego backendu testowego.
Próba na fizycznym telefonie pozostaje osobnym sprawdzeniem.
