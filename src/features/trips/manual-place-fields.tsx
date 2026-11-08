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
import { resolveManualPlaceAddress } from './places-repository';

export function ManualPlaceFields({ query, flexible, onSave, onBack, initial }: {
  query:string; flexible:boolean; onSave:(place:SelectedPlace)=>void; onBack:()=>void; initial?:SelectedPlace;
}) {
  const [id] = useState(() => initial?.id ?? 'manual:'+createRequestKey());
  const [name,setName] = useState(initial?.name??query), [address,setAddress] = useState(initial?.address??''), [region,setRegion] = useState(initial?.region??''), [country,setCountry] = useState(initial?.country??'Polska');
  const [kind,setKind] = useState<PlaceKind>(initial?.kind??'locality');
  // Google-derived coordinates stay in the expiring geometry cache; only pins
  // chosen by the user are persisted directly with the manual place.
  const [point,setPoint] = useState<{latitude:number;longitude:number}|null>(()=>!initial?.googlePlaceId&&initial?.latitude!=null&&initial.longitude!=null?{latitude:initial.latitude,longitude:initial.longitude}:null);
  const [map,setMap] = useState(false), [mapFailed,setMapFailed] = useState(false), [error,setError] = useState(''), [saving,setSaving] = useState(false);
  const request=useRef<AbortController|null>(null);
  useEffect(()=>()=>request.current?.abort(),[]);
  const change=<T,>(update:(value:T)=>void)=>(value:T)=>{
    request.current?.abort();request.current=null;setSaving(false);setError('');update(value);
  };
  const save=async()=>{
    if(request.current)return;
    const place:SelectedPlace={id,source:'manual',kind,name:name.trim(),address:address.trim(),region:region.trim(),country:country.trim(),...(point??{})};
    const issue=manualPlaceError(place);
    if(issue){setError(issue);return;}
    if(point){onSave(place);return;}
    const controller=new AbortController();request.current=controller;setSaving(true);setError('');
    try {
      const located=await resolveManualPlaceAddress(place,controller.signal);
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
      {(['locality','campground','place',...(flexible ? ['region','country'] : [])] as PlaceKind[]).map(value =>
        <Chip key={value} label={PLACE_KIND_LABELS[value]} selected={value===kind} onPress={()=>change(setKind)(value)}/>)}
    </ChipRow></View>
    <ProfileTextField label="Adres miejsca" required={!point} value={address} onChangeText={change(setAddress)} maxLength={200} hint="Ulica, numer i miejscowość. Niewymagane, jeśli wskażesz punkt na mapie."/>
    <ProfileTextField label="Region" required={!point} value={region} onChangeText={change(setRegion)} maxLength={100}/>
    <ProfileTextField label="Kraj" required={!point} value={country} onChangeText={change(setCountry)} maxLength={100}/>
    {googleMapAvailable ? <Button label={map ? 'Schowaj mapę' : 'Wskaż punkt na mapie'} variant="secondary" onPress={() => setMap(value=>!value)}/> : null}
    {map ? <View style={{height:260,borderRadius:16,overflow:'hidden'}} testID="manual-place-map">
      <MapFrame camera={point?{...point,zoom:13}:DEFAULT_MAP_CAMERA} points={[]} fit={null} picker selectedPoint={point}
        onError={()=>setMapFailed(true)} onMessage={message=>{if(message.type==='pin'){change(setPoint)({latitude:message.latitude,longitude:message.longitude});setMapFailed(false);}}}/>
    </View> : null}
    <AppText variant="caption" color="textSecondary">{mapFailed ? 'Mapa jest niedostępna. Uzupełnij adres miejsca, region i kraj, aby ustalić położenie.' :
      point ? 'Punkt wybrany. Adres, region i kraj są teraz opcjonalne. Możesz przesunąć znacznik, aby poprawić położenie.' : 'Nie wybierasz punktu? Po kliknięciu „Użyj tego miejsca” ustalimy położenie z pełnego adresu.'}</AppText>
    {point ? <Button label="Usuń wybrany punkt" variant="secondary" onPress={()=>change(setPoint)(null)}/> : null}
    {error ? <AppText accessibilityRole="alert">{error}</AppText> : null}
    <Button label={saving?'Ustalanie położenia…':'Użyj tego miejsca'} disabled={saving} onPress={()=>void save()}/>
    <Button label="Wróć do podpowiedzi" variant="secondary" onPress={onBack}/>
  </View>;
}
