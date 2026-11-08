# Mapa wyjazdu
TripMapCard w szczegółach publicznego i własnego wyjazdu używa wspólnego MapFrame.

Android renderuje natywną mapę Google. Konkretny kemping lub punkt ma znacznik,
miejscowość lub obszar — orientacyjny krąg dopasowany do szerokości podglądu.
Identyfikator Google jest rozwiązywany przez serwerową funkcję places. Zapis
ręczny korzysta z punktu wskazanego przez użytkownika lub z położenia pełnego
adresu rozpoznanego przez Places Text Search. Taki adres zachowuje własną nazwę
i dane użytkownika; położenie Google jest odświeżane we wspólnej pamięci geometrii.
Nie przypisujemy przypadkowych współrzędnych do adresu bez dopasowania.

Starsze lokalizacje zachowują przybliżenia miejscowości ze słownika. Nowe miejsca
nie korzystają z lokalnego katalogu kempingów. W przypadku Google odnośnik
zawiera query_place_id, a ręczny punkt otwiera wskazane współrzędne.

Mapa ma stan wczytywania, ponowienie błędu i niezależny odnośnik do Google Maps.
Nie pobiera lokalizacji telefonu. Opcjonalna mapa web wymaga osobnego klucza
Maps JavaScript API; Android używa wyłącznie Maps SDK for Android.

Sprawdzenie: npm run test:trip-maps i npm run test:places.
Konfiguracja: [google-maps-dev.md](../../../docs/google-maps-dev.md).
