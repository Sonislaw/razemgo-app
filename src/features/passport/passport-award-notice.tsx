import { useEffect } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, IconButton } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/hooks/use-theme';
import { PASSPORT_CATEGORIES, PASSPORT_TIERS } from './passport-data';
import { useOwnPassport } from './passport-context';

export function PassportAwardNotice() {
  const { newAward, ready, dismissAward } = useOwnPassport();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  useEffect(() => {
    if (!newAward) return;
    const timer = setTimeout(() => dismissAward?.(), 10000);
    return () => clearTimeout(timer);
  }, [newAward, dismissAward]);
  if (!ready || !newAward) return null;
  const category = PASSPORT_CATEGORIES.find(c => c.id === newAward.id)!;
  return <View pointerEvents="box-none" style={[styles.position, { top: insets.top + 8 }]}>
    <View testID="passport-award-notice" accessibilityLiveRegion="polite" style={[styles.notice, { backgroundColor: theme.backgroundElement, borderColor: theme.primaryStrong }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={'Nowa odznaka: ' + category.name + '. Otwórz paszport'}
        style={styles.action} onPress={() => { dismissAward?.(); router.push('/traveler-passport'); }}>
        <Icon name="passport" size={26} />
        <View style={{ flex: 1 }}>
          <AppText variant="label">{newAward.count > 1 ? `Nowe odznaki · ${newAward.count}` : 'Nowa odznaka!'}</AppText>
          <AppText variant="caption">{category.name} · {PASSPORT_TIERS[newAward.tier - 1]}{newAward.levelUp ? ' · nowy poziom ekipy!' : ''}</AppText>
        </View>
      </Pressable>
      <IconButton icon="close" label="Zamknij informację o odznace" onPress={() => dismissAward?.()} />
    </View>
  </View>;
}
const styles = StyleSheet.create({
  position: { position: 'absolute', left: 12, right: 12, zIndex: 100, alignItems: 'center' },
  notice: { maxWidth: 560, width: '100%', borderWidth: 1, borderRadius: 20, padding: 8, flexDirection: 'row', alignItems: 'center',
    boxShadow: '0 6px 24px rgba(36,56,66,0.16)' },
  action: { flex: 1, minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8 },
});
