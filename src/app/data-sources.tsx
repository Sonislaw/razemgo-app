import {useState} from 'react';
import {View} from 'react-native';
import {router} from 'expo-router';
import {openURL} from 'expo-linking';
import {AppText,Button,Card,Screen,layout} from '@/components/ui/primitives';
import {ProfileSubpageHeader} from '@/features/profile/profile-ui';

export default function DataSourcesScreen(){
  const [error,setError]=useState(false);
  const open=(url:string)=>{setError(false);void openURL(url).catch(()=>setError(true));};
  return <Screen testID="data-sources-screen">
    <View style={layout.stack}>
      <ProfileSubpageHeader title="Źródła danych" backLabel="Wróć do ustawień"
        onBack={()=>router.canGoBack()?router.back():router.replace('/settings')}/>
      <AppText color="textSecondary">Dzięki tym dostawcom możesz wybierać miejsca, oglądać mapy i sprawdzać pogodę na wyjazd.</AppText>
      <Card>
        <AppText variant="heading" accessibilityRole="header">Geoapify</AppText>
        <AppText color="textSecondary">Nazwy miejscowości, wsi, regionów i krajów, obszary poszukiwań oraz położenie miejsc dodanych ręcznie na podstawie adresu.</AppText>
        <Button label="O Geoapify" variant="secondary" icon="arrow" onPress={()=>open('https://www.geoapify.com/')}/>
      </Card>
      <Card>
        <AppText variant="heading" accessibilityRole="header">OpenStreetMap</AppText>
        <AppText color="textSecondary">Geoapify korzysta z danych społeczności OpenStreetMap. Dane OpenStreetMap są udostępniane na licencji Open Database License (ODbL).</AppText>
        <AppText variant="caption" color="textSecondary">© OpenStreetMap contributors</AppText>
        <Button label="Licencja OpenStreetMap" variant="secondary" icon="arrow" onPress={()=>open('https://www.openstreetmap.org/copyright')}/>
      </Card>
      <Card>
        <AppText variant="heading" accessibilityRole="header">Google Maps</AppText>
        <AppText color="textSecondary">Mapy wyjazdów i informacje o kempingach oraz innych konkretnych miejscach pochodzą z Google Maps. Prognozę pogody dostarcza Google Weather.</AppText>
        <Button label="Warunki Google Maps" variant="secondary" icon="arrow" onPress={()=>open('https://maps.google.com/help/terms_maps/')}/>
        <Button label="Prywatność Google" variant="secondary" icon="arrow" onPress={()=>open('https://policies.google.com/privacy')}/>
      </Card>
      {error?<AppText accessibilityRole="alert">Nie udało się otworzyć strony. Spróbuj ponownie.</AppText>:null}
    </View>
  </Screen>;
}
