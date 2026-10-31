import { Landscape } from '@/components/trips/landscape';
import { TripMapCard } from '@/components/trips/trip-map-card';
import { TripPlanningIcon } from '@/components/trips/trip-planning-icon';
import { TripTimeline } from '@/components/trips/trip-timeline';
import { DataStatus } from '@/components/ui/data-status';
import {
  AppText,
  Button,
  Card,
  Chip,
  layout,
  Screen,
} from '@/components/ui/primitives';
import { DEMO_OWN_TRIPS } from '@/data/mocks/owned-trips';
import { AnimalInformation } from '@/features/animals/animal-ui';
import { useDiscovery } from '@/features/discovery/discovery-context';
import { INITIAL_FILTERS } from '@/features/discovery/filter-trips';
import { useTripResultCount } from '@/features/discovery/use-trip-search';
import { useMessaging } from '@/features/messaging/messaging-context';
import { isConversationAccepted } from '@/features/messaging/messaging-state';
import { GroupAvatar } from '@/features/messaging/messaging-ui';
import { useTripContactCounts } from '@/features/messaging/use-trip-contact-counts';
import { useAccountAccess } from '@/features/moderation/account-access-context';
import { useProfile } from '@/features/profile/profile-context';
import { TravelModeBadges } from '@/features/profile/travel-mode-ui';
import { TripReactionsButton } from '@/features/reactions/trip-reactions';
import { useOwnTrips } from '@/features/trips/own-trips-context';
import {
  discoveryFiltersForTrip,
  getTripStatus,
  isSearchingTrip,
  todayDate,
} from '@/features/trips/own-trips-state';
import { TripActions } from '@/features/trips/trip-actions';
import { getTripHeadline } from '@/features/trips/trip-headline';
import {
  ownTripDates,
  ownTripPlace,
  TripDemoNote,
  TripPageHeader,
  TripStatusBadge,
} from '@/features/trips/trip-ui';
import { useOwnTrip } from '@/features/trips/use-own-trip';
import { useTheme } from '@/hooks/use-theme';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

export function generateStaticParams() {
  return DEMO_OWN_TRIPS.map((trip) => ({ id: trip.id }));
}

