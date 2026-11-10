import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { AppText, Button, layout } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import { createRequestKey } from '@/lib/request-key';
import { useTheme } from '@/hooks/use-theme';
import type { PlacePrediction, SelectedPlace } from '@/types/place';
import { ManualPlaceFields } from './manual-place-fields';
import { ManualAreaFields } from './manual-area-fields';
import { predictPlaces, resolvePlace } from './places-repository';
import { PLACE_KIND_LABELS } from './place-data';
import { createPlaceQueryCache } from './place-query-cache';

export function PlaceSuggestions({ query, mode, onSelect, initial, areasOnly=false }: {
  query:string;mode:string;onSelect:(place:SelectedPlace)=>void;initial?:SelectedPlace;areasOnly?:boolean;
}) {
  const theme = useTheme(), [token, setToken] = useState(createRequestKey);
  const [snapshot,setSnapshot] = useState<{key:string;results:PlacePrediction[];error:string}>({key:'',results:[],error:''});
  const [selectionError,setSelectionError] = useState({key:'',message:''}), [retry,setRetry] = useState(0), [manual,setManual] = useState(initial?.source==='manual'), [choosing,setChoosing] = useState(false);
  const search = query.trim();
  const [queryCache] = useState(createPlaceQueryCache);
  const unchangedSelection = initial?.source === 'google' && search === initial.name.trim();
  const queryKey=mode+':'+areasOnly+':'+search+':'+retry;
  const requestKey=token+':'+queryKey;
  const results=snapshot.key===requestKey ? snapshot.results : [];
  const loading=!manual&&!unchangedSelection&&search.length>=3&&snapshot.key!==requestKey;
  const error=(selectionError.key===queryKey?selectionError.message:'')||(snapshot.key===requestKey?snapshot.error:'');
  const selection = useRef<AbortController|null>(null);
  useEffect(() => () => selection.current?.abort(), []);
  useEffect(() => {selection.current?.abort();}, [search, mode, manual]);
  useEffect(() => {
    if(manual || unchangedSelection || search.length<3)return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const cached = queryCache.get(token, search, mode, areasOnly);
      if (cached !== undefined) {setSnapshot({key:requestKey,results:cached,error:''}); return;}
      void predictPlaces(search,mode,token,controller.signal,areasOnly).then(value => {
        if(!controller.signal.aborted) {queryCache.set(token,search,mode,areasOnly,value); setSnapshot({key:requestKey,results:value,error:''});}
      }).catch(() => {if(!controller.signal.aborted) setSnapshot({key:requestKey,results:[],error:'Nie udało się pobrać podpowiedzi. Spróbuj ponownie lub dodaj miejsce ręcznie.'});});
    },500);
    return () => {clearTimeout(timer);controller.abort();};
  },[search,mode,token,manual,requestKey,areasOnly,unchangedSelection,queryCache]);
  if(manual&&areasOnly)return <ManualAreaFields query={query} initial={initial?.source==='manual'?initial:undefined} onSave={onSelect} onBack={()=>setManual(false)}/>;
  if(manual) return <ManualPlaceFields query={query} flexible={mode==='flexible'} initial={initial?.source==='manual'?initial:undefined} onSave={onSelect} onBack={() => setManual(false)}/>;
  return <View style={{gap:12}} testID="google-place-suggestions">
    <AppText variant="caption" color="textSecondary" accessibilityLiveRegion="polite">{unchangedSelection ? 'Wybrane miejsce. Zmień tekst, aby wyszukać inne.' : loading ? 'Wyszukiwanie miejsc…' : search.length<3 ?
      (areasOnly?'Wpisz co najmniej 3 znaki: miejscowość, wieś, region lub kraj.':'Wpisz co najmniej 3 znaki: miejscowość, nazwę kempingu lub inne miejsce.') : results.length ? (areasOnly?'Wybierz obszar':'Wybierz miejsce') : (areasOnly?'Brak pasujących obszarów. Możesz dodać własny.':'Brak pasujących miejsc. Możesz dodać własne.')}</AppText>
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
        void resolvePlace(place.id,query.trim(),token,controller.signal,areasOnly).then(value => {if(!controller.signal.aborted) onSelect(value);})
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
    <Button label={areasOnly?'Nie ma tego obszaru? Dodaj ręcznie':'Nie ma tego miejsca? Dodaj ręcznie'} variant="secondary" disabled={choosing} onPress={() => {selection.current?.abort();setManual(true);}}/>
    <AppText style={{fontSize:14,fontWeight:'400',color:theme.textSecondary,textAlign:'right'}}>Google Maps</AppText>
  </View>;
}
