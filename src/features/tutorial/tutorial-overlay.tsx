import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { AccessibilityInfo, Animated, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import { SheetBackdrop, SheetModal } from '@/components/ui/sheet-modal';
import { useSheetSurfaceAnimation } from '@/components/ui/sheet-transition';
import { useTheme } from '@/hooks/use-theme';
import { TUTORIAL_STEPS, useTutorial } from './tutorial-context';

type Rect = { x: number; y: number; width: number; height: number };
export function TutorialOverlay() {
  const tutorial = useTutorial();
  if (!tutorial.offer && tutorial.step === null) return null;
  return <SheetModal onRequestClose={tutorial.skip}><TutorialContent /></SheetModal>;
}

function TutorialContent() {
  const { offer, step, anchors, skip, start, next, back } = useTutorial();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const root = useRef<ComponentRef<typeof View>>(null);
  const [rect, setRect] = useState<(Rect & { target: string }) | null>(null);
  const [cardHeight, setCardHeight] = useState(208);
  const animation = useSheetSurfaceAnimation(event => setCardHeight(event.nativeEvent.layout.height));
  const current = step === null ? null : TUTORIAL_STEPS[step];
  useEffect(() => {
    if (!current) return;
    let active = true;
    const measure = () => {
      const anchor = anchors.get(current.target);
      if (!anchor) return;
      root.current?.measureInWindow((originX, originY) => {
        anchor.node.measureInWindow((x, y, w, h) => {
          if (!active || w <= 0 || h <= 0) return;
          const left = Math.max(8, x - originX - 4);
          const top = Math.max(insets.top + 8, y - originY - 4);
          const right = Math.min(width - 8, x - originX + w + 4);
          const bottom = Math.min(height - insets.bottom - 8, y - originY + h + 4);
          if (right <= left || bottom <= top) return;
          const next = { x: left, y: top, width: right - left, height: bottom - top, target: current.target };
          setRect(previous => previous && Object.keys(next).every(key => previous[key as keyof typeof next] === next[key as keyof typeof next]) ? previous : next);
        });
      });
    };
    measure();
    const timer = setInterval(measure, 160);
    return () => { active = false; clearInterval(timer); };
  }, [current, anchors, width, height, insets.top, insets.bottom]);
  useEffect(() => {
    if (current && Platform.OS !== 'web') AccessibilityInfo.announceForAccessibility(`Samouczek. ${(step ?? 0) + 1} z ${TUTORIAL_STEPS.length}. ${current.title}`);
  }, [current, step]);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handleKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); skip(); } };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [skip]);

  const activeRect = rect?.target === current?.target ? rect : null;
  const safeTop = insets.top + 16;
  const safeBottom = height - insets.bottom - 16;
  const below = activeRect ? activeRect.y + activeRect.height + 12 : 0;
  const roomBelow = Math.max(0, safeBottom - below);
  const roomAbove = activeRect ? Math.max(0, activeRect.y - 12 - safeTop) : 0;
  const placeBelow = roomBelow >= cardHeight || (roomAbove < cardHeight && roomBelow >= roomAbove);
  const roomForPanel = placeBelow ? roomBelow : roomAbove;
  // Keep the spotlight when native text scaling makes the description taller.
  // Constrain its scrollable panel to the available side instead of dimming the target.
  const besideTarget = !offer && !!activeRect && roomForPanel >= 160;
  const panelMaxHeight = besideTarget ? roomForPanel : safeBottom - safeTop;
  const cutout = !offer ? activeRect ?? undefined : undefined;
  const top = offer ? undefined : besideTarget
    ? placeBelow ? below : activeRect!.y - 12 - Math.min(cardHeight, panelMaxHeight)
    : Math.max(safeTop, safeBottom - Math.min(cardHeight, panelMaxHeight));
  const bubbleWidth = Math.min(width - 32, 336);
  const bubbleLeft = (width - bubbleWidth) / 2;
  const pointerLeft = activeRect
    ? Math.max(24, Math.min(bubbleWidth - 38, activeRect.x + activeRect.width / 2 - bubbleLeft - 7))
    : 0;
  return <View ref={root} collapsable={false} style={styles.root} testID="tutorial-overlay">
    <SheetBackdrop label="Pomiń samouczek" onPress={skip} cutout={cutout} />
    {cutout ? <View pointerEvents="none" testID="tutorial-spotlight" style={{ position: 'absolute', left: cutout.x, top: cutout.y, width: cutout.width, height: cutout.height, borderWidth: 3, borderColor: theme.primary, borderRadius: 20 }} /> : null}
    <Animated.View
      key={offer ? 'offer' : step}
      role="dialog" accessibilityViewIsModal aria-modal
      accessibilityLabel={`Samouczek: ${offer ? 'Witaj w społeczności RazemGO!' : current?.title}`}
      testID={offer ? 'tutorial-offer' : 'tutorial-step'}
      onLayout={animation.onLayout}
      style={[styles.card, {
        backgroundColor: theme.backgroundElement,
        top, bottom: offer ? insets.bottom + 16 : undefined,
        maxHeight: panelMaxHeight,
        width: bubbleWidth,
      }, animation.style]}
    >
      {besideTarget ? <View
        testID="tutorial-pointer"
        pointerEvents="none"
        accessible={false}
        style={[styles.pointer, placeBelow ? styles.pointerTop : styles.pointerBottom, {
          left: pointerLeft, backgroundColor: theme.backgroundElement, borderColor: theme.backgroundElement,
        }]}
      /> : null}
      <View style={styles.content}>
        <View style={styles.header}>
          <View style={styles.progress}>
            <View style={[styles.badge, { backgroundColor: theme.backgroundSelected }]}>
              <AppText variant="caption" color="primaryStrong" style={{ fontWeight: '700' }}>Samouczek</AppText>
            </View>
            <AppText variant="caption" color="textSecondary">{offer ? `${TUTORIAL_STEPS.length} kroków` : `${(step ?? 0) + 1} z ${TUTORIAL_STEPS.length}`}</AppText>
          </View>
          <Pressable accessibilityRole="button" onPress={skip} hitSlop={4} style={({ pressed }) => [styles.skip, pressed && styles.pressed]}>
            <AppText variant="caption" color="textSecondary">Pomiń</AppText>
          </Pressable>
        </View>
        <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={styles.body}>
          <AppText variant="heading" accessibilityRole="header" style={styles.title}>{offer ? 'Witaj w społeczności RazemGO!' : current?.title}</AppText>
          <AppText color="textSecondary" style={styles.description}>{offer ? 'Dziękujemy za rejestrację! Cieszymy się, że jesteś z nami. W krótkim samouczku poznasz podstawowe funkcje aplikacji. Możesz go pominąć w dowolnej chwili.' : current?.text}</AppText>
        </ScrollView>
        <View style={styles.actions}>
          {!offer && step !== null && step > 0 ? <Pressable
            accessibilityRole="button" accessibilityLabel="Wstecz" onPress={back} hitSlop={2}
            style={({ pressed }) => [styles.back, pressed && styles.pressed]}
          >
            <Icon name="back" size={16} color={theme.textSecondary} />
            <AppText variant="caption" color="textSecondary">Wstecz</AppText>
          </Pressable> : <View />}
          <Pressable
            accessibilityRole="button" accessibilityLabel={offer ? 'Pokaż' : step === TUTORIAL_STEPS.length - 1 ? 'Gotowe' : 'Dalej'}
            onPress={offer ? start : next} hitSlop={2}
            style={({ pressed }) => [styles.next, { backgroundColor: theme.primary }, pressed && styles.pressed]}
          >
            <AppText variant="label" style={styles.nextLabel} color="onPrimary">{offer ? 'Pokaż' : step === TUTORIAL_STEPS.length - 1 ? 'Gotowe' : 'Dalej'}</AppText>
            <Icon name={step === TUTORIAL_STEPS.length - 1 ? 'check' : 'arrow'} size={16} color={theme.onPrimary} />
          </Pressable>
        </View>
      </View>
    </Animated.View>
  </View>;
}
const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center' },
  card: { position: 'absolute', borderRadius: 22, borderWidth: 1, borderColor: '#FFFFFF', boxShadow: '0 6px 24px rgba(0, 30, 40, 0.16)' },
  content: { paddingHorizontal: 14, paddingTop: 6, paddingBottom: 12, flexShrink: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 2 },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  skip: { minHeight: 36, minWidth: 44, justifyContent: 'center', alignItems: 'center' },
  body: { gap: 4, paddingBottom: 2 },
  title: { fontSize: 18, lineHeight: 24 },
  description: { fontSize: 14, lineHeight: 20 },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingTop: 8 },
  back: { minHeight: 40, paddingRight: 10, flexDirection: 'row', alignItems: 'center', gap: 4 },
  next: { minHeight: 40, minWidth: 98, paddingHorizontal: 14, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  nextLabel: { fontSize: 13, lineHeight: 18 },
  pressed: { opacity: 0.7 },
  pointer: { position: 'absolute', width: 14, height: 14, transform: [{ rotate: '45deg' }] },
  pointerTop: { top: -7, borderTopWidth: 1, borderLeftWidth: 1 },
  pointerBottom: { bottom: -7, borderBottomWidth: 1, borderRightWidth: 1 },
});
