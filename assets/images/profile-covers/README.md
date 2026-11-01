# Fotograficzne tła profilu ekipy

Dziesięć krajobrazów wygenerowanych narzędziem **built-in image_gen** 1.11.2026.
Fotograficzna stylistyka, bez pojazdów, namiotów, wyposażenia kempingowego,
ludzi, zwierząt, napisów i znaków. Zwierzę pozostaje avatarem nakładanym
przez interfejs. Załączona przez użytkownika ilustracja była inspiracją
kompozycji profilu; nie jest wykorzystywana jako asset aplikacji.

| Plik | Avatar | Klimat |
| --- | --- | --- |
| [trail-fox.webp](trail-fox.webp) | Lis odkrywca | Leśna ścieżka, paprocie, jesienne światło |
| [camp-bear.webp](camp-bear.webp) | Miś na biwaku | Spokojna polana i wzgórza o wschodzie słońca |
| [star-owl.webp](star-owl.webp) | Sowa pod gwiazdami | Nocny las, jezioro i rozgwieżdżone niebo |
| [paddle-beaver.webp](paddle-beaver.webp) | Bóbr kajakarz | Spokojna woda, nadrzeczne drzewa i poranna mgła |
| [summit-chamois.webp](summit-chamois.webp) | Kozica na szlaku | Skalista grań i górska panorama |
| [meadow-hedgehog.webp](meadow-hedgehog.webp) | Jeż małych wypraw | Rosa i kwiaty na łące |
| [road-wolf.webp](road-wolf.webp) | Wilk w drodze | Rozległa dolina, świerki i chłodny świt |
| [cycling-hare.webp](cycling-hare.webp) | Zając na rowerze | Ścieżka przez zielone wzgórza |
| [campfire-squirrel.webp](campfire-squirrel.webp) | Wiewiórka przy ognisku | Ciepłe popołudnie w dębowym lesie |
| [happy-dog.webp](happy-dog.webp) | Pies kompan | Słoneczna ścieżka przez nadmorskie wydmy |

Pełny, dokładny zestaw promptów: [prompts.json](prompts.json).
Każdy plik powstał w osobnym wywołaniu image_gen. Oryginały PNG zachowano
w katalogu wygenerowanych obrazów Codex; do aplikacji skopiowano wersje WebP
1280 × 720 px, jakość 82, łącznie około 2,2 MB. Konwersja przez Sharp
nie zmieniała kompozycji. Nie dodano zależności aplikacji.

[header-shade.svg](header-shade.svg) to gradient z kodu nakładany na zdjęcie
dla czytelności białego tytułu. Nie jest częścią wygenerowanych fotografii.

Mapowanie w [profile-cover-data.ts](../../../src/features/profile/profile-cover-data.ts)
jest kompletne dla `ProfileAvatarId`. Starszy profil bez avatara korzysta
z tego samego domyślnego lisa co obrazek avatara. Motyw ustala zapisany avatar;
nie ma osobnego ustawienia ani zmiany schematu danych.

Weryfikacja: lint, TypeScript, kontrola granic źródeł oraz 6 scenariuszy
przeglądarkowych. Nowy scenariusz wczytuje wszystkie 10 zdjęć, zmienia avatar
przez edycję profilu, sprawdza trwałość po przeładowaniu, układ 320/390 px,
kontakt i brak zdjęcia na niedostępnym profilu. Pozostałe scenariusze obejmują
obecność online, dane profilu, zaproszenia i obsługę błędów. Nie testowano telefonu.
