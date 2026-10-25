import { Image } from 'expo-image';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from './primitives';
import { useTheme } from '@/hooks/use-theme';

// The SVG contains only ASCII attributes. Android's image data-URL loader expects base64.
function svgDataUri(svg: string) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let encoded = '';
  for (let index = 0; index < svg.length; index += 3) {
    const block = (svg.charCodeAt(index) << 16) | ((svg.charCodeAt(index + 1) || 0) << 8) | (svg.charCodeAt(index + 2) || 0);
    encoded += alphabet[(block >>> 18) & 63] + alphabet[(block >>> 12) & 63]
      + (index + 1 < svg.length ? alphabet[(block >>> 6) & 63] : '=')
      + (index + 2 < svg.length ? alphabet[block & 63] : '=');
  }
  return 'data:image/svg+xml;base64,' + encoded;
}

function CompatibilityRing({ score, size }: { score: number; size: number }) {
  const theme = useTheme();
  const source = useMemo(() => {
    const circumference = 2 * Math.PI * 12;
    const progress = score > 0
      ? `<circle cx="16" cy="16" r="12" fill="none" stroke="${theme.primaryStrong}" stroke-width="4"${score < 100
        ? ` stroke-dasharray="${circumference}" stroke-dashoffset="${circumference * (1 - score / 100)}" stroke-linecap="round" transform="rotate(-90 16 16)"`
        : ''}/>`
      : '';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="12" fill="none" stroke="${theme.community}" stroke-opacity="0.4" stroke-width="4"/>${progress}</svg>`;
    return { uri: svgDataUri(svg) };
  }, [score, theme.community, theme.primaryStrong]);

  return <View accessible={false} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={{ width: size, height: size, flexShrink: 0 }}>
    <Image source={source} contentFit="contain" cachePolicy="memory" accessible={false} alt="" style={{ width: size, height: size }} />
  </View>;
}

export function CompatibilityBadge({ score, label = 'zgodności', compact = false, tone = 'positive', testID }: {
  score: number;
  label?: string;
  compact?: boolean;
  tone?: 'positive' | 'neutral';
  testID?: string;
}) {
  const theme = useTheme();
  if (!Number.isFinite(score)) return null;
  const value = Math.round(Math.max(0, Math.min(100, score)));
  const text = value + '% ' + label;
  return <View testID={testID} accessible accessibilityLabel={text}
    style={[styles.badge, compact && styles.compact, { backgroundColor: tone === 'positive' ? theme.positiveBackground : theme.muted }]}>
    <CompatibilityRing score={value} size={compact ? 18 : 24} />
    <AppText variant={compact ? 'caption' : 'label'} color={tone === 'positive' ? 'positive' : 'primaryStrong'} style={styles.text}>{text}</AppText>
  </View>;
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', maxWidth: '100%', gap: 8,
    borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  compact: { gap: 6, paddingHorizontal: 8, paddingVertical: 5 },
  text: { flexShrink: 1, fontWeight: '700' },
});
