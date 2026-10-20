import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { AppText, Button, Chip, layout } from '@/components/ui/primitives';
import type { Conversation, ReportReason } from '@/types/messaging';
import { useMessaging } from './messaging-context';
import { MessagingSheet } from './messaging-ui';

export function ConversationSafety({
  conversation,
  onClose,
  onReport,
}: {
  conversation: Conversation;
  onClose: () => void;
  onReport: () => void;
}) {
  const { state, dispatch } = useMessaging();
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState<ReportReason>('Spam');
  const blocked = state.blockedGroupIds.includes(conversation.groupId);
  return (
    <MessagingSheet
      title={reporting ? 'Zgłoś konto' : 'Bezpieczna rozmowa'}
      onClose={onClose}
    >
      {reporting ? (
        <>
          <AppText variant="label">Co budzi Wasze obawy?</AppText>
          <View style={layout.wrap}>
            {(
              [
                'Spam',
                'Niewłaściwe treści',
                'Podszywanie się',
                'Inny powód',
              ] as const
            ).map((value) => (
              <Chip
                key={value}
                label={value}
                selected={reason === value}
                onPress={() => setReason(value)}
              />
            ))}
          </View>
          <Button
            label="Zapisz zgłoszenie"
            icon="flag"
            onPress={() => {
              dispatch({
                type: 'report',
                conversationId: conversation.id,
                reason,
              });
              onReport();
              onClose();
            }}
          />
          <Button
            label="Wróć do opcji"
            variant="secondary"
            onPress={() => setReporting(false)}
          />
        </>
      ) : (
        <>
          <AppText color="textSecondary">
            Rozmawiają dorośli. Dane dzieci z profilu nie są dodawane do
            rozmowy.
          </AppText>
          <Button
            label={blocked ? 'Odblokuj ekipę' : 'Zablokuj ekipę'}
            icon="block"
            variant="secondary"
            onPress={() => {
              dispatch({
                type: blocked ? 'unblock' : 'block',
                groupId: conversation.groupId,
              });
              onClose();
            }}
          />
          <AppText variant="caption" color="textSecondary">
            Blokada wstrzymuje rozmowę i nowe zaproszenia tej ekipy.
            Możecie ją cofnąć w dowolnej chwili.
          </AppText>
          <Button
            label="Zgłoś konto"
            icon="flag"
            variant="secondary"
            onPress={() => setReporting(true)}
          />
          <Button
            label="Zasady i zablokowane ekipy"
            icon="shield"
            variant="secondary"
            onPress={() => {
              onClose();
              router.push('/messaging-safety');
            }}
          />
        </>
      )}
    </MessagingSheet>
  );
}
