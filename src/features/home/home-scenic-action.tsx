import { Image } from 'expo-image';
import { Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { AppText } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import { TAB_ICONS } from '@/constants/tab-icons';

const PALETTES = {
  green: {
    background: '#174C50',
    heading: '#FFFFFF',
    text: '#F0F7F3',
    badge: '#197D77',
    button: '#FFFDF5',
    buttonText: '#174B50',
  },
  warm: {
    background: '#FFF3DB',
    heading: '#203E47',
    text: '#435E66',
    badge: '#B64A1B',
    button: '#B64A1B',
    buttonText: '#FFFFFF',
  },
} as const;

const ACTIONS = {
  crew: {
    ...PALETTES.green,
    title: 'Znajdź ekipę',
    description: 'Poznaj podróżników z podobnymi planami.',
    action: 'Szukaj teraz',
    icon: 'compass',
    artwork: require('@/assets/images/home/scenic/find-crew-campfire-caravan.webp'),
    wash: require('@/assets/images/home/scenic/crew-wash.svg'),
  },
  trip: {
    ...PALETTES.warm,
    title: 'Dodaj wyjazd',
    description: 'Zaplanuj wyjazd i znajdź towarzystwo.',
    action: 'Utwórz wyjazd',
    icon: 'caravan',
    artwork: require('@/assets/images/home/scenic/plan-trip.webp'),
    wash: require('@/assets/images/home/scenic/trip-wash.svg'),
  },
  register: {
    ...PALETTES.green,
    title: 'Nowe konto',
    description: 'Załóż konto i znajdź towarzystwo na wyjazd.',
    action: 'Nowe konto',
    artwork: require('@/assets/images/welcome/scenic/join-the-crew.webp'),
    wash: require('@/assets/images/welcome/scenic/register-wash.svg'),
  },
  login: {
    ...PALETTES.warm,
    title: 'Zaloguj się',
    description: 'Wróć do swojej ekipy i wspólnych planów.',
    action: 'Zaloguj się',
    artwork: require('@/assets/images/welcome/scenic/back-to-camp.webp'),
    wash: require('@/assets/images/welcome/scenic/login-wash.svg'),
  },
} as const;

export function HomeScenicAction({ kind, onPress }: {
  kind: keyof typeof ACTIONS;
  onPress: () => void;
}) {
  const { width } = useWindowDimensions();
  const compact = width < 360;
  const action = ACTIONS[kind];
  const tile = kind === 'register' || kind === 'login';
  return (
    <Pressable
      testID={'home-action-' + kind}
      accessibilityRole="button"
      accessibilityLabel={action.title}
      accessibilityHint={action.description}
      onPress={onPress}
      style={({ pressed }) => [styles.card, tile && styles.tileCard, pressed && styles.pressed]}
    >
      <View style={[
        styles.surface,
        { backgroundColor: action.background, minHeight: tile ? (compact ? 142 : 144) : (compact ? 176 : 184) },
        tile && styles.tileSurface,
      ]}>
        <View
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Image
            testID={'home-action-art-' + kind}
            source={action.artwork}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            contentPosition={tile ? 'top center' : 'right center'}
            transition={0}
            cachePolicy="memory-disk"
            accessible={false}
            alt=""
          />
          <Image
            source={action.wash}
            style={StyleSheet.absoluteFill}
            contentFit="fill"
            accessible={false}
            alt=""
          />
        </View>
        <View style={[styles.content, tile && styles.tileContent]} pointerEvents="none">
          {!tile ? (
            <AppText variant="heading" style={[styles.title, { color: action.heading }, compact && styles.compactTitle]}>
              {action.title}
            </AppText>
          ) : null}
          {!tile ? (
            <AppText style={[styles.description, { color: action.text }, compact && styles.compactDescription]}>
              {action.description}
            </AppText>
          ) : null}
          {/* A visual CTA inside one large tap target, without nested buttons. */}
          <View style={[styles.cta, tile && styles.tileCta, tile && compact && styles.compactTileCta, { backgroundColor: action.button }]}>
            <AppText variant="label" style={[styles.ctaLabel, { color: action.buttonText }]}>{action.action}</AppText>
            <Icon name="arrow" size={18} color={action.buttonText} />
          </View>
        </View>
        <View
          style={[StyleSheet.absoluteFill, styles.frame]}
          pointerEvents="none"
          accessible={false}
        />
      </View>
      {'icon' in action ? (
        <View
          style={[styles.badge, { backgroundColor: action.badge }]}
          pointerEvents="none"
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Image
            source={TAB_ICONS[action.icon][Platform.OS === 'web' ? 'web' : 'native'].default}
            tintColor="#FFFFFF"
            contentFit="contain"
            style={styles.badgeIcon}
            accessible={false}
            alt=""
          />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 12, borderRadius: 28, boxShadow: '0 5px 18px rgba(25, 63, 69, 0.12)' },
  pressed: { transform: [{ scale: 0.99 }] },
  tileCard: { flex: 1, minWidth: 0, marginTop: 0 },
  surface: {
    borderRadius: 28, overflow: 'hidden',
    paddingHorizontal: 18, paddingTop: 32, paddingBottom: 18, justifyContent: 'center',
  },
  tileSurface: { paddingHorizontal: 8, paddingTop: 12, paddingBottom: 12, justifyContent: 'flex-end' },
  frame: { borderRadius: 28, borderWidth: 1, borderColor: '#FFFFFFCC' },
  content: { width: '67%', gap: 8, alignItems: 'flex-start' },
  tileContent: { width: '100%' },
  title: { fontSize: 23, lineHeight: 29, fontWeight: '800' },
  compactTitle: { fontSize: 20, lineHeight: 26 },
  description: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  compactDescription: { fontSize: 13, lineHeight: 18 },
  badge: {
    position: 'absolute', left: 18, top: -12, width: 42, height: 42, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#F6FAFB',
    boxShadow: '0 3px 8px rgba(21, 55, 61, 0.14)',
  },
  badgeIcon: { width: 26, height: 26 },
  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    alignSelf: 'flex-start', maxWidth: '100%', minHeight: 40, marginTop: 4,
    borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9,
  },
  ctaLabel: { fontSize: 13, lineHeight: 18, fontWeight: '700', flexShrink: 1 },
  tileCta: { alignSelf: 'stretch' },
  compactTileCta: { paddingHorizontal: 8, gap: 4 },
});
