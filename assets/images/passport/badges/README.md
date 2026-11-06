# Tła kolekcji odznak

Każda z 14 kategorii paszportu ma osobną ilustrację akwarelową dobraną do tematu.
Napisy, stopień, pieczątka i pasek postępu są natywnymi elementami interfejsu.
`text-shade.svg` nakłada ciemnozielony gradient pod jasnym tekstem; nie zmienia
grafiki źródłowej. Ozdobne tła są pomijane przez czytniki ekranu.

Sześć nowych ilustracji wygenerowano wbudowanym narzędziem `image_gen`
(umiejętność `imagegen`). Pełny zestaw promptów znajduje się w `prompts.json`.
Oryginały zmniejszono do 480 × 480 px i zapisano jako JPEG z jakością 84.
Każda ilustracja jest lokalnym zasobem aplikacji i korzysta z pamięci podręcznej
`expo-image`.

| Kategoria | Ilustracja |
| --- | --- |
| Poznajcie nas | Rodzina przy przyczepie — istniejące `home/scenic/find-crew-family.webp` |
| Organizator | Kampervan na polanie — istniejące `home/scenic/plan-trip.webp` |
| Łowca pomysłów | Otwarte wybrzeże — istniejące `landscapes/watercolor/coast.jpg` |
| Rozmówca | Rozmowa przy kempingowym stole — nowe `messages.jpg` |
| Dobry kompan | Czworo znajomych przy ognisku — istniejące `home/scenic/find-crew-campfire-caravan.webp` |
| Planer przygód | Dziennik, mapa i zakładki — nowe `trip_favorites.jpg` |
| Bliska ekipa | Podróżnicy witający się przy przyczepie — istniejące `welcome/scenic/join-the-crew.webp` |
| Dobra energia | Słoneczna łąka — istniejące `profile-covers/watercolor/meadow-hedgehog.webp` |
| Małe gesty | Podanie ciepłego kubka — nowe `message_reactions.jpg` |
| Własny kompas | Kompas na mapie — nowe `saved_filters.jpg` |
| Stały bywalec | Poranna kawa przy przyczepie — nowe `active_days.jpg` |
| Nowe horyzonty | Droga wśród wzgórz — istniejące `profile-covers/watercolor/road-wolf.webp` |
| Pod gwiazdami | Rozświetlony namiot nad jeziorem — nowe `campgrounds.jpg` |
| Cztery krajobrazy | Góry, jezioro i las — istniejące `landscapes/watercolor/mountain.jpg` |

Powiązania zasobów i kadry utrzymuje `src/features/passport/passport-badge-artwork.tsx`.
