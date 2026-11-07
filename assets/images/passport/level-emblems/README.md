# Odznaki poziomu ekipy

Osiem samodzielnych, wektorowych SVG na wzór grafiki przesłanej przez użytkownika:
złota sześciokątna ramka, zielone góry i świerki, liście oraz jasna cyfra.
Poza odznaką tło jest przezroczyste. Pliki nie zawierają bitmap ani osadzonych
fontów; cyfry są zapisane jako krzywe.

- [Poziom 1 — Początek drogi](level-1.svg)
- [Poziom 2 — W drodze](level-2.svg)
- [Poziom 3 — Odkrywcy](level-3.svg)
- [Poziom 4 — Podróżnicy](level-4.svg)
- [Poziom 5 — Doświadczona ekipa](level-5.svg)
- [Poziom 6 — Przewodnicy](level-6.svg)
- [Poziom 7 — Legenda szlaku](level-7.svg)
- [Poziom 8 — Dookoła świata](level-8.svg)

Wszystkie warianty mają ten sam wzór i obszar roboczy 512 × 600. Różni je cyfra.
`number-paths.json` przechowuje gotowe krzywe cyfr, a polecenie
`node scripts/generate-passport-level-emblems.mjs` odtwarza komplet plików
bez dodatkowych pakietów.

`PassportLevelEmblem` wybiera odznakę według bieżącego poziomu ekipy.
Na własnym profilu i profilach innych ekip odznaka jest wyśrodkowana nad górnym
zdjęciem karty „Paszport podróżnika” i lekko wystaje ponad jej krawędź. Czytnik ekranu odczytuje
numer i nazwę poziomu. Kliknięcie odznaki otwiera ten sam paszport, co przycisk
„Zobacz odznaki ekipy”; na własnym profilu otwiera paszport konta. Sama prezentacja
poziomu nie wykonuje dodatkowych zapytań o paszport.
