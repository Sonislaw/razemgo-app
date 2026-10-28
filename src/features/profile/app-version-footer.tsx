import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { View } from 'react-native';
import { AppText } from '@/components/ui/primitives';

export function AppVersionFooter() {
  const name = Application.applicationName ?? Constants.expoConfig?.name ?? 'RazemGo';
  const version = Application.nativeApplicationVersion ?? Constants.expoConfig?.version;
  const build = Application.nativeBuildVersion;

  return (
    <View style={{ alignItems: 'center', gap: 4, paddingTop: 12, paddingBottom: 8 }}>
      <AppText variant="caption" color="textSecondary">{name}</AppText>
      <AppText variant="caption" color="textSecondary">
        Wersja {version ?? 'nieznana'}{build ? ` · kompilacja ${build}` : ''}
      </AppText>
    </View>
  );
}
