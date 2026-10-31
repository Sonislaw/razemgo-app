import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
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
import { IS_DEMO_MODE, USE_DEMO_DATA } from '@/constants/app';
import { useProfile } from '@/features/profile/profile-context';
import { ProfileSectionCard } from '@/features/profile/profile-ui';
import { GroupProfileCard } from '@/features/groups/group-profile-card';
import { fetchGroupVisibility } from '@/features/groups/group-repository';
import { DataStatus } from '@/components/ui/data-status';
import type { TravelGroup } from '@/types/travel';

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
    <Screen header={header}>
      <View style={styles.content}>
        <OwnProfileSummary key={group.id} group={group} onEdit={edit} />
        <ProfileSectionCard
          title="Profil publiczny"
          icon="people"
          onPress={() => router.push('/group-visibility')}
        >
          <AppText variant="caption" color="textSecondary">
            Przedstaw ekipę i zdecyduj, czy inni podróżnicy mogą znaleźć ją w wyszukiwarce.
          </AppText>
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

function OwnProfileSummary({ group, onEdit }: { group: TravelGroup; onEdit: () => void }) {
  const [about, setAbout] = useState('');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(USE_DEMO_DATA ? 'ready' : 'loading');
  const generation = useRef(0);
  const load = useCallback(async () => {
    if (USE_DEMO_DATA) return;
    const request = ++generation.current;
    setStatus('loading');
    try {
      const visibility = await fetchGroupVisibility();
      if (request === generation.current) {
        setAbout(visibility.about);
        setStatus('ready');
      }
    } catch {
      if (request === generation.current) setStatus('error');
    }
  }, []);
  useFocusEffect(useCallback(() => {
    void load();
    return () => { generation.current++; };
  }, [load]));

  return <>
    <GroupProfileCard
      group={group}
      about={about}
      avatarTestID="profile-identity-avatar"
      headerAction={<Button label="Edytuj profil" icon="edit" variant="secondary" onPress={onEdit} />}
    />
    <DataStatus
      status={status}
      label="Wczytywanie opisu publicznego"
      error="Nie udało się pobrać opisu publicznego. Sprawdź połączenie i spróbuj ponownie."
      onRetry={() => void load()}
    />
  </>;
}

const styles = StyleSheet.create({
  content: { gap: 12 },
  demo: { gap: 8, paddingTop: 4 },
});
