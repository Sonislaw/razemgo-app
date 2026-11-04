# Pełne tła przycisków powitalnych

Ilustracje przygotowane wbudowanym `image_gen` (umiejętność `imagegen`).
Pierwotne przezroczyste ilustracje służyły jako odniesienia postaci i motywów;
`assets/images/home/scenic/plan-trip.webp` określało styl pełnego krajobrazu.

- [join-the-crew.webp](join-the-crew.webp): „Nowe konto” — para podróżników witająca się przy przyczepie, 1024 × 768 px.
- [back-to-camp.webp](back-to-camp.webp): „Zaloguj się” — kampervan z otwartymi drzwiami na polanie, 1024 × 768 px.
- [prompts.json](prompts.json): pełne finalne prompty oraz role referencji.

Pierwotnie PNG zakodowano do WebP z jakością 88. Wersje aplikacji zoptymalizowano
4.11.2026 do 1024 × 768 px i jakości 86, bez zmiany kadru.
Tła są nieprzezroczyste i wypełniają całe kafle; główne motywy zajmują górną i środkową część.
`HomeScenicAction` nadaje kaflom ten sam cień, ramkę, typografię i wewnętrzne przyciski co na Starcie.
`register-wash.svg` i `login-wash.svg` przenoszą odpowiadające mu gradienty pod dolną część tekstową.
Napisy i strzałki są elementami interfejsu, a kafle nadal stoją obok siebie.
