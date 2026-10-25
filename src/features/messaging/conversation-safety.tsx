import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { AppText, Button, Chip, layout } from '@/components/ui/primitives';
import type { Conversation, ReportReason } from '@/types/messaging';
import { useMessaging } from './messaging-context';
import { MessagingSheet } from './messaging-ui';
import { createRequestKey } from '@/lib/request-key';
import { crewNumberText } from '@/features/profile/crew-number';

export function ConversationSafety({
  conversation,
  onClose,
  onReport,
}: {
  conversation: Conversation;
  onClose: () => void;
  onReport: () => void;
}) {
  const { state, contact, setBlock, report, busy, actionError } = useMessaging();
  const group = contact(conversation.groupId);
  const [requestKey] = useState(createRequestKey);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState<ReportReason>('Spam');
  const blocked = state.blockedGroupIds.includes(conversation.groupId);
  return (
    <MessagingSheet
      title={reporting ? 'Zgłoś konto' : 'Bezpieczna rozmowa'}
      onClose={() => { if (!busy) onClose(); }}
    >
      {group ? <View style={{ gap: 4 }}><AppText variant="label">{group.name}</AppText>
        {crewNumberText(group.crewNumber) ? <AppText variant="caption" color="textSecondary">{crewNumberText(group.crewNumber)}</AppText> : null}
      </View> : null}
      {reporting ? (
        <>
          <AppText variant="label">Co budzi Twoje obawy?</AppText>
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
            disabled={busy}
            onPress={async () => {
              if (await report(conversation.id, reason, requestKey)) {
                onReport();
                onClose();
              }
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
            disabled={busy}
            onPress={async () => {
              if (await setBlock(conversation.groupId, !blocked)) onClose();
            }}
          />
          <AppText variant="caption" color="textSecondary">
            Blokada wstrzymuje rozmowę i nowe zaproszenia tej ekipy.
            Możesz ją cofnąć w dowolnej chwili.
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
      {actionError ? <AppText accessibilityRole="alert" color="textSecondary">{actionError}</AppText> : null}
    </MessagingSheet>
  );
}
