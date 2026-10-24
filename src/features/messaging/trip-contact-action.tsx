import { getTripHeadline } from '@/features/trips/trip-headline';
import { router } from 'expo-router';
import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { AppText, Button, layout } from '@/components/ui/primitives';
import { Fonts, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { TripProposal } from '@/types/travel';
import { useMessaging } from './messaging-context';
import { getTripContact, MAX_INVITATION_LENGTH } from './messaging-state';
import { MessagingSheet } from './messaging-ui';
import { useDiscovery } from '@/features/discovery/discovery-context';
import { useOwnTrips } from '@/features/trips/own-trips-context';
import { isSearchingTrip, todayDate } from '@/features/trips/own-trips-state';
import { GroupAvatar } from '@/features/profile/group-avatar';
import { createRequestKey } from '@/lib/request-key';
import { DataStatus } from '@/components/ui/data-status';

export function TripContactAction({ proposal }: { proposal: TripProposal }) {
  const { state, dispatch, invite, busy, actionError, error, refresh } = useMessaging();
  const { filters } = useDiscovery();
  const { state: ownTrips } = useOwnTrips();
  const ownTrip = ownTrips.trips.find(
    (item) => item.id === filters.sourceTripId,
  );
  const unavailableSource = Boolean(
    filters.sourceTripId &&
    (!ownTrip || !isSearchingTrip(ownTrip, todayDate())),
  );
  const theme = useTheme();
  const [composing, setComposing] = useState(false);
  const [text, setText] = useState('');
  const [requestKey] = useState(createRequestKey);
  const { trip, group } = proposal;
  const contact = getTripContact(state, group.id, trip.id);
  const openInvitations = (direction: 'received' | 'sent') => {
    dispatch({ type: 'view', view: 'invitations', direction });
    router.dismissTo('/messages');
  };
  return (
    <View style={{ gap: 8 }}>
      <DataStatus label="Wczytywanie kontaktów" status={error ? 'error' : state.loadStatus} error={error} onRetry={() => { void refresh(); }} />
      {contact.kind === 'blocked' ? (
        <>
          <Button label="Ekipa zablokowana" icon="block" disabled />
          <Button
            label="Zarządzaj blokadami"
            variant="secondary"
            onPress={() => router.push('/messaging-safety')}
          />
        </>
      ) : contact.kind === 'conversation' ? (
        <Button
          label="Przejdź do rozmowy"
          icon="chat"
          onPress={() =>
            router.navigate({
              pathname: '/chat/[id]',
              params: { id: contact.conversation.id },
            })
          }
        />
      ) : contact.kind === 'received' ? (
        <Button
          label="Odpowiedz na zaproszenie"
          icon="people"
          onPress={() => openInvitations('received')}
        />
      ) : contact.kind === 'sent' ? (
        <Button
          label="Zobacz wysłane zaproszenie"
          icon="check"
          variant="secondary"
          onPress={() => openInvitations('sent')}
        />
      ) : (
        <Button
          label="Zaproś do kontaktu"
          icon="campfire-chat"
          disabled={state.loadStatus !== 'ready' || unavailableSource}
          onPress={() => setComposing(true)}
        />
      )}
      {unavailableSource ? (
        <AppText variant="caption" color="textSecondary">
          Wyjazd, dla którego szukasz towarzystwa, nie przyjmuje nowych zaproszeń.
          Zmień jego status albo wyczyść kryteria w Odkrywaj.
        </AppText>
      ) : null}
      {composing ? (
        <MessagingSheet
          title="Zaproś do kontaktu"
          onClose={() => { if (!busy) setComposing(false); }}
        >
          <View style={layout.row}>
            <GroupAvatar groupId={group.id} avatarId={group.avatarId} size={40} />
            <AppText variant="label" style={{ flex: 1 }}>
              {group.name}
            </AppText>
          </View>
          <AppText variant="caption" color="primaryStrong">
            {getTripHeadline(trip)}
          </AppText>
          {ownTrip ? (
            <AppText variant="caption" color="textSecondary">
              Twój wyjazd: {getTripHeadline(ownTrip)}
            </AppText>
          ) : null}
          <AppText
            color="textSecondary"
            style={{ fontSize: 14, lineHeight: 21 }}
          >
            Przedstaw się i napisz, co Cię zainteresowało. Dane dzieci z
            profilu nie zostaną dodane do wiadomości.
          </AppText>
          <TextInput
            accessibilityLabel="Treść zaproszenia"
            placeholder="Cześć! Chętnie porozmawiam o wspólnym wyjeździe…"
            placeholderTextColor={theme.textSecondary}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={MAX_INVITATION_LENGTH}
            style={{
              minHeight: 128,
              maxHeight: 220,
              textAlignVertical: 'top',
              borderWidth: 1,
              borderColor: theme.border,
              backgroundColor: theme.background,
              color: theme.text,
              borderRadius: 12,
              padding: 12,
              fontFamily: Fonts.sans,
              ...Typography.body,
            }}
          />
          <AppText variant="caption" color="textSecondary">
            {text.length}/{MAX_INVITATION_LENGTH}
          </AppText>
          {actionError ? <AppText accessibilityRole="alert" color="textSecondary">{actionError}</AppText> : null}
          <Button
            label={busy ? 'Wysyłanie…' : 'Wyślij zaproszenie'}
            icon="send"
            disabled={
              !text.trim() ||
              busy ||
              state.loadStatus !== 'ready' ||
              unavailableSource ||
              (contact.kind !== 'available' && contact.kind !== 'sent')
            }
            onPress={async () => {
              if (await invite(trip.id, text, requestKey, ownTrip?.id)) {
                setComposing(false);
                setText('');
                router.dismissTo('/messages');
              }
            }}
          />
        </MessagingSheet>
      ) : null}
    </View>
  );
}
