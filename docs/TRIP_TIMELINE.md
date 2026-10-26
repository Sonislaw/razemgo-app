# Linia czasu wyjazdu — Dev

`TripTimeline` wyświetla pod datą dzisiejszy dzień, początek i koniec wyjazdu oraz licznik dni. Jest częścią `TripListingCard`, więc występuje w Odkrywaj, Moich wyjazdach, ogłoszeniach profilu ekipy, na Start, w przykładzie na stronie powitalnej i w podglądzie kreatora. Ten sam komponent jest w szczegółach własnego i cudzego wyjazdu oraz w kompaktowym odnośniku do planu w rozmowie.

## Daty i wygląd

- Nadchodzący wyjazd: „Za N dni” lub „Start jutro”; dzisiejszy dzień jest przed zielonym odcinkiem.
- Rozpoczęcie dziś: „Start dziś”, połączony znacznik dzisiejszego dnia i początku wyjazdu.
- Trwający wyjazd: dzisiejszy dzień wewnątrz odcinka, „Trwa · jeszcze N dni”.
- Data końca jest wyłączna, tak samo jak w pozostałej części aplikacji. Zakończony wyjazd ma szary odcinek i informację o czasie od zakończenia. Anulowanie lub ręczne zakończenie nie sugeruje nadchodzącego wyjazdu.
- Szkic bez pełnego, poprawnego zakresu dat nie pokazuje osi.
- Odległość do początku korzysta ze wspólnego rocznego odniesienia. Oś jest poglądowa: długość pobytu i odstępy znaczników mają minimalną szerokość, aby krótkie wyjazdy były czytelne. Dokładny czas wskazuje licznik dni i daty.
- Na wąskich ekranach lub przy dużej czcionce etykiety przechodzą do osobnej legendy. Czytnik ekranu otrzymuje pełne daty, dzisiejszy dzień i stan wyjazdu.

`getTripTimeline` liczy różnice dni kalendarzowych bez wpływu zmiany czasu letniego. Wspólny `useCurrentDate` używa lokalnej daty urządzenia; odświeża ją o północy i po wznowieniu aplikacji. Wszystkie karty współdzielą jeden zegar, zamiast uruchamiać osobne interwały.

## Weryfikacja

`scripts/trip-timeline.test.mjs` sprawdza przyszłe, trwające, zakończone i anulowane plany, niepełne daty, lata przestępne, zmianę czasu oraz przełom roku. `scripts/browser/trip-timeline.spec.mjs` sprawdza miejsca użycia, zmianę lokalnej daty, brak duplikatu znacznika „Dziś” i układ na szerokościach 320 i 390 px. Istniejące scenariusze obejmują doładowywanie list, powrót do przewinięcia, kreator, ulubione i rozmowy.

Zmiana nie wymaga migracji bazy ani nowego development buildu. Wystarczy odświeżenie RazemGo Dev. Nie opublikowano aktualizacji Preview. Wygląd na fizycznym telefonie pozostaje do sprawdzenia.
