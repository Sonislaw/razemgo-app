import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import {
  AppText,
  Button,
  Card,
  Chip,
  DemoBadge,
  IconButton,
  PageHeader,
  Screen,
  layout,
} from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import { IS_DEMO_MODE } from '@/constants/app';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useProfile } from '@/features/profile/profile-context';
import { formatGroupSize } from '@/features/profile/profile-data';
import { GROUP_KIND_OPTIONS } from '@/features/profile/profile-options';
import { ProfileSectionCard } from '@/features/profile/profile-ui';
import type { ProfileSection } from '@/types/profile';
import { animalCountSummary } from '@/features/animals/animal-data';

export default function ProfileScreen() {
  const theme = useTheme();
  const { profile, hasProfile } = useProfile();
  const { group, matching } = profile;
  const edit = (section?: ProfileSection) =>
    router.push({
      pathname: '/edit-profile',
      params: section ? { section } : {},
    });
  const preferredGroups = GROUP_KIND_OPTIONS.filter((option) =>
    matching.groupKinds.includes(option.value),
  );
  if (!hasProfile)
    return (
      <Screen>
        <PageHeader
          title="Mój profil"
          actions={
            <IconButton
              icon="settings"
              label="Ustawienia aplikacji"
              onPress={() => router.push('/settings')}
            />
          }
        />
        <Card>
          <Icon name="people" size={32} />
          <AppText variant="heading">Poznajmy Waszą ekipę</AppText>
          <AppText color="textSecondary">
            Uzupełnijcie nazwę, przybliżoną okolicę i sposób podróżowania.
          </AppText>
          <Button label="Uzupełnij profil" icon="edit" onPress={() => edit()} />
        </Card>
        <DemoBadge />
      </Screen>
    );
  return (
    <Screen>
      <View style={styles.content}>
        <PageHeader
          title="Mój profil"
          actions={
            <IconButton
              icon="settings"
              label="Ustawienia aplikacji"
              onPress={() => router.push('/settings')}
            />
          }
        />
        <Card style={styles.identity}>
          <View style={layout.row}>
            <View style={[styles.avatar, { backgroundColor: theme.hero }]}>
              <Icon name="people" size={34} />
            </View>
            <View style={styles.identityText}>
              <AppText variant="heading" style={styles.name}>
                {group.name}
              </AppText>
              <AppText variant="label" color="textSecondary">
                {formatGroupSize(group.adultCount, group.childCount)}
              </AppText>
              <View style={layout.row}>
                <Icon name="pin" size={15} />
                <AppText
                  variant="caption"
                  color="textSecondary"
                  style={styles.flex}
                >
                  {group.homeLocation}
                </AppText>
              </View>
            </View>
          </View>
          <Button
            label="Edytuj profil"
            icon="edit"
            variant="secondary"
            onPress={() => edit()}
          />
        </Card>
        <ProfileSectionCard
          title="Nasza ekipa"
          icon="people"
          onPress={() => edit('crew')}
        >
          <AppText variant="caption" color="textSecondary">
            {group.childCount
              ? 'Podróżujemy z dziećmi w wieku:'
              : 'Podróżujemy w dorosłym gronie.'}
          </AppText>
          {group.childAgeBands.length ? (
            <View style={layout.wrap}>
              {group.childAgeBands.map((band) => (
                <Chip key={band} label={band + ' lat'} />
              ))}
            </View>
          ) : group.childCount ? (
            <AppText variant="label">
              Przedziały wieku nie zostały podane.
            </AppText>
          ) : null}
        </ProfileSectionCard>
        <ProfileSectionCard
          title="Zwierzęta w naszej ekipie"
          icon="paw"
          onPress={() => edit('animals')}
        >
          {group.animals.animals.length ? (
            <View style={layout.wrap}>
              {group.animals.animals.map((animal) => (
                <Chip key={animal.kind} label={animalCountSummary([animal])} />
              ))}
            </View>
          ) : (
            <AppText variant="caption" color="textSecondary">
              Bez zwierząt
            </AppText>
          )}
        </ProfileSectionCard>
        <ProfileSectionCard
          title="Jak podróżujemy"
          icon="camper"
          onPress={() => edit('travel')}
        >
          <View style={layout.wrap}>
            {group.travelModes.map((mode) => (
              <Chip key={mode} label={mode} />
            ))}
          </View>
        </ProfileSectionCard>
        <ProfileSectionCard
          title="Co lubimy"
          icon="sun"
          onPress={() => edit('interests')}
        >
          {group.interests.length ? (
            <View style={layout.wrap}>
              {group.interests.map((interest) => (
                <Chip key={interest} label={interest} />
              ))}
            </View>
          ) : (
            <AppText variant="caption" color="textSecondary">
              Dodajcie swoje zainteresowania.
            </AppText>
          )}
        </ProfileSectionCard>
        <ProfileSectionCard
          title="Kogo chcemy poznać?"
          icon="heart"
          onPress={() => edit('matching')}
        >
          {matching.description ? (
            <AppText
              variant="body"
              color="textSecondary"
              numberOfLines={3}
              style={{ fontSize: 14, lineHeight: 20 }}
            >
              {matching.description}
            </AppText>
          ) : null}
          <View style={layout.wrap}>
            {preferredGroups.length ? (
              preferredGroups.map((option) => (
                <Chip key={option.value} label={option.label} />
              ))
            ) : (
              <Chip label="Wszyscy podróżnicy" />
            )}
            {matching.childAgeBands.length ? (
              <Chip
                label={'Dzieci ' + matching.childAgeBands.join(', ') + ' lat'}
              />
            ) : null}
          </View>
        </ProfileSectionCard>
        {IS_DEMO_MODE ? (
          <View style={styles.demo}>
            <DemoBadge />
            <AppText variant="caption" color="textSecondary">
              To profil przykładowy. Zmiany zachowują się do ponownego
              uruchomienia aplikacji.
            </AppText>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}
const styles = StyleSheet.create({
  content: { gap: 12 },
  identity: { padding: 14, gap: 14 },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: Radius.card,
    justifyContent: 'center',
    alignItems: 'center',
  },
  identityText: { flex: 1, gap: 4 },
  name: { fontSize: 18, lineHeight: 24 },
  flex: { flex: 1 },
  demo: { gap: 8, paddingTop: 4 },
});
