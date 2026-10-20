import { LandscapePhoto } from '@/components/trips/landscape-photo';
import type { LandscapeKind } from '@/types/travel';

export function TripThumbnail({
  kind,
  size = 52,
  height = 60,
}: {
  kind: LandscapeKind;
  size?: number;
  height?: number;
}) {
  return (
    <LandscapePhoto
      kind={kind}
      style={{ width: size, height, borderRadius: 16 }}
    />
  );
}
