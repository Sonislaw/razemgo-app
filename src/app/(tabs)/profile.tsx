import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import {
  AppText,
  Button,
  Card,
  Chip,
  DemoBadge,
  IconButton,
  Screen,
  layout,
} from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import { IllustratedPageHeader } from '@/components/ui/illustrated-page-header';
import { IS_DEMO_MODE } from '@/constants/app';
import { useProfile } from '@/features/profile/profile-context';
import { formatGroupSize } from '@/features/profile/profile-data';
import { GROUP_KIND_OPTIONS } from '@/features/profile/profile-options';
import { ProfileSectionCard } from '@/features/profile/profile-ui';
import type { ProfileSection } from '@/types/profile';
import { AnimalBadge } from '@/features/animals/animal-portrait';
import { TravelModeBadges } from '@/features/profile/travel-mode-ui';
import { ProfileAvatar } from '@/features/profile/profile-avatar';

export default function ProfileScreen() {
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
  const header = (
    <IllustratedPageHeader
      title="Mój profil"
      description={'Twoja ekipa, podróże\ni zainteresowania.'}
      actions={
        <IconButton
          icon="settings"
          label="Ustawienia aplikacji"
          onPress={() => router.push('/settings')}
        />
      }
    />
  );
  if (!hasProfile)
    return (
      <Screen header={header}>
        <Card>
          <Icon name="people" size={32} />
          <AppText variant="heading">Przedstaw swoją ekipę</AppText>
          <AppText color="textSecondary">
            Uzupełnij nazwę ekipy i sposób podróżowania.
          </AppText>
          <Button label="Uzupełnij profil" icon="edit" onPress={() => edit()} />
        </Card>
        <DemoBadge />
      </Screen>
    );
  return (
    <Screen header={header}>
      <View style={styles.content}>
        <Card style={styles.identity}>
          <View style={layout.row}>
            <ProfileAvatar
              avatarId={group.avatarId}
              size={64}
              testID="profile-identity-avatar"
            />
            <View style={styles.identityText}>
              <AppText variant="heading" style={styles.name}>
                {group.name}
              </AppText>
              <AppText variant="label" color="textSecondary">
                {formatGroupSize(group.adultCount, group.childCount)}
              </AppText>
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
          title="Moja ekipa"
          icon="people"
          onPress={() => edit('crew')}
        >
          <AppText variant="caption" color="textSecondary">
            {group.childCount
              ? 'Podróżuję z dziećmi w wieku:'
              : 'Podróżuję w dorosłym gronie.'}
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
          title="Zwierzęta w mojej ekipie"
          icon="paw"
          onPress={() => edit('animals')}
        >
          {group.animals.animals.length ? (
            <View style={layout.wrap}>
              {group.animals.animals.map((animal) => (
                <AnimalBadge key={animal.kind} kind={animal.kind} />
              ))}
            </View>
          ) : (
            <AppText variant="caption" color="textSecondary">
              Bez zwierząt
            </AppText>
          )}
        </ProfileSectionCard>
        <ProfileSectionCard
          title="Jak podróżuję"
          icon="camper"
          onPress={() => edit('travel')}
        >
          <TravelModeBadges modes={group.travelModes} />
        </ProfileSectionCard>
        <ProfileSectionCard
          title="Co lubię"
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
              Dodaj swoje zainteresowania.
            </AppText>
          )}
        </ProfileSectionCard>
        <ProfileSectionCard
          title="Kogo chcę poznać?"
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
  identityText: { flex: 1, gap: 4 },
  name: { fontSize: 18, lineHeight: 24 },
  demo: { gap: 8, paddingTop: 4 },
});
