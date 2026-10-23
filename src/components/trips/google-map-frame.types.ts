export interface GoogleMapFrameProps {
  uri: string;
  title: string;
  previewOnly: boolean;
  onLoad: () => void;
  onError: () => void;
}
