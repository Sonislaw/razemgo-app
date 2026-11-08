import { useState, type Ref } from 'react';
import { View } from 'react-native';
import { AutocompleteField, type AutocompleteFieldHandle } from '@/components/ui/autocomplete-field';
import { AppText } from '@/components/ui/primitives';
import type { TripMode } from '@/types/travel';
import type { SelectedPlace } from '@/types/place';
import { findTripLocation, locationContext } from './trip-locations';
import { PlaceSuggestions } from './place-suggestions';
import { PLACE_KIND_LABELS, placeSearchRadiusKm } from './place-data';
import { useLivePlace } from './use-live-place';

export type TripLocationFieldHandle = AutocompleteFieldHandle;
export function TripLocationField({ value, mode, onChange, place, onPlaceChange, required=true, label:customLabel,
  hint, query:controlledQuery, onQueryChange, inputRef, errorId,
}: {
  value:string; mode:TripMode; onChange:(id:string)=>void; place?:SelectedPlace;
  onPlaceChange?:(place:SelectedPlace)=>void; required?:boolean; label?:string; hint?:string;
  query?:string; onQueryChange?:(query:string)=>void; inputRef?:Ref<TripLocationFieldHandle>; errorId?:string;
}) {
  const label=customLabel ?? (mode==='planned' ? 'Dokąd jedziecie?' : 'Gdzie chcecie pojechać?');
  const [localQuery,setLocalQuery]=useState('');
  const legacy=findTripLocation(value);
  const live=useLivePlace(place);
  const selected=live?.id===value ? live : undefined;
  const query=controlledQuery ?? localQuery;
  const display=selected?.name ?? legacy?.name ?? query;
  const setQuery=(text:string) => {setLocalQuery(text);onQueryChange?.(text);};
  const clear=() => {onChange('');setQuery('');};
  return <View style={{gap:8}}>
    <AutocompleteField label={label} value={display} required={required} inputRef={inputRef} errorId={errorId}
      placeholder="np. Białowieża, Camping…" maxLength={160}
      hint={hint ?? 'Wpisz miejscowość, nazwę kempingu lub inne miejsce. Możesz też dodać własne.'}
      onChangeText={text => {onChange('');setQuery(text);}} onClear={clear} clearLabel="Wyczyść lokalizację"
      renderSuggestions={close => <PlaceSuggestions key={selected?.id??'search'} initial={selected} query={display} mode={mode} onSelect={chosen => {
        if(onPlaceChange) onPlaceChange(chosen); else onChange(chosen.id);
        setLocalQuery('');close();
      }}/>}/>
    {selected ? <AppText variant="caption" color="textSecondary">
      {PLACE_KIND_LABELS[selected.kind]}{selected.address ? ' · '+selected.address : ''}
      {!required ? selected.source==='google'&&['region','country'].includes(selected.kind) ? ' · obszar wybranego miejsca' : ' · okolice do '+placeSearchRadiusKm(selected.kind)+' km' : ''}
    </AppText> : legacy ? <AppText variant="caption" color="textSecondary">{locationContext(legacy)}</AppText> : null}
  </View>;
}
