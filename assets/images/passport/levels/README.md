# Ilustracje poziomów ekipy

Osiem autorskich akwarelowych scen wygenerowanych wbudowanym narzędziem
`image_gen` (umiejętność `imagegen`) dla sekcji „Paszport podróżnika” w profilu.
Pełne prompty zapisano w `prompts.json`.

| Poziom | Nazwa | Plik | Motyw |
| --- | --- | --- | --- |
| 1 | Początek drogi | `beginning.jpg` | Plecak i buty przy początku leśnego szlaku |
| 2 | W drodze | `on-the-road.jpg` | Kampervan na drodze przy jeziorze |
| 3 | Odkrywcy | `explorers.jpg` | Ukryty wodospad i leśna kładka |
| 4 | Podróżnicy | `travelers.jpg` | Przyczepa i kajaki nad górskim jeziorem |
| 5 | Doświadczona ekipa | `experienced-crew.jpg` | Czworo znajomych przy ognisku |
| 6 | Przewodnicy | `guides.jpg` | Wspólne wyznaczanie drogi na szlaku |
| 7 | Legenda szlaku | `trail-legend.jpg` | Kopczyk kamieni na grani o wschodzie słońca |
| 8 | Dookoła świata | `around-the-world.jpg` | Globus, dziennik i pamiątki nad morzem |

Grafiki zapisano jako lokalne JPEG 720 × 720 px z jakością 84; tekst ani elementy
interfejsu nie są częścią obrazów. `header-wash.svg` dodaje osobny jasny gradient
pod treścią, która zachodzi na dolną część ilustracji.

`src/features/passport/passport-level-artwork.tsx` wybiera grafikę według bieżącego
poziomu. Sekcja własnego profilu korzysta z aktualnego paszportu konta, a publiczny
profil z publicznego podsumowania ekipy. Odświeżenie poziomu zmienia obraz bez
dodatkowych zapytań. Tła są pomijane przez czytniki ekranu.
