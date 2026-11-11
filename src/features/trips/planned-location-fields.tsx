import {useRef,useState} from 'react';
import {View} from 'react-native';
import {AutocompleteField,type AutocompleteFieldHandle} from '@/components/ui/autocomplete-field';
import {AppText} from '@/components/ui/primitives';
import type {TripForm} from '@/types/owned-trip';
import type {SelectedPlace} from '@/types/place';
import {TripLocationField} from './trip-location-field';
import {TripEditorField,tripFieldErrorId,type TripEditorFields} from './trip-editor-field';
import {PlaceSuggestions} from './place-suggestions';
import {useLivePlace} from './use-live-place';

export function PlannedLocationFields({form,fields,onAreaChange,onPlaceChange,onClearPlace}: {
  form:TripForm;fields:TripEditorFields;onAreaChange:(place?:SelectedPlace)=>void;
  onPlaceChange:(place:SelectedPlace)=>void;onClearPlace:()=>void;
}) {
  const areaInput=useRef<AutocompleteFieldHandle>(null),placeInput=useRef<AutocompleteFieldHandle>(null);
  const [query,setQuery]=useState('');
  const selected=useLivePlace(form.place);
  const area=form.searchArea?.kind==='locality'?form.searchArea:undefined,display=selected?.name??query;
  return <>
    <TripEditorField name="searchArea" label="Miejscowość / wieś" fields={fields} focus={()=>areaInput.current?.focus()}>
      <TripLocationField mode="flexible" areasOnly localitiesOnly label="Miejscowość / wieś" value={area?.id??''} place={area} inputRef={areaInput}
        errorId={fields.errors.searchArea?tripFieldErrorId('searchArea'):undefined}
        hint="Wybierz miejscowość lub wieś. Poniżej wskażesz kemping lub inne konkretne miejsce."
        onChange={()=>{setQuery('');onAreaChange(undefined);}}
        onPlaceChange={p=>{setQuery('');onAreaChange(p);}}/>
    </TripEditorField>
    {area?<TripEditorField name="locationId" label="Konkretne miejsce" fields={fields} focus={()=>placeInput.current?.focus()}>
      <AutocompleteField required label="Konkretne miejsce" value={display} inputRef={placeInput} maxLength={160}
        placeholder="np. nazwa kempingu lub innego miejsca…"
        errorId={fields.errors.locationId?tripFieldErrorId('locationId'):undefined}
        hint={'Wyszukaj miejsce w miejscowości: '+area.name+'. Możesz też dodać własne.'}
        onChangeText={text=>{onClearPlace();setQuery(text);}} onClear={()=>{onClearPlace();setQuery('');}} clearLabel="Wyczyść konkretne miejsce"
        renderSuggestions={close=><PlaceSuggestions key={area.id} mode="planned" searchArea={area} query={display} initial={selected}
          onSelect={p=>{setQuery('');onPlaceChange(p);close();}}/>}/>
      {selected?.address?<AppText variant="caption" color="textSecondary">{selected.address}</AppText>:null}
    </TripEditorField>:null}
    {fields.errors.locationId&&!area?<View><AppText variant="caption" color="textSecondary">Najpierw wybierz miejscowość lub wieś.</AppText></View>:null}
  </>;
}
