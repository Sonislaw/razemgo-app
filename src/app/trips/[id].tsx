import { getTripHeadline } from '@/features/trips/trip-headline';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import {
  AppText,
  Button,
  Card,
  Chip,
  Screen,
  layout,
} from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import { Landscape } from '@/components/trips/landscape';
import { DEMO_OWN_TRIPS } from '@/data/mocks/owned-trips';
import { DEMO_GROUPS, DEMO_PROPOSALS } from '@/data/mocks/travel';
import { useTheme } from '@/hooks/use-theme';
import { useOwnTrips } from '@/features/trips/own-trips-context';
import {
  discoveryFiltersForTrip,
  getTripStatus,
  isSearchingTrip,
  todayDate,
} from '@/features/trips/own-trips-state';
import {
  ownTripDates,
  ownTripPlace,
  TripDemoNote,
  TripPageHeader,
  TripStatusBadge,
} from '@/features/trips/trip-ui';
import { TripActions } from '@/features/trips/trip-actions';
import { useDiscovery } from '@/features/discovery/discovery-context';
import { filterProposals } from '@/features/discovery/filter-trips';
import { useMessaging } from '@/features/messaging/messaging-context';
import { isConversationAccepted } from '@/features/messaging/messaging-state';
import { GroupAvatar } from '@/features/messaging/messaging-ui';
import { GROUP_KIND_OPTIONS } from '@/features/profile/profile-options';
import { AnimalInformation } from '@/features/animals/animal-ui';

export function generateStaticParams() {
  return DEMO_OWN_TRIPS.map((trip) => ({ id: trip.id }));
}

