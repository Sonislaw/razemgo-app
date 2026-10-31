import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon, type IconName } from '@/components/ui/icon';
import { ListingTag } from '@/components/ui/listing-tag';
import { AppText, Card, layout } from '@/components/ui/primitives';
import { tripAnimalSummary } from '@/features/animals/animal-data';
import { AnimalPortrait } from '@/features/animals/animal-portrait';
import { useTheme } from '@/hooks/use-theme';
import { tripParticipantsSummary } from '@/lib/trip-participants';
import type { TripAnimals } from '@/types/animals';
import type { TripParticipants } from '@/types/travel';

export function TripParticipantsCard({ value, animals }: {
  value?: TripParticipants | null;
  animals: TripAnimals;
}) {
  const theme = useTheme();
  return (
    <Card>
      <AppText variant="heading" accessibilityRole="header">Skład wyjazdu</AppText>
      <View testID="trip-participants" style={styles.composition}>
        {value ? <>
          <CompositionRow icon="profile" title={`${value.adultCount} ${value.adultCount === 1 ? 'dorosły' : 'dorosłych'}`} />
          {value.childCount > 0 ? (
            <CompositionRow icon="people" title={`${value.childCount} ${value.childCount === 1 ? 'dziecko' : 'dzieci'}`} warm>
              <View style={layout.wrap}>
                {value.childAgeBands.length ? value.childAgeBands.map(band => (
                  <ListingTag key={band} label={band + ' lat'} tone="warm" />
                )) : <ListingTag label="Wiek dzieci niepodany" tone="warm" />}
              </View>
            </CompositionRow>
          ) : null}
        </> : <AppText color="textSecondary">{tripParticipantsSummary(value)}</AppText>}
      </View>
      <View style={[styles.animals, { borderTopColor: theme.border }]}>
        <CompositionRow icon="paw" title="Zwierzęta" warm>
          {animals.animals.length ? (
            <View style={styles.pets}>
              {animals.animals.map(animal => (
                <View key={animal.kind} style={styles.pet}>
                  <AnimalPortrait kind={animal.kind} size={36} />
                  <AppText variant="caption" color="textSecondary">{tripAnimalSummary({ animals: [animal] })}</AppText>
                </View>
              ))}
            </View>
          ) : <AppText variant="caption" color="textSecondary">Bez zwierząt na tym wyjeździe.</AppText>}
        </CompositionRow>
      </View>
    </Card>
  );
}

function CompositionRow({ title, icon, warm = false, children }: {
  title: string;
  icon: IconName;
  warm?: boolean;
  children?: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <View style={[styles.icon, { backgroundColor: warm ? theme.hero : theme.backgroundSelected }]}>
        <Icon name={icon} size={20} />
      </View>
      <View style={styles.content}>
        <AppText variant="label" style={styles.rowTitle}>{title}</AppText>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  composition: { gap: 14 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  content: { flex: 1, minWidth: 0, gap: 8, paddingVertical: 6 },
  rowTitle: { fontSize: 16, lineHeight: 24 },
  animals: { borderTopWidth: 1, paddingTop: 14 },
  pets: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 8 },
  pet: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
