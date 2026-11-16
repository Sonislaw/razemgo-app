import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaxContentWidth } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { TripPlan } from '@/types/travel';
import { AppText } from '@/components/ui/primitives';
import { GeoapifyAttribution } from './geoapify-attribution';

export function GoogleMapsAttribution() {
  return <AppText testID="google-maps-attribution" style={styles.google}>Google Maps</AppText>;
}

// List cards display the saved locality, rather than the Google destination.
// Use the same source here. Legacy Google results retain their credit in the
// card, keeping it clear which data Google provided in a mixed list.
export function tripListHasGeoapify(trips:readonly TripPlan[]){
  return trips.some(trip=>{
    const place=trip.mode==='planned'?trip.searchArea:trip.travelArea.place;
    return place?.source==='geoapify';
  });
}

export function TripListAttribution({trips, bar=false, safeBottom=false}: {trips:readonly TripPlan[];bar?:boolean;safeBottom?:boolean}) {
  const theme=useTheme(),insets=useSafeAreaInsets();
  if(!tripListHasGeoapify(trips))return null;
  return <View testID="trip-list-attribution" style={bar?{
    backgroundColor:theme.background,paddingTop:6,paddingBottom:safeBottom?Math.max(insets.bottom,6):6,
    paddingLeft:Math.max(insets.left,16),paddingRight:Math.max(insets.right,16),
  }:undefined}>
    <View style={styles.content}>
      <GeoapifyAttribution/>
    </View>
  </View>;
}

const styles=StyleSheet.create({
  content:{gap:4,width:'100%',maxWidth:MaxContentWidth,alignSelf:'center'},
  google:{fontSize:12,lineHeight:18,fontWeight:'400',fontStyle:'normal',color:'#5E5E5E'},
});
