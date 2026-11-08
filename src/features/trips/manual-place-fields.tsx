import { useState } from 'react';
import { View } from 'react-native';
import { AppText, Button, Chip, FieldLabel } from '@/components/ui/primitives';
import { ChipRow } from '@/components/ui/chip-row';
import { ProfileTextField } from '@/features/profile/profile-form-fields';
import { createRequestKey } from '@/lib/request-key';
import type { SelectedPlace, PlaceKind } from '@/types/place';
import { MapFrame } from '@/features/discovery/map/map-frame';
import { DEFAULT_MAP_CAMERA } from '@/features/discovery/map/map-data';
import { googleMapAvailable } from '@/lib/google-map-availability';
import { PLACE_KIND_LABELS } from './place-data';

export function ManualPlaceFields({ query, flexible, onSave, onBack, initial }: {
  query:string; flexible:boolean; onSave:(place:SelectedPlace)=>void; onBack:()=>void; initial?:SelectedPlace;
}) {
  const [id] = useState(() => initial?.id ?? 'manual:'+createRequestKey());
  const [name,setName] = useState(initial?.name??query), [address,setAddress] = useState(initial?.address??''), [region,setRegion] = useState(initial?.region??''), [country,setCountry] = useState(initial?.country??'Polska');
  const [kind,setKind] = useState<PlaceKind>(initial?.kind??'locality');
  const [point,setPoint] = useState<{latitude:number;longitude:number}|null>(()=>initial?.latitude!=null&&initial.longitude!=null?{latitude:initial.latitude,longitude:initial.longitude}:null);
  const [map,setMap] = useState(false), [mapFailed,setMapFailed] = useState(false), [error,setError] = useState('');
  return <View style={{gap:16}} testID="manual-place-form">
    <AppText variant="heading">Dodaj miejsce ręcznie</AppText>
    <ProfileTextField label="Nazwa miejsca" required value={name} onChangeText={setName} maxLength={160}/>
    <View style={{gap:8}}><FieldLabel>Rodzaj miejsca</FieldLabel><ChipRow horizontal label="Rodzaj miejsca">
      {(['locality','campground','place',...(flexible ? ['region','country'] : [])] as PlaceKind[]).map(value =>
        <Chip key={value} label={PLACE_KIND_LABELS[value]} selected={value===kind} onPress={() => setKind(value)}/>)}
    </ChipRow></View>
    <ProfileTextField label="Adres miejsca" value={address} onChangeText={setAddress} maxLength={200} hint="Opcjonalnie: ulica, numer i miejscowość."/>
    <ProfileTextField label="Region" value={region} onChangeText={setRegion} maxLength={100}/>
    <ProfileTextField label="Kraj" value={country} onChangeText={setCountry} maxLength={100}/>
    {googleMapAvailable ? <Button label={map ? 'Schowaj mapę' : 'Wskaż punkt na mapie'} variant="secondary" onPress={() => setMap(value=>!value)}/> : null}
    {map ? <View style={{height:260,borderRadius:16,overflow:'hidden'}} testID="manual-place-map">
      <MapFrame camera={point?{...point,zoom:13}:DEFAULT_MAP_CAMERA} points={[]} fit={null} picker selectedPoint={point}
        onError={() => setMapFailed(true)} onMessage={message => { if(message.type==='pin') {setPoint({latitude:message.latitude,longitude:message.longitude});setMapFailed(false);} }}/>
    </View> : null}
    <AppText variant="caption" color="textSecondary">{mapFailed ? 'Mapa jest niedostępna. Możesz zapisać miejsce bez punktu.' :
      point ? 'Punkt wybrany. Możesz przesunąć znacznik, aby poprawić położenie.' : 'Punkt jest opcjonalny. Bez niego wyjazd będzie dostępny na liście, ale nie pojawi się na mapie.'}</AppText>
    {point ? <Button label="Usuń wybrany punkt" variant="secondary" onPress={() => setPoint(null)}/> : null}
    {error ? <AppText accessibilityRole="alert">{error}</AppText> : null}
    <Button label="Użyj tego miejsca" onPress={() => {
      if(!name.trim()) {setError('Podaj nazwę miejsca.');return;}
      onSave({id,source:'manual',kind,name:name.trim(),address:address.trim(),region:region.trim(),country:country.trim(),...(point??{})});
    }}/>
    <Button label="Wróć do podpowiedzi" variant="secondary" onPress={onBack}/>
  </View>;
}
