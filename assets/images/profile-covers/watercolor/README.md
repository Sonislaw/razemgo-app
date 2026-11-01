# Akwarelowe tła ekip

Aktualny zestaw używany na kartach Odkrywaj → Ekipy oraz w szczegółach
własnego i cudzego profilu. Dziesięć ilustracji powstało przez zmianę stylu
dotychczasowych fotografii narzędziem **built-in image_gen**, 1.11.2026.
Każda ma osobne wywołanie. Oryginalne fotografie zachowano poziom wyżej.

Referencją stylu są istniejące grafiki wyjazdów w
[`../../landscapes/watercolor/`](../../landscapes/watercolor/): papierowa faktura,
półprzezroczyste warstwy akwareli, miękkie kształty, przygaszone zielenie,
błękitne odległe plany i kremowe światło. Zachowano krajobraz i kompozycję
związaną z avatarem, w tym noc dla sowy i chłodny świt dla wilka.
Tła nie zawierają ludzi, zwierząt, pojazdów, namiotów ani wyposażenia kempingowego.

| Plik | Avatar |
| --- | --- |
| [trail-fox.webp](trail-fox.webp) | Lis odkrywca |
| [camp-bear.webp](camp-bear.webp) | Miś na biwaku |
| [star-owl.webp](star-owl.webp) | Sowa pod gwiazdami |
| [paddle-beaver.webp](paddle-beaver.webp) | Bóbr kajakarz |
| [summit-chamois.webp](summit-chamois.webp) | Kozica na szlaku |
| [meadow-hedgehog.webp](meadow-hedgehog.webp) | Jeż małych wypraw |
| [road-wolf.webp](road-wolf.webp) | Wilk w drodze |
| [cycling-hare.webp](cycling-hare.webp) | Zając na rowerze |
| [campfire-squirrel.webp](campfire-squirrel.webp) | Wiewiórka przy ognisku |
| [happy-dog.webp](happy-dog.webp) | Pies kompan |

Pełny zestaw promptów, cel edycji oraz referencja dla każdego pliku:
[prompts.json](prompts.json). Grafiki zapisano jako WebP 1280 × 720 px,
jakość 82, łącznie około 2,5 MB; konwersja przez Sharp nie zmieniała kompozycji.
Oryginały wygenerowanych PNG pozostają w katalogu `generated_images` Codex.
Nie dodano zależności aplikacji.

Wszystkie widoki korzystają ze wspólnego mapowania
[`profile-cover-data.ts`](../../../../src/features/profile/profile-cover-data.ts).
Identyfikatory avatarów, kadrowanie i rozmiary komponentów pozostają takie same.
