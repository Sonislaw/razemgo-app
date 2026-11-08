export type PlaceKind = 'locality' | 'campground' | 'place' | 'region' | 'country';
export interface SelectedPlace {
  bounds?: {south:number;north:number;west:number;east:number};
  id: string;
  source: 'google' | 'manual' | 'legacy';
  kind: PlaceKind;
  name: string;
  address: string;
  region: string;
  country: string;
  latitude?: number;
  longitude?: number;
  googlePlaceId?: string;
  userLabel?: string;
  resolvedAt?: string;
}
export interface PlacePrediction {
  id: string;
  name: string;
  context: string;
  kind: PlaceKind;
}
