import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import {
  AppText,
  Button,
  Card,
  DemoBadge,
  IconButton,
  Screen,
} from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import { IllustratedPageHeader } from '@/components/ui/illustrated-page-header';
import { IS_DEMO_MODE } from '@/constants/app';
import { useProfile } from '@/features/profile/profile-context';
import { GroupProfileCard } from '@/features/groups/group-profile-card';
import { GroupAboutCard } from '@/features/groups/group-about-card';
import { ProfileCoverHeader } from '@/features/profile/profile-cover-header';

export default function ProfileScreen() {
  const { profile, hasProfile } = useProfile();
  const { group } = profile;
  const edit = () => router.push('/edit-profile');
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
    <Screen header={<ProfileCoverHeader avatarId={group.avatarId} title="Mój profil" actions={
      <IconButton icon="settings" label="Ustawienia aplikacji" onPress={() => router.push('/settings')} />
    } />}>
      <View style={styles.content}>
        <GroupProfileCard
          group={group}
          avatarTestID="profile-identity-avatar"
          expanded
        />
        <GroupAboutCard about={profile.about} own />
        {IS_DEMO_MODE ? (
          <View style={styles.demo}>
            <DemoBadge />
            <AppText variant="caption" color="textSecondary">
              To profil przykładowy. Zmiany zachowują się do ponownego
              uruchomienia aplikacji.
            </AppText>
          </View>
        ) : null}
        <Button label="Edytuj profil" icon="edit" variant="secondary" onPress={edit} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 24 },
  demo: { gap: 8, paddingTop: 4 },
});
