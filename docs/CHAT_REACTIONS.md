# Stabilność rozmowy i reakcje na wiadomości — Dev

Etap z 27.10.2026 działa w **RazemGo Dev** na `kswuakzcnoqgovnwejhb`. Migracja `202610270001_message_reactions.sql` jest wdrożona tylko do Dev. Preview pozostaje przy wydaniu 1.2.0 i 23 migracjach; Dev ma 24 migracje. Wystarczy odświeżyć aplikację Dev, bez nowego development buildu.

## Przewijanie

Poprzedni ekran wywoływał `scrollToEnd` przy każdym `onLayout`, również podczas czytania historii i zmiany wysokości po otwarciu klawiatury. Odświeżanie historii wstawiało dodatkowy wiersz ładowania, a zwykłe wysyłanie chwilowo dodawało komunikat o niedostępności nad polem tekstowym. Ilustracja w stopce listy także uczestniczyła w obliczaniu jej wysokości.

Lista jest teraz odwrócona: najnowsza wiadomość ma offset 0 i jest widoczna od razu, bez przewijania przez niezmierzone wiersze. Ilustracja jest nieruchomym tłem. Odświeżenia w tle zachowują geometrię, a pole tekstowe nie jest blokowane globalnym stanem innych operacji. Kontroler przewijania rozróżnia czytanie historii, nowe wiadomości, zmianę wysokości i świadome wysłanie wiadomości. Natywne zachowanie widocznej pozycji chroni historię przy doładowywaniu.

## Reakcje

- Sześć możliwości: ❤️ Serce, 👍 Super, 😂 Haha, 🤩 Ale fajnie!, 🤗 Uściski i 🙏 Dzięki.
- Dłuższe przytrzymanie odebranej wiadomości otwiera wybór. Bez wybranej reakcji nie pokazujemy domyślnej emotki ani pustego przycisku. Wybrana reakcja ma formę małej pastylki nachodzącej na dolne obramowanie dymka, po prawej stronie pod godziną. Można ją nacisnąć, aby zmienić lub usunąć reakcję. Emotki mają 16 punktów. Pastylka jest elementem obok dymka we wspólnym kontenerze, więc również jej dolna połowa pozostaje dotykalna na Androidzie. Jedna reakcja na wiadomość.
- Autor widzi reakcję przy własnej wiadomości. Nie może reagować na własne wiadomości. Rozmiar miejsca na reakcję jest stały, więc jej zmiana nie przesuwa rozmowy ani nie zawija potwierdzenia odczytu.
- Zapis jest potwierdzony dopiero po odpowiedzi bazy. Ponowienie po utraconej odpowiedzi ustawia wybraną wartość idempotentnie. Błąd udostępnia ponowienie w oknie wyboru, zachowując wiadomości.
- Realtime unieważnia skrzynki obu uczestników; działa też dotychczasowe odświeżanie w tle co 20 sekund. Odświeżane są reakcje wszystkich załadowanych stron historii, w porcjach do 100 identyfikatorów. Spóźnione odczyty sprzed zapisu nie nadpisują nowego wyboru.
- Reakcja nie tworzy wiadomości, powiadomienia push ani zdarzenia w dzwonku; nie zmienia liczby nieprzeczytanych i kolejności rozmów.

## Dane i dostęp

`messaging_private.message_reactions` jest prywatną tabelą z RLS i bez bezpośrednich uprawnień klienta. `get_message_reactions(conversation_id, message_ids)` sprawdza uczestnictwo i przynależność każdego identyfikatora do rozmowy. `set_message_reaction(target_message_id, reaction_kind)` wyznacza konto z sesji, dopuszcza wyłącznie wiadomość rozmówcy i sprawdza obustronne blokady oraz zawieszenie konta. Usunięcie wiadomości lub konta usuwa powiązane reakcje.

Monitoring otrzymuje wyłącznie nazwy operacji `messages.reactions.load` i `messages.reactions.save`, bez treści wiadomości i danych konta.

## Weryfikacja

Testy kodu i SQL obejmują wybór, zmianę, usuwanie, ponowienia, uprawnienia, obce rozmowy, anonimowy dostęp, blokady, zawieszenia i kaskadę usunięcia. Kontroler przewijania ma testy odświeżania, czytania historii i zmian wysokości klawiatury.

Przeszły lint, TypeScript, **400 testów Node** oraz **15 scenariuszy przeglądarkowych** dotyczących czatu, reakcji, powiadomień i osi czasu. Po końcowych poprawkach dostępności ponowiono cztery scenariusze nowych kontrolek. Eksport Androida przeszedł ponownie; bundle zawiera nowe API i adres Supabase Dev, bez adresu Preview. `check:dev` potwierdził odrębną konfigurację aplikacji, Firebase i callbacku.

Scenariusze przeglądarkowe sprawdzają długą rozmowę, odświeżenie w tle, nową wiadomość podczas czytania starszych, zmianę wysokości ekranu, stałą pozycję pola tekstowego, oba konta, ponowne logowanie, reakcję na starej stronie i błędy sieci. Eksport Androida zawiera nowe RPC i konfigurację Dev.

Rzeczywisty test API Dev na dwóch tymczasowych kontach potwierdził sześć reakcji, ponowienia, usuwanie, odczyt przez rozmówcę, brak zmian liczników i ograniczenia dostępu. Konta usunięto; nie rejestrowano urządzeń push. Klawiatura i płynność na fizycznym Androidzie wymagają osobnego sprawdzenia na urządzeniu.
