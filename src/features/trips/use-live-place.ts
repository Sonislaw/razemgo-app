import { useEffect, useState } from 'react';
import type { SelectedPlace } from '@/types/place';
import { resolvePlace } from './places-repository';

export function useLivePlace(place?:SelectedPlace) {
  const [current,setCurrent]=useState<SelectedPlace>();
  const id=place?.googlePlaceId, source=place?.source, label=place?.userLabel, resolved=place?.resolvedAt;
  useEffect(() => {
    if(source!=='google'||!id||!label||resolved)return;
    const controller=new AbortController();
    void resolvePlace(id,label,undefined,controller.signal).then(value => {if(!controller.signal.aborted)setCurrent(value);}).catch(()=>undefined);
    return () => controller.abort();
  },[id,source,label,resolved]);
  return !resolved&&current?.id===place?.id&&current?.userLabel===label ? current : place;
}
