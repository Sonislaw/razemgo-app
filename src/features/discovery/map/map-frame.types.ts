import type { MapBounds, MapCamera, MapMessage, MapPoint } from './map-data';
export interface MapFit {
  id: number;
  bounds: MapBounds;
}
export interface MapFrameProps {
  camera: MapCamera;
  points: MapPoint[];
  fit: MapFit | null;
  onMessage: (message: MapMessage) => void;
  onError: () => void;
}