export default function OwnTripDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useOwnTrips();
  const { state: messaging, dispatch: dispatchMessaging } = useMessaging();
  const { setFilters } = useDiscovery();
  const theme = useTheme();
  const [menu, setMenu] = useState(false);
  const trip = state.trips.find((item) => item.id === id);
  const back = () => router.dismissTo('/trips');
  if (!trip)
    return (
      <Screen>
        <TripPageHeader title="Wasz wyjazd" onBack={back} />
        <AppText variant="heading" accessibilityRole="header">
          Ten wyjazd nie jest dostępny
        </AppText>
        <AppText color="textSecondary">
          Mógł zostać usunięty albo pochodzi z poprzedniej sesji
          demonstracyjnej.
        </AppText>
        <Button label="Wróć do wyjazdów" onPress={back} />
      </Screen>
    );
  const status = getTripStatus(trip, todayDate());
  const searching = isSearchingTrip(trip, todayDate());
  const discoveryFilters = discoveryFiltersForTrip(trip);
  const proposals = searching
    ? filterProposals(DEMO_PROPOSALS, discoveryFilters)
    : [];
  const invitations = messaging.invitations.filter(
    (item) =>
      item.ownTripId === trip.id &&
      !messaging.blockedGroupIds.includes(item.groupId),
  );
  const pending = invitations.filter((item) => item.status === 'pending');
  const conversations = messaging.conversations.filter(
    (item) =>
      invitations.some((invitation) => invitation.id === item.invitationId) &&
      isConversationAccepted(messaging, item),
  );
  const acceptedGroups = [
    ...new Map(
      conversations.map((conversation) => [conversation.groupId, conversation]),
    ).values(),
  ];
  const openInvites = () => {
    dispatchMessaging({
      type: 'view',
      view: 'invitations',
      direction: pending.some((item) => item.direction === 'received')
        ? 'received'
        : 'sent',
    });
    router.navigate('/messages');
  };
  return (
    <>
      <Screen>
        <View style={{ gap: 16 }}>
          <TripPageHeader
            title="Wasz wyjazd"
            onBack={back}
            onMenu={() => setMenu(true)}
          />
          <View style={{ borderRadius: 20, overflow: 'hidden' }}>
            <Landscape kind={trip.landscape} />
          </View>
          <View style={{ gap: 12 }}>
            <TripStatusBadge status={status} />
            <AppText
              accessibilityRole="header"
              variant="title"
              style={{ fontSize: 26, lineHeight: 32 }}
            >
              {getTripHeadline(trip)}
            </AppText>
            <AppText variant="caption" color="primaryStrong">
              {trip.mode === 'planned'
                ? 'Mam plan · konkretny cel'
                : 'Szukam pomysłu · cel do ustalenia'}
              {trip.visibility === 'private' ? ' · plan prywatny' : ''}
            </AppText>
            <View style={layout.row}>
              <Icon name="pin" size={20} />
              <AppText style={{ flex: 1 }}>{ownTripPlace(trip)}</AppText>
            </View>
            {trip.mode === 'planned' && trip.campgroundName ? (
              <AppText>Kemping: {trip.campgroundName}</AppText>
            ) : null}
            <View style={layout.row}>
              <Icon name="calendar" size={20} />
              <AppText style={{ flex: 1 }}>{ownTripDates(trip)}</AppText>
            </View>
          </View>
          <Card style={{ gap: 12 }}>
            <AppText variant="heading" accessibilityRole="header">
              O wyjeździe
            </AppText>
            <AppText color="textSecondary">
              {trip.description ||
                'Jeszcze bez opisu. Możecie uzupełnić go w edycji.'}
            </AppText>
            <AppText variant="label">
              {trip.travelModes.join(', ') ||
                'Sposób podróżowania do uzupełnienia'}
            </AppText>
            {trip.interests.length ? (
              <View style={layout.wrap}>
                {trip.interests.map((value) => (
                  <Chip key={value} label={value} />
                ))}
              </View>
            ) : null}
          </Card>
          <Card>
            <AnimalInformation animals={trip.animals} />
          </Card>
          <Card style={{ gap: 12 }}>
            <AppText variant="heading" accessibilityRole="header">
              Towarzystwo na wyjazd
            </AppText>
            <AppText variant="label">
              {GROUP_KIND_OPTIONS.filter((option) =>
                trip.matching.groupKinds.includes(option.value),
              )
                .map((option) => option.label)
                .join(', ') || 'Dowolne towarzystwo'}
            </AppText>
            {trip.matching.childAgeBands.length ? (
              <AppText variant="caption" color="textSecondary">
                Preferowany wiek dzieci:{' '}
                {trip.matching.childAgeBands.join(', ')} lat
              </AppText>
            ) : null}
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: 12,
                paddingVertical: 8,
              }}
            >
              {[
                {
                  label: 'Propozycje',
                  value: searching ? proposals.length : '—',
                },
                { label: 'Zaproszenia', value: pending.length },
                { label: 'Ekipy', value: acceptedGroups.length },
              ].map((item) => (
                <View
                  key={item.label}
                  style={{
                    flex: 1,
                    minWidth: 70,
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <AppText variant="heading" color="primaryStrong">
                    {item.value}
                  </AppText>
                  <AppText variant="caption" color="textSecondary">
                    {item.label}
                  </AppText>
                </View>
              ))}
            </View>
            <AppText variant="caption" color="textSecondary">
              Propozycje liczymy z sześciu przykładowych planów według regionu,
              wspólnych nocy i wybranego towarzystwa. Zaproszenia i ekipy
              dotyczą wyłącznie tego wyjazdu.
            </AppText>
            <Button
              label="Znajdź towarzystwo"
              icon="people"
              disabled={!searching}
              onPress={() => {
                setFilters(discoveryFilters);
                router.navigate('/explore');
              }}
            />
            {!searching ? (
              <AppText variant="caption" color="textSecondary">
                {status === 'draft'
                  ? 'Dokończ szkic i opublikuj plan, aby szukać towarzystwa.'
                  : status === 'paused'
                    ? 'Poszukiwania są wstrzymane. Możecie je wznowić z menu wyjazdu.'
                    : 'Ten wyjazd jest w archiwum i nie przyjmuje nowych zaproszeń.'}
              </AppText>
            ) : null}
            {pending.length ? (
              <Button
                label={'Zobacz zaproszenia · ' + pending.length}
                variant="secondary"
                onPress={openInvites}
              />
            ) : null}
          </Card>
          <Card style={{ gap: 12, backgroundColor: theme.positiveBackground }}>
            <AppText variant="label" accessibilityRole="header">
              Zaakceptowane ekipy · {acceptedGroups.length}
            </AppText>
            {acceptedGroups.length ? (
              acceptedGroups.map((conversation) => (
                <View key={conversation.id} style={{ gap: 8 }}>
                  <View style={layout.row}>
                    <GroupAvatar groupId={conversation.groupId} size={40} />
                    <AppText variant="label" style={{ flex: 1 }}>
                      {DEMO_GROUPS.find(
                        (group) => group.id === conversation.groupId,
                      )?.name ?? 'Przykładowa ekipa'}
                    </AppText>
                  </View>
                  <Button
                    label="Przejdź do rozmowy"
                    icon="chat"
                    variant="secondary"
                    onPress={() =>
                      router.push({
                        pathname: '/chat/[id]',
                        params: { id: conversation.id },
                      })
                    }
                  />
                </View>
              ))
            ) : (
              <AppText
                color="textSecondary"
                style={{ fontSize: 14, lineHeight: 21 }}
              >
                Jeszcze nie umówiliście się z żadną ekipą. Po zaakceptowaniu
                zaproszenia powiązanego z tym planem pojawi się ona tutaj.
              </AppText>
            )}
          </Card>
          <Button
            label={status === 'draft' ? 'Dokończ szkic' : 'Edytuj wyjazd'}
            icon="edit"
            variant="secondary"
            onPress={() =>
              router.push({ pathname: '/trip-editor', params: { id: trip.id } })
            }
          />
          <TripDemoNote />
        </View>
      </Screen>
      {menu ? (
        <TripActions
          trip={trip}
          onClose={() => setMenu(false)}
          onDeleted={back}
        />
      ) : null}
    </>
  );
}
