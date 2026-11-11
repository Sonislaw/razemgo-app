import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { AppText, Button, Chip, FieldLabel } from '@/components/ui/primitives';
import { ChipRow } from '@/components/ui/chip-row';
import { ProfileTextField } from '@/features/profile/profile-form-fields';
import { createRequestKey } from '@/lib/request-key';
import type { SelectedPlace, PlaceKind } from '@/types/place';
import { MapFrame } from '@/features/discovery/map/map-frame';
import { DEFAULT_MAP_CAMERA } from '@/features/discovery/map/map-data';
import { googleMapAvailable } from '@/lib/google-map-availability';
import { PLACE_KIND_LABELS, manualPlaceError } from './place-data';
import { resolveManualPlaceAddress, resolvePlaceGeometry } from './places-repository';
import { sameManualAddress } from './place-query-cache';

export function ManualPlaceFields({ query, flexible, onSave, onBack, initial, searchArea, preciseOnly=false, resolveAddress=resolveManualPlaceAddress }: {
  query:string; flexible:boolean; onSave:(place:SelectedPlace)=>void; onBack:()=>void; initial?:SelectedPlace;
  searchArea?:SelectedPlace; preciseOnly?:boolean;
  resolveAddress?:(place:SelectedPlace,signal?:AbortSignal)=>Promise<SelectedPlace>;
}) {
  const [id] = useState(() => initial?.id ?? 'manual:'+createRequestKey());
  const [name,setName] = useState(initial?.name??query), [address,setAddress] = useState(initial?.address??''), [region,setRegion] = useState(initial?.region??searchArea?.region??''), [country,setCountry] = useState(initial?.country??searchArea?.country??'Polska');
  const [kind,setKind] = useState<PlaceKind>(initial?.kind??(preciseOnly?'place':'locality'));
  // Google coordinates stay in its expiring cache. Geoapify address points and
  // user pins are restored from the trip snapshot, with their origin retained.
  const [point,setPoint] = useState<{latitude:number;longitude:number}|null>(()=>!initial?.googlePlaceId&&initial?.latitude!=null&&initial.longitude!=null?{latitude:initial.latitude,longitude:initial.longitude}:null);
  const [coordinateSource,setCoordinateSource]=useState<'address'|'pin'>(initial?.coordinateSource??'pin');
  const [map,setMap] = useState(false), [mapFailed,setMapFailed] = useState(false), [error,setError] = useState(''), [saving,setSaving] = useState(false);
  const request=useRef<AbortController|null>(null);
  useEffect(()=>()=>request.current?.abort(),[]);
  const change=<T,>(update:(value:T)=>void)=>(value:T)=>{
    request.current?.abort();request.current=null;setSaving(false);setError('');update(value);
  };
  const changeAddress=(update:(value:string)=>void)=>(value:string)=>{
    if(coordinateSource==='address')setPoint(null);
    change(update)(value);
  };
  const save=async()=>{
    if(request.current)return;
    const place:SelectedPlace={id,source:'manual',kind,name:name.trim(),address:address.trim(),region:region.trim(),country:country.trim(),...(point?{...point,coordinateSource}:{})};
    const issue=manualPlaceError(place);
    if(issue){setError(issue);return;}
    if(point){onSave(place);return;}
    const controller=new AbortController();request.current=controller;setSaving(true);setError('');
    try {
      const located = resolveAddress===resolveManualPlaceAddress && sameManualAddress(initial, place)
        ? {...place, googlePlaceId: initial!.googlePlaceId, ...await resolvePlaceGeometry(initial!.googlePlaceId!, controller.signal)}
        : await resolveAddress(place,controller.signal);
      if(!controller.signal.aborted)onSave(located);
    } catch {
      if(!controller.signal.aborted)setError('Nie udało się ustalić położenia adresu. Sprawdź adres, region i kraj, spróbuj ponownie lub wskaż punkt na mapie.');
    } finally {
      if(request.current===controller){request.current=null;setSaving(false);}
    }
  };
  return <View style={{gap:16}} testID="manual-place-form">
    <AppText variant="heading">Dodaj miejsce ręcznie</AppText>
    <AppText variant="caption" color="textSecondary">Podaj adres miejsca, region i kraj lub wskaż punkt na mapie. Dzięki temu wyjazd będzie widoczny również na mapie.</AppText>
    <ProfileTextField label="Nazwa miejsca" required value={name} onChangeText={change(setName)} maxLength={160}/>
    <View style={{gap:8}}><FieldLabel>Rodzaj miejsca</FieldLabel><ChipRow horizontal label="Rodzaj miejsca">
      {([...(preciseOnly?[]:['locality']),'campground','place',...(flexible ? ['region','country'] : [])] as PlaceKind[]).map(value =>
        <Chip key={value} label={PLACE_KIND_LABELS[value]} selected={value===kind} onPress={()=>change(setKind)(value)}/>)}
    </ChipRow></View>
    <ProfileTextField label="Adres miejsca" required={!point} value={address} onChangeText={changeAddress(setAddress)} maxLength={200} hint="Ulica, numer i miejscowość. Niewymagane, jeśli wskażesz punkt na mapie."/>
    <ProfileTextField label="Region" required={!point} value={region} onChangeText={changeAddress(setRegion)} maxLength={100}/>
    <ProfileTextField label="Kraj" required={!point} value={country} onChangeText={changeAddress(setCountry)} maxLength={100}/>
    {googleMapAvailable ? <Button label={map ? 'Schowaj mapę' : 'Wskaż punkt na mapie'} variant="secondary" onPress={() => setMap(value=>!value)}/> : null}
    {map ? <View style={{height:260,borderRadius:16,overflow:'hidden'}} testID="manual-place-map">
      <MapFrame camera={point?{...point,zoom:13}:searchArea?.latitude!=null&&searchArea.longitude!=null?{latitude:searchArea.latitude,longitude:searchArea.longitude,zoom:10}:DEFAULT_MAP_CAMERA} points={[]} fit={null} picker selectedPoint={point}
        onError={()=>setMapFailed(true)} onMessage={message=>{if(message.type==='pin'){setCoordinateSource('pin');change(setPoint)({latitude:message.latitude,longitude:message.longitude});setMapFailed(false);}}}/>
    </View> : null}
    <AppText variant="caption" color="textSecondary">{mapFailed ? 'Mapa jest niedostępna. Uzupełnij adres miejsca, region i kraj, aby ustalić położenie.' :
      point ? coordinateSource==='address'?'Położenie ustalone z adresu. Zmiana adresu ponownie ustali punkt. Możesz też wskazać go na mapie.':'Punkt wybrany. Adres, region i kraj są teraz opcjonalne. Możesz przesunąć znacznik, aby poprawić położenie.' : 'Nie wybierasz punktu? Po kliknięciu „Użyj tego miejsca” ustalimy położenie z pełnego adresu.'}</AppText>
    {point ? <Button label="Usuń wybrany punkt" variant="secondary" onPress={()=>change(setPoint)(null)}/> : null}
    {error ? <AppText accessibilityRole="alert">{error}</AppText> : null}
    <Button label={saving?'Ustalanie położenia…':'Użyj tego miejsca'} disabled={saving} onPress={()=>void save()}/>
    <Button label="Wróć do podpowiedzi" variant="secondary" onPress={onBack}/>
  </View>;
}
