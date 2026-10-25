import { View } from 'react-native';
import { AppText } from '@/components/ui/primitives';
import { CompatibilityBadge } from '@/components/ui/compatibility-badge';
import { useTheme } from '@/hooks/use-theme';
import type { GroupCompatibility } from './group-compatibility';

export function GroupCompatibilitySummary({ match, testID, detailed = false }: {
  match?: GroupCompatibility; testID?: string; detailed?: boolean;
}) {
  const theme = useTheme();
  if (!match) return null;
  const scored = match.score !== null;
  return <View style={{ gap: 6 }} testID={testID}>
    {scored ? <CompatibilityBadge score={match.score!} label="zgodności profili" tone={match.score! >= 70 ? 'positive' : 'neutral'} /> : (
    <View style={{ alignSelf: 'flex-start', maxWidth: '100%', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7,
      backgroundColor: theme.muted }}>
      <AppText variant="label" color="primaryStrong">
        Za mało danych do oceny
      </AppText>
    </View>)}
    {scored && match.reasons.length ? <AppText variant="caption" color="textSecondary">{match.reasons.slice(0, detailed ? 5 : 3).join(' · ')}</AppText> : null}
    {!scored || match.limitedData ? <AppText variant="caption" color="textSecondary">
      {scored ? 'Ograniczone dane — wynik opiera się na części kryteriów.' : 'Do porównania potrzeba więcej danych o zainteresowaniach i preferencjach ekip.'}
    </AppText> : null}
    {detailed ? <AppText variant="caption" color="textSecondary">
      Wynik uwzględnia preferencje obu ekip: rodzaj towarzystwa, wiek dzieci, zainteresowania i sposób podróżowania.
      Puste preferencje oznaczają otwartość. Zwierzęta, terminy i kierunki wyjazdów nie zmieniają tej oceny.
    </AppText> : null}
  </View>;
}
