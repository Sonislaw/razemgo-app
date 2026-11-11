import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { AppText, Button, layout } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import { GeoapifyAttribution } from '@/components/trips/geoapify-attribution';
import { useTheme } from '@/hooks/use-theme';
import type { SelectedPlace } from '@/types/place';
import type { GeoapifyArea } from '../../../shared/geoapify-area-data';
import { predictSearchAreas } from './geoapify-area-repository';
import { ManualAreaFields } from './manual-area-fields';
import { PLACE_KIND_LABELS } from './place-data';

export function GeoapifyAreaSuggestions({query, initial, onSelect}: {
  query:string;initial?:SelectedPlace;onSelect:(place:SelectedPlace)=>void;
}) {
  const theme = useTheme(), search = query.trim(), [manual,setManual] = useState(initial?.source==='manual');
  const [retry,setRetry] = useState(0), [cache] = useState(() => new Map<string, GeoapifyArea[]>());
  const [snapshot,setSnapshot] = useState<{key:string;areas:GeoapifyArea[];error:boolean}>({key:'',areas:[],error:false});
  const unchanged = !!initial && initial.name.trim() === search, key = search + ':' + retry;
  const loading = !manual && !unchanged && search.length >= 3 && snapshot.key !== key;
  useEffect(() => {
    if (manual || unchanged || search.length < 3) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const cached = cache.get(search.toLocaleLowerCase('pl-PL'));
      if (cached) {setSnapshot({key,areas:cached,error:false}); return;}
      void predictSearchAreas(search,controller.signal).then(areas => {
        if (controller.signal.aborted) return;
        const normalized = search.toLocaleLowerCase('pl-PL');
        cache.delete(normalized); cache.set(normalized,areas);
        if (cache.size > 20) cache.delete(cache.keys().next().value!);
        setSnapshot({key,areas,error:false});
      }).catch(() => {if (!controller.signal.aborted) setSnapshot({key,areas:[],error:true});});
    },500);
    return () => {clearTimeout(timer);controller.abort();};
  },[search,key,manual,unchanged,cache]);
  if (manual) return <ManualAreaFields query={query} initial={initial?.source==='manual'?initial:undefined} onSave={onSelect} onBack={() => setManual(false)}/>;
  const areas = snapshot.key === key ? snapshot.areas : [];
  return <View style={{gap:12}} testID="geoapify-area-suggestions">
    <AppText variant="caption" color="textSecondary" accessibilityLiveRegion="polite">{unchanged ? 'Wybrany obszar. Zmień tekst, aby wyszukać inny.' : loading ? 'Wyszukiwanie obszarów…' : search.length < 3 ?
      'Wpisz co najmniej 3 znaki: miejscowość, wieś, region lub kraj.' : areas.length ? 'Wybierz obszar' : 'Brak pasujących obszarów. Możesz dodać własny.'}</AppText>
    {loading ? <ActivityIndicator color={theme.primaryStrong}/> : null}
    {unchanged ? <Button label={'Użyj wybranego obszaru: '+initial.name} variant="secondary" onPress={() => onSelect(initial)}/> : areas.map(area =>
      <Pressable key={area.id} accessibilityRole="button" accessibilityLabel={'Wybierz miejsce: '+area.name+', '+[area.region,area.country].filter(Boolean).join(', ')+', '+PLACE_KIND_LABELS[area.kind]}
        onPress={() => onSelect(area)} style={({pressed}) => [layout.row,{paddingVertical:16,borderBottomWidth:1,borderColor:theme.border,opacity:pressed?0.65:1}]}>
        <Icon name="pin" size={24}/><View style={{flex:1,minWidth:0,gap:4}}><AppText variant="label">{area.name}</AppText>
          <AppText variant="caption" color="textSecondary">{[area.region,area.country].filter(value => value && value !== area.name).join(', ')}</AppText></View>
        <AppText variant="caption" color="textSecondary">{PLACE_KIND_LABELS[area.kind]}</AppText>
      </Pressable>)}
    {snapshot.key === key && snapshot.error ? <><AppText accessibilityRole="alert" variant="caption">Nie udało się pobrać obszarów. Spróbuj ponownie lub dodaj obszar ręcznie.</AppText>
      <Button label="Spróbuj ponownie" variant="secondary" onPress={() => setRetry(value => value+1)}/></> : null}
    <Button label="Nie ma tego obszaru? Dodaj ręcznie" variant="secondary" onPress={() => setManual(true)}/>
    <GeoapifyAttribution/>
  </View>;
}
