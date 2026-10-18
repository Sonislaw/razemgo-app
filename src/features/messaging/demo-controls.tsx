import { Switch, View } from 'react-native';
import { AppText, Button, layout } from '@/components/ui/primitives';
import { IS_DEMO_MODE } from '@/constants/app';
import { DEMO_MAILBOX } from '@/data/mocks/messaging';
import { useTheme } from '@/hooks/use-theme';
import type { MailboxScenario } from '@/types/messaging';
import { useMessaging } from './messaging-context';
import { canSendToConversation, createMessagingState } from './messaging-state';
import { MessagingSheet } from './messaging-ui';

export function DemoControls({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useMessaging();
  const theme = useTheme();
  if (!IS_DEMO_MODE) return null;
  const scenarios: { value: MailboxScenario; label: string }[] = [
    { value: 'initial', label: 'Początek · 2 nowe zaproszenia' },
    { value: 'conversations', label: '3 rozmowy · nieprzeczytane wiadomości' },
    { value: 'empty', label: 'Pusta skrzynka' },
    { value: 'loading', label: 'Symuluj ładowanie' },
    { value: 'error', label: 'Symuluj błąd połączenia' },
  ];
  const outgoing = state.invitations.find(
    (item) =>
      item.direction === 'sent' &&
      item.status === 'pending' &&
      !state.blockedGroupIds.includes(item.groupId),
  );
  const conversation = state.conversations.find((item) =>
    canSendToConversation(state, item.id),
  );
  return (
    <MessagingSheet title="Scenariusze demonstracyjne" onClose={onClose}>
      <AppText variant="caption" color="textSecondary">
        Wybór scenariusza zastępuje skrzynkę, wiadomości i blokady danymi
        przykładowymi. Nic nie jest wysyłane do innych osób.
      </AppText>
      {scenarios.map((scenario) => (
        <Button
          key={scenario.value}
          label={scenario.label}
          variant="secondary"
          onPress={() => {
            dispatch({
              type: 'reset',
              state: createMessagingState(DEMO_MAILBOX, scenario.value),
            });
            onClose();
          }}
        />
      ))}
      <View style={[layout.row, { paddingVertical: 8 }]}>
        <AppText variant="label" style={{ flex: 1 }}>
          Symuluj błąd wysyłania
        </AppText>
        <Switch
          accessibilityLabel="Symuluj błąd wysyłania"
          value={state.simulateSendError}
          onValueChange={(value) => dispatch({ type: 'send-error', value })}
          trackColor={{ true: theme.primaryStrong }}
        />
      </View>
      {outgoing && state.loadStatus === 'ready' ? (
        <Button
          label="Symuluj akceptację wysłanego zaproszenia"
          variant="secondary"
          onPress={() => {
            dispatch({
              type: 'accept',
              invitationId: outgoing.id,
              demoOutgoing: true,
            });
            onClose();
          }}
        />
      ) : null}
      {conversation ? (
        <Button
          label="Dodaj przychodzącą wiadomość demo"
          variant="secondary"
          onPress={() => {
            dispatch({ type: 'receive-demo', conversationId: conversation.id });
            onClose();
          }}
        />
      ) : null}
    </MessagingSheet>
  );
}
