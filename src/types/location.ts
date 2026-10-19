export interface LocationOption {
  id: string;
  name: string;
  region: string;
  country: string;
  kind: 'locality' | 'region' | 'country';
  aliases?: readonly string[];
}
