import { useState } from 'react';
import { View } from 'react-native';
import { AppText, Button, Chip, FieldLabel } from '@/components/ui/primitives';
import { ChipRow } from '@/components/ui/chip-row';
import { ProfileTextField } from '@/features/profile/profile-form-fields';
import { createRequestKey } from '@/lib/request-key';
import type { SelectedPlace, PlaceKind } from '@/types/place';
import { isAreaPlaceKind, manualAreaError, PLACE_KIND_LABELS } from './place-data';

export function ManualAreaFields({query,initial,onSave,onBack}:{
  query:string;initial?:SelectedPlace;onSave:(place:SelectedPlace)=>void;onBack:()=>void;
}) {
  const [id]=useState(()=>initial?.id??'manual:'+createRequestKey());
  const [name,setName]=useState(initial?.name??query),[region,setRegion]=useState(initial?.region??''),[country,setCountry]=useState(initial?.country??'Polska');
  const [kind,setKind]=useState<PlaceKind>(initial&&isAreaPlaceKind(initial.kind)?initial.kind:'locality'),[error,setError]=useState('');
  return <View style={{gap:16}} testID="manual-area-form">
    <AppText variant="heading">Dodaj obszar ręcznie</AppText>
    <AppText variant="caption" color="textSecondary">Wskaż miejscowość, wieś, region lub kraj. Kemping i dokładne miejsce wybierzecie wspólnie z ekipą.</AppText>
    <ProfileTextField label="Nazwa obszaru" required value={name} onChangeText={value=>{setError('');setName(value);}} maxLength={kind==='locality'?160:100}/>
    <View style={{gap:8}}><FieldLabel>Rodzaj obszaru</FieldLabel><ChipRow horizontal label="Rodzaj obszaru">
      {(['locality','region','country'] as const).map(value=><Chip key={value} label={value==='locality'?'Miejscowość lub wieś':PLACE_KIND_LABELS[value]}
        selected={value===kind} onPress={()=>{setError('');setKind(value);}}/>)}
    </ChipRow></View>
    {kind==='locality'?<ProfileTextField label="Region" required value={region} onChangeText={value=>{setError('');setRegion(value);}} maxLength={100} hint="Pozwala odróżnić miejscowości o tej samej nazwie."/>:null}
    {kind!=='country'?<ProfileTextField label="Kraj" required value={country} onChangeText={value=>{setError('');setCountry(value);}} maxLength={100}/>:null}
    {error?<AppText accessibilityRole="alert">{error}</AppText>:null}
    <Button label="Użyj tego obszaru" onPress={()=>{
      const place:SelectedPlace={id,source:'manual',scope:'area',kind,name:name.trim(),address:'',region:kind==='region'?name.trim():kind==='locality'?region.trim():'',country:kind==='country'?name.trim():country.trim()};
      const issue=manualAreaError(place);if(issue){setError(issue);return;}onSave(place);
    }}/>
    <Button label="Wróć do podpowiedzi" variant="secondary" onPress={onBack}/>
  </View>;
}
