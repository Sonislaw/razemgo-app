# Mapa wyjazdu

`TripMapCard` jest używana w szczegółach ogłoszenia (`/trip/[id]`)
i własnego planu (`/trips/[id]`).
Sekcja znajduje się bezpośrednio pod terminem. Sama mapa sięga obu krawędzi
ekranu; opis i przycisk pozostają wyrównane do pozostałej treści.

- Google Maps wyszukuje nazwę kempingu i opcjonalny adres wraz z kontekstem
  wybranej miejscowości. Wynik zależy od danych Google; wpisana nazwa nie jest
  zweryfikowanym identyfikatorem miejsca. Fikcyjne nazwy mogą dawać wiele wyników.
- Bez kempingu i adresu pokazujemy podgląd okolicy ze współrzędnych lokalnego
  słownika. Nie oznaczamy środka miejscowości pinezką kempingu.
- Krąg dla miejscowości ma orientacyjny promień 3 km. Dla województw i Polski
  jest wyznaczany z zasięgu miejscowości w słowniku. Kaszuby, Sudety i Bory
  Tucholskie korzystają z przybliżonych okolic wskazanych miejscowości, Słowenia
  z szerokiego podglądu kraju. To podgląd orientacyjny, nie oficjalne granice.
- Podgląd z kręgiem ma stałe położenie i skalę, aby oznaczenie nie rozjeżdżało
  się z mapą. Przycisk „Otwórz w Google Maps” otwiera pełną mapę okolicy;
  dla konkretnego kempingu otwiera wyszukiwanie miejsca.
- Podgląd korzysta z publicznej mapy osadzanej Google (`output=embed`), bez
  własnego klucza API i bez wywoływania Geocoding/Places API. Ten format nie jest
  wersjonowanym Maps Embed API v1; zmiana osadzania po stronie Google może
  wymagać aktualizacji. Link do pełnej mapy używa udokumentowanego Maps URLs API.
- Na Androidzie/iOS iframe jest wewnątrz `react-native-webview` 14.0.1
  (moduł dostępny w Expo Go dla SDK 58). Google odrzuca osadzenie bez iframe.
  W przeglądarce używana jest osobna implementacja `.web.tsx`.
- Mapa wymaga internetu. Są stany wczytywania, błędu, ponowienie oraz niezależny
  przycisk otwarcia pełnej mapy. Nie pobieramy lokalizacji urządzenia.

Adres w formularzu jest opcjonalny i dostępny tylko dla „Mam plan”, po wyborze
miasta/wsi. Zachowuje się przy zapisie, edycji i duplikowaniu. Zmiana miejscowości
albo przejście do „Szukam pomysłu” usuwa poprzedni adres i nazwę kempingu.

Sprawdzenie logiki: `npm run test:trip-maps`.

Dokumentacja:
- https://docs.expo.dev/versions/v58.0.0/sdk/webview/
- https://developers.google.com/maps/documentation/urls/get-started
- https://developers.google.com/maps/documentation/embed/embedding-map
