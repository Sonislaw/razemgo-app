import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { AppText, Card, layout } from './primitives';
import { Icon } from './icon';

export function ExpandableSection({ title, summary, expanded, onToggle, children, fullWidthContent = false }: {
  title: string;
  summary: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
  fullWidthContent?: boolean;
}) {
  const header = <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ expanded }} aria-expanded={expanded}
      onPress={onToggle} style={({ pressed }) => [layout.row, { minHeight: 52, opacity: pressed ? 0.7 : 1 }]}>
      <View style={{ flex: 1, gap: 4 }}>
        <AppText variant="label">{title}</AppText>
        <AppText variant="caption" color="textSecondary">{summary}</AppText>
      </View>
      <View style={{ transform: [{ rotate: expanded ? '90deg' : '0deg' }] }}><Icon name="chevron" size={20} /></View>
    </Pressable>;
  if (fullWidthContent) return <View style={{ gap: 12 }}>
    <Card>{header}</Card>
    {expanded ? children : null}
  </View>;
  return <Card style={{ gap: expanded ? 16 : 0 }}>
    {header}
    {expanded ? children : null}
  </Card>;
}
