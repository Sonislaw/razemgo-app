import { useEffect, useState } from 'react';
import type { SelectedPlace } from '@/types/place';
import { observePlaceDetails } from './places-repository';
import { useAuth } from '@/features/auth/auth-context';

export function useLivePlace(place?:SelectedPlace) {
  const [current,setCurrent]=useState<SelectedPlace>();
  const {session} = useAuth();
  const userId = session?.user.id;
  const id=place?.googlePlaceId, source=place?.source, label=place?.userLabel, resolved=place?.resolvedAt;
  useEffect(() => {
    if(source!=='google'||!id||!label||resolved)return;
    return observePlaceDetails({id: 'google:' + id, googlePlaceId: id, source: 'google', kind: 'place', name: label, userLabel: label,
      address: '', region: '', country: ''}, setCurrent);
  },[id,source,label,resolved,userId]);
  return !resolved&&current?.id===place?.id&&current?.userLabel===label ? current : place;
}
