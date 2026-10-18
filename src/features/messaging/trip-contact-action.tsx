import { router } from 'expo-router';
import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { AppText, Button } from '@/components/ui/primitives';
import { Fonts, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { TripProposal } from '@/types/travel';
import { useMessaging } from './messaging-context';
import { getTripContact, MAX_INVITATION_LENGTH } from './messaging-state';
import { MessagingSheet } from './messaging-ui';
import { useDiscovery } from '@/features/discovery/discovery-context';
import { useOwnTrips } from '@/features/trips/own-trips-context';
import { isSearchingTrip, todayDate } from '@/features/trips/own-trips-state';

export function TripContactAction({ proposal }: { proposal: TripProposal }) {
  const { state, dispatch } = useMessaging();
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
  const { trip, group } = proposal;
  const contact = getTripContact(state, group.id, trip.id);
  const openInvitations = (direction: 'received' | 'sent') => {
    dispatch({ type: 'view', view: 'invitations', direction });
    router.dismissTo('/messages');
  };
  return (
    <View style={{ gap: 8 }}>
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
          icon="chat"
          disabled={state.loadStatus !== 'ready' || unavailableSource}
          onPress={() => setComposing(true)}
        />
      )}
      <AppText variant="caption" color="textSecondary">
        {unavailableSource
          ? 'Wyjazd, dla którego szukacie towarzystwa, nie przyjmuje nowych zaproszeń. Zmieńcie jego status albo wyczyśćcie kryteria w Odkrywaj. '
          : ''}
        Zaproszenia i czat działają demonstracyjnie, tylko w bieżącej sesji.
        Kontakt między dorosłymi po akceptacji zaproszenia.
      </AppText>
      {composing ? (
        <MessagingSheet
          title="Zaproś do kontaktu"
          onClose={() => setComposing(false)}
        >
          <AppText variant="label">{group.name}</AppText>
          <AppText variant="caption" color="primaryStrong">
            {trip.title}
          </AppText>
          {ownTrip ? (
            <AppText variant="caption" color="textSecondary">
              Wasz wyjazd: {ownTrip.title}
            </AppText>
          ) : null}
          <AppText
            color="textSecondary"
            style={{ fontSize: 14, lineHeight: 21 }}
          >
            Przedstawcie się i napiszcie, co Was zainteresowało. Dane dzieci z
            profilu nie zostaną dodane do wiadomości.
          </AppText>
          <TextInput
            accessibilityLabel="Treść zaproszenia"
            placeholder="Cześć! Chętnie porozmawiamy o wspólnym wyjeździe…"
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
            {text.length}/{MAX_INVITATION_LENGTH} · zaproszenie demonstracyjne
          </AppText>
          <Button
            label="Wyślij zaproszenie · demo"
            icon="send"
            disabled={
              !text.trim() ||
              state.loadStatus !== 'ready' ||
              unavailableSource ||
              contact.kind !== 'available'
            }
            onPress={() => {
              dispatch({
                type: 'invite',
                groupId: group.id,
                tripId: trip.id,
                ownTripId: ownTrip?.id,
                text,
              });
              setComposing(false);
              setText('');
              router.dismissTo('/messages');
            }}
          />
        </MessagingSheet>
      ) : null}
    </View>
  );
}