export default function OwnTripDetailsScreen() {
  const { hidden_trip_ids } = useAccountAccess();
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    status: loadStatus,
    error: loadError,
    refresh,
    hasLoaded,
  } = useOwnTrips();
  const { profile } = useProfile();
  const {
    state: messaging,
    dispatch: dispatchMessaging,
    contact,
    refresh: refreshMailbox,
    loadMoreMailbox,
  } = useMessaging();
  const {
    counts: contactCounts,
    error: contactError,
    retry: retryContacts,
  } = useTripContactCounts(id);
  useFocusEffect(
    useCallback(() => {
      void refreshMailbox();
    }, [refreshMailbox]),
  );
  const { setFilters } = useDiscovery();
  const theme = useTheme();
  const [menu, setMenu] = useState(false);
  const details = useOwnTrip(id);
  const trip = details.trip;
  const canSearch =
    !!trip &&
    !hidden_trip_ids.includes(trip.id) &&
    isSearchingTrip(trip, todayDate());
  const {
    count: proposalCount,
    countError,
    retryCount,
  } = useTripResultCount(
    trip ? discoveryFiltersForTrip(trip) : INITIAL_FILTERS,
    canSearch,
  );
  const back = () => router.dismissTo('/trips');
  if (!hasLoaded || details.status !== 'ready')
    return (
      <Screen>
        <TripPageHeader title="Twój wyjazd" onBack={back} />
        <DataStatus
          status={details.status !== 'ready' ? details.status : loadStatus}
          error={details.error ?? loadError}
          onRetry={() => {
            details.retry();
            void refresh();
          }}
        />
      </Screen>
    );
  if (!trip)
    return (
      <Screen>
        <TripPageHeader title="Twój wyjazd" onBack={back} />
        <AppText variant="heading" accessibilityRole="header">
          Ten wyjazd nie jest dostępny
        </AppText>
        <AppText color="textSecondary">
          Mógł zostać usunięty. Wróć do listy swoich wyjazdów.
        </AppText>
        <Button label="Wróć do wyjazdów" onPress={back} />
      </Screen>
    );
  const status = getTripStatus(trip, todayDate());
  const hidden = hidden_trip_ids.includes(trip.id);
  const searching = !hidden && isSearchingTrip(trip, todayDate());
  const discoveryFilters = discoveryFiltersForTrip(trip);
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
      <Screen
        onNearEnd={() => {
          void loadMoreMailbox();
        }}
      >
        <View style={{ gap: 16 }}>
          <TripPageHeader
            title="Twój wyjazd"
            onBack={back}
            onMenu={() => setMenu(true)}
          />
          {contactError ? (
            <DataStatus
              status="error"
              error={contactError}
              onRetry={retryContacts}
            />
          ) : null}
          <DataStatus
            status={loadStatus}
            error={loadError}
            onRetry={() => {
              void refresh();
            }}
          />
          {hidden ? (
            <Card>
              <AppText variant="heading">
                Ogłoszenie ukryte przez moderację
              </AppText>
              <AppText color="textSecondary">
                Plan pozostaje na Twojej liście. Edycja nie przywróci
                widoczności w Odkrywaj — wymaga to decyzji moderatora.
              </AppText>
            </Card>
          ) : null}
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
              <TripPlanningIcon kind={trip.mode} size={24} framed={false} />
              <AppText style={{ flex: 1 }}>{ownTripPlace(trip)}</AppText>
            </View>
            {trip.mode === 'planned' && trip.campgroundName ? (
              <AppText>Kemping: {trip.campgroundName}</AppText>
            ) : null}
            {trip.mode === 'planned' && trip.campgroundAddress ? (
              <AppText>{trip.campgroundAddress}</AppText>
            ) : null}
            <View style={layout.row}>
              <TripPlanningIcon kind="dates" size={24} framed={false} />
              <AppText style={{ flex: 1 }}>{ownTripDates(trip)}</AppText>
            </View>
            <TripTimeline trip={trip} />
          </View>
          <TripMapCard trip={trip} />
          <Card>
            <View style={layout.row}>
              <GroupAvatar groupId={trip.groupId} size={56} />
              <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                <AppText variant="caption" color="textSecondary">
                  Organizator wyjazdu
                </AppText>
                <AppText variant="heading">{profile.group.name}</AppText>
              </View>
            </View>
          </Card>
          <Card style={{ gap: 12 }}>
            <AppText variant="heading" accessibilityRole="header">
              O wyjeździe
            </AppText>
            <AppText color="textSecondary">
              {trip.description ||
                'Jeszcze bez opisu. Możesz uzupełnić go w edycji.'}
            </AppText>
            <TripReactionsButton
              tripId={trip.id}
              ownerGroupId={trip.groupId}
              compact
            />
            {trip.travelModes.length ? (
              <TravelModeBadges modes={trip.travelModes} />
            ) : (
              <AppText variant="label">
                Sposób podróżowania do uzupełnienia
              </AppText>
            )}
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
                  value: searching ? (proposalCount ?? '—') : '—',
                },
                {
                  label: 'Zaproszenia',
                  value: contactCounts?.pending ?? pending.length,
                },
                {
                  label: 'Kontakty',
                  value: contactCounts?.contacts ?? acceptedGroups.length,
                },
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
              Propozycje dobieramy według regionu, wspólnych nocy i wybranego
              towarzystwa. Zaproszenia i kontakty dotyczą wyłącznie tego
              wyjazdu.
            </AppText>
            {countError ? (
              <>
                <AppText variant="caption" accessibilityRole="alert">
                  Nie udało się sprawdzić liczby propozycji.
                </AppText>
                <Button
                  label="Policz propozycje ponownie"
                  variant="secondary"
                  onPress={retryCount}
                />
              </>
            ) : null}
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
                    ? 'Poszukiwania są wstrzymane. Możesz je wznowić z menu wyjazdu.'
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
              Kontakty tego wyjazdu · {acceptedGroups.length}
            </AppText>
            {acceptedGroups.length ? (
              acceptedGroups.map((conversation) => (
                <View key={conversation.id} style={{ gap: 8 }}>
                  <View style={layout.row}>
                    <GroupAvatar
                      groupId={conversation.groupId}
                      avatarId={contact(conversation.groupId)?.avatarId}
                      size={40}
                    />
                    <AppText variant="label" style={{ flex: 1 }}>
                      {contact(conversation.groupId)?.name ?? 'Ekipa'}
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
                Po zaakceptowaniu zaproszenia powiązanego z tym wyjazdem
                zobaczysz tutaj kontakt do rozmowy. Akceptacja zaproszenia nie
                oznacza potwierdzenia wspólnego wyjazdu.
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
