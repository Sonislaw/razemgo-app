# Lokalne dane miejscowości

Źródło: [jjbartek/polskie-miejscowosci](https://github.com/jjbartek/polskie-miejscowosci), autor: **jjbartek**. Repozytorium opisuje dane PRNG obejmujące 43 989 miast i wsi, ze stanem na **11.05.2021**. Datę i pochodzenie migawki zapisano w metadanych zbioru.

Użyty commit: `f10df1ef9c5d6602787fdf9f409771859463cad5`. Metadane i SHA-256 oryginalnego pliku znajdują się w `polish-localities-source.json`. Oryginalny plik `LICENSE` (CC0 1.0) zachowano jako `polish-localities-license.txt`; źródłowy `package.json` deklaruje `CC-BY-1.0` ([tekst licencji](https://creativecommons.org/licenses/by/1.0/)). Zachowujemy autora, link, pochodzenie oraz opis zmian.

Zmiany formatu: województwa, powiaty i gminy zapisano jako słowniki, a rekordy jako tablice: identyfikator, nazwa, znacznik miasta (1/0), indeks województwa, indeks powiatu, indeks gminy, szerokość i długość geograficzna, nazwa do wyszukiwania bez polskich znaków. Nie aktualizowano nazw ani granic administracyjnych.

`npm run locations:import` ponownie pobiera dane i licencję z powyższego, ustalonego commitu oraz odtwarza pliki. Jest to osobna operacja deweloperska; aplikacja nie odpytuje GitHuba ani usług geokodowania. Nie dodano zależności natywnych ani backendu.

Podpowiedzi zawierają maksymalnie 10 pozycji. Identyczne nazwy rozróżnia gmina, powiat i województwo. Wybrane miejsce zapisuje stabilny identyfikator `pl-locality:<Id>`. Województwa wyprowadzono z listy w źródle; Polska jest osobną pozycją kraju. Kaszuby i Słowenia pozostają jawnymi dodatkami demonstracyjnymi. Dawne identyfikatory demonstracyjne Chłapowa i Gdańska wskazują właściwe rekordy źródłowe.
