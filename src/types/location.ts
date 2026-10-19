export interface LocationOption {
  id: string;
  name: string;
  region: string;
  country: string;
  kind: 'locality' | 'village' | 'city' | 'region' | 'country';
  county?: string;
  commune?: string;
  latitude?: number;
  longitude?: number;
  source?: 'polish-localities' | 'derived-region' | 'country' | 'demo';
  aliases?: readonly string[];
}
