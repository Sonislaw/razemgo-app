import { openURL } from 'expo-linking';
import { AppText } from '@/components/ui/primitives';

export function GeoapifyAttribution() {
  return <AppText variant="caption" color="textSecondary" style={{fontSize:12}}>
    <AppText variant="caption" color="textSecondary" accessibilityRole="link" onPress={() => {void openURL('https://www.geoapify.com/').catch(() => {});}}>Geoapify</AppText>
    {' · © '}
    <AppText variant="caption" color="textSecondary" accessibilityRole="link" onPress={() => {void openURL('https://www.openstreetmap.org/copyright').catch(() => {});}}>OpenStreetMap contributors</AppText>
  </AppText>;
}
