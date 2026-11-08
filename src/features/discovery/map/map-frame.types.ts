import type { MapBounds, MapCamera, MapMessage, MapPoint } from './map-data';
export interface MapFit {
  id: number;
  bounds: MapBounds;
}
export interface MapFrameProps {
  area?: {latitude:number;longitude:number;radiusMeters:number};
  picker?: boolean;
  selectedPoint?: { latitude: number; longitude: number } | null;
  camera: MapCamera;
  points: MapPoint[];
  fit: MapFit | null;
  onMessage: (message: MapMessage) => void;
  onError: () => void;
}
