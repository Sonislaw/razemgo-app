import { router } from 'expo-router';
import {
  Button,
  EmptyState,
  PageHeader,
  Screen,
} from '@/components/ui/primitives';

export function BackendPendingScreen({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Screen>
      <PageHeader title={title} />
      <EmptyState
        title="Już wkrótce"
        description={description}
        icon="trips"
        action={
          <Button label="Wróć na Start" onPress={() => router.replace('/')} />
        }
      />
    </Screen>
  );
}
