import { openURL } from 'expo-linking';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { AppText, Button, ScreenFullWidth, SectionTitle, layout } from '@/components/ui/primitives';
import { useTheme } from '@/hooks/use-theme';
import type { TripPlan } from '@/types/travel';
import { areaViewport, getTripMapTarget, googleMapsSearchUrl, type TripMapTarget } from '@/features/trips/trip-map-data';
import { resolvePlaceGeometry } from '@/features/trips/places-repository';
import { MapFrame } from '@/features/discovery/map/map-frame';
import { googleMapAvailable } from '@/lib/google-map-availability';

export function TripMapCard({trip}:{trip:TripPlan}) {
  const target=getTripMapTarget(trip);
  return target ? <TripMapContent key={JSON.stringify(target)} target={target}/> : null;
}
function TripMapContent({target}:{target:TripMapTarget}) {
  const theme=useTheme();
  const [width,setWidth]=useState(0);
  const [point,setPoint]=useState(target.area),[failed,setFailed]=useState(false),[ready,setReady]=useState(false),[attempt,setAttempt]=useState(0),[openError,setOpenError]=useState(false);
  useEffect(() => {
    if(!googleMapAvailable||!target.googlePlaceId)return;
    const controller=new AbortController();
    void resolvePlaceGeometry(target.googlePlaceId,controller.signal).then(value => {
      if(controller.signal.aborted)return;
      const b=value.bounds,broad=target.placeKind==='region'||target.placeKind==='country';
      if(broad&&b){const latitude=(b.north+b.south)/2;setPoint({latitude,longitude:(b.east+b.west)/2,radiusMeters:Math.max(3000,Math.hypot((b.north-b.south)*111320/2,(b.east-b.west)*111320*Math.cos(latitude*Math.PI/180)/2))});}
      else setPoint({...value,radiusMeters:target.kind==='area' ? 3000 : 0});
    }).catch(()=>{if(!controller.signal.aborted)setFailed(true);});
    return () => controller.abort();
  },[target.googlePlaceId,target.kind,target.placeKind,attempt]);
  useEffect(() => {
    if(!googleMapAvailable||ready||(!point&&!target.googlePlaceId))return;
    const timer=setTimeout(()=>setFailed(true),20000);
    return () => clearTimeout(timer);
  },[attempt,ready,point,target.googlePlaceId]);
  const precise=target.kind==='place';
  return <View testID="trip-map-card" style={layout.stack}>
    <SectionTitle title="Lokalizacja wyjazdu"/>
    {googleMapAvailable&&(point||target.googlePlaceId) ? <ScreenFullWidth><View testID="trip-google-map" onLayout={event=>setWidth(Math.round(event.nativeEvent.layout.width))} style={[styles.map,{backgroundColor:theme.muted}]}>
      {point&&width&&!failed ? <MapFrame key={attempt+':'+point.latitude+':'+point.longitude+':'+width}
        camera={{latitude:point.latitude,longitude:point.longitude,zoom:precise?14:areaViewport(point,width).zoom}}
        area={!precise?point:undefined} selectedPoint={precise?point:undefined} points={[]} fit={null}
        onError={()=>setFailed(true)} onMessage={message=>{if(message.type==='viewport'||message.type==='tiles'){setReady(true);setFailed(false);}}}/> : null}
      {!failed&&!ready&&(point||target.googlePlaceId) ? <View pointerEvents="none" style={styles.state}><ActivityIndicator color={theme.primaryStrong}/><AppText variant="caption">Wczytywanie mapy…</AppText></View> : null}
      {failed ? <View style={styles.state}><AppText variant="label">Nie udało się wczytać mapy</AppText>
        <Button label="Wczytaj mapę ponownie" variant="secondary" onPress={()=>{setFailed(false);setReady(false);setAttempt(value=>value+1);}}/></View> : null}
    </View></ScreenFullWidth> : <AppText variant="caption" color="textSecondary">{googleMapAvailable?'Dla tego miejsca nie wskazano punktu. Lokalizację możesz sprawdzić w Google Maps.':'Lokalizację możesz sprawdzić w Google Maps.'}</AppText>}
    {!precise ? <AppText variant="caption" color="textSecondary">Lokalizacja orientacyjna — obszar wyjazdu.</AppText> : null}
    <Button label="Otwórz w Google Maps" icon="arrow" variant="secondary" onPress={()=>{
      setOpenError(false);void openURL(googleMapsSearchUrl(target)).catch(()=>setOpenError(true));
    }}/>
    {openError ? <AppText accessibilityRole="alert" variant="caption">Nie udało się otworzyć Google Maps. Spróbuj ponownie.</AppText> : null}
  </View>;
}
const styles=StyleSheet.create({map:{height:260,width:'100%',overflow:'hidden'},state:{position:'absolute',top:0,left:0,right:0,bottom:0,alignItems:'center',justifyContent:'center',gap:12,padding:16}});
