import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { AppText, Button, layout } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import { createRequestKey } from '@/lib/request-key';
import { useTheme } from '@/hooks/use-theme';
import type { PlacePrediction, SelectedPlace } from '@/types/place';
import { ManualPlaceFields } from './manual-place-fields';
import { predictPlaces, resolvePlace } from './places-repository';
import { PLACE_KIND_LABELS } from './place-data';
import { createPlaceQueryCache } from './place-query-cache';
import { resolveGeoapifyManualAddress } from './geoapify-place-repository';
import { GeoapifyAttribution } from '@/components/trips/geoapify-attribution';

export function PlaceSuggestions({ query, mode, onSelect, initial, searchArea }: {
  query:string;mode:string;onSelect:(place:SelectedPlace)=>void;initial?:SelectedPlace;searchArea?:SelectedPlace;
}) {
  const theme = useTheme(), [token, setToken] = useState(createRequestKey);
  const [snapshot,setSnapshot] = useState<{key:string;results:PlacePrediction[];error:string}>({key:'',results:[],error:''});
  const [selectionError,setSelectionError] = useState({key:'',message:''}), [retry,setRetry] = useState(0), [manual,setManual] = useState(initial?.source==='manual'||searchArea?.source==='manual'), [choosing,setChoosing] = useState(false);
  const search = query.trim();
  const [queryCache] = useState(createPlaceQueryCache);
  const unchangedSelection = !!initial && initial.source!=='manual' && search === initial.name.trim();
  const areaId=searchArea?.source==='geoapify'?searchArea.id:undefined;
  const cacheMode=JSON.stringify([mode,areaId]);
  const queryKey=cacheMode+':'+search+':'+retry;
  const requestKey=token+':'+queryKey;
  const results=snapshot.key===requestKey ? snapshot.results : [];
  const loading=!manual&&!unchangedSelection&&search.length>=3&&snapshot.key!==requestKey;
  const error=(selectionError.key===queryKey?selectionError.message:'')||(snapshot.key===requestKey?snapshot.error:'');
  const selection = useRef<AbortController|null>(null);
  useEffect(() => () => selection.current?.abort(), []);
  useEffect(() => {selection.current?.abort();}, [search, mode, manual, areaId]);
  useEffect(() => {
    if(manual || unchangedSelection || search.length<3 || (searchArea && !areaId))return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const cached = queryCache.get(token, search, cacheMode);
      if (cached !== undefined) {setSnapshot({key:requestKey,results:cached,error:''}); return;}
      void predictPlaces(search,mode,token,controller.signal,areaId).then(value => {
        if(!controller.signal.aborted) {queryCache.set(token,search,cacheMode,value); setSnapshot({key:requestKey,results:value,error:''});}
      }).catch(() => {if(!controller.signal.aborted) setSnapshot({key:requestKey,results:[],error:'Nie udało się pobrać podpowiedzi. Spróbuj ponownie lub dodaj miejsce ręcznie.'});});
    },500);
    return () => {clearTimeout(timer);controller.abort();};
  },[search,mode,token,manual,requestKey,unchangedSelection,queryCache,areaId,cacheMode,searchArea]);
  if(manual || (searchArea && !areaId && !unchangedSelection)) return <View style={{gap:12}}>
    <ManualPlaceFields query={query} flexible={mode==='flexible'} preciseOnly={!!searchArea} searchArea={searchArea}
      resolveAddress={searchArea?resolveGeoapifyManualAddress:undefined}
      initial={initial?.source==='manual'?initial:undefined} onSave={onSelect} onBack={() => setManual(false)}/>
    {searchArea?<GeoapifyAttribution/>:null}</View>;
  return <View style={{gap:12}} testID="google-place-suggestions">
    {searchArea?<AppText variant="caption" color="textSecondary">Miejsca w miejscowości: {searchArea.name}</AppText>:null}
    <AppText variant="caption" color="textSecondary" accessibilityLiveRegion="polite">{unchangedSelection ? 'Wybrane miejsce. Zmień tekst, aby wyszukać inne.' : loading ? 'Wyszukiwanie miejsc…' : search.length<3 ?
      'Wpisz co najmniej 3 znaki: miejscowość, nazwę kempingu lub inne miejsce.' : results.length ? 'Wybierz miejsce' : 'Brak pasujących miejsc. Możesz dodać własne.'}</AppText>
    {loading || choosing ? <ActivityIndicator color={theme.primaryStrong}/> : null}
    {unchangedSelection ? <Pressable accessibilityRole="button" accessibilityLabel={'Użyj wybranego miejsca: ' + initial.name}
      onPress={() => onSelect(initial)} style={({pressed}) => [layout.row,{paddingVertical:16,opacity:pressed?0.65:1}]}>
      <Icon name={initial.kind === 'campground' ? 'tent' : 'pin'} size={24}/><AppText variant="label" style={{flex:1}}>{initial.name}</AppText><Icon name="check"/>
    </Pressable> : null}
    {(unchangedSelection ? [] : results).map(place => <Pressable key={place.id} accessibilityRole="button" disabled={choosing}
      accessibilityLabel={'Wybierz miejsce: '+place.name+', '+place.context+', '+PLACE_KIND_LABELS[place.kind]}
      style={({pressed}) => [layout.row,{paddingVertical:16,borderBottomWidth:1,borderColor:theme.border,opacity:pressed||choosing ? 0.65 : 1}]}
      onPress={() => {
        selection.current?.abort();const controller = new AbortController();selection.current=controller;
        setChoosing(true);setSelectionError({key:queryKey,message:''});
        void resolvePlace(place.id,query.trim(),token,controller.signal).then(value => {if(!controller.signal.aborted) onSelect(value);})
          .catch(() => {if(!controller.signal.aborted) setSelectionError({key:queryKey,message:'Nie udało się wczytać miejsca. Spróbuj ponownie lub dodaj je ręcznie.'});})
          .finally(() => {setChoosing(false); if (!controller.signal.aborted) setToken(createRequestKey());});
      }}>
      <Icon name={place.kind==='campground' ? 'tent' : 'pin'} size={24}/>
      <View style={{flex:1,minWidth:0,gap:4}}><AppText variant="label">{place.name}</AppText>
        <AppText variant="caption" color="textSecondary">{place.context}</AppText></View>
      <AppText variant="caption" color="textSecondary">{PLACE_KIND_LABELS[place.kind]}</AppText>
    </Pressable>)}
    {error ? <><AppText accessibilityRole="alert" variant="caption">{error}</AppText>
      <Button label="Spróbuj ponownie" variant="secondary" disabled={choosing} onPress={() => setRetry(value=>value+1)}/></> : null}
    <Button label="Nie ma tego miejsca? Dodaj ręcznie" variant="secondary" disabled={choosing} onPress={() => {selection.current?.abort();setManual(true);}}/>
    {unchangedSelection&&initial.source==='geoapify'?<GeoapifyAttribution/>:
      <AppText style={{fontSize:14,fontWeight:'400',color:theme.textSecondary,textAlign:'right'}}>Google Maps</AppText>}
  </View>;
}
