import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { AppText, layout } from '@/components/ui/primitives';
import { Icon, type IconName } from '@/components/ui/icon';
import { CompactTripCard } from '@/components/trips/compact-trip-card';
import { TripThumbnail } from '@/components/trips/trip-thumbnail';
import {
  TripStatusBadge,
  ownTripDates,
  ownTripPlace,
} from '@/features/trips/trip-ui';
import { getTripStatus, todayDate } from '@/features/trips/own-trips-state';
import {
  formatSharedNights,
  formatTripDates,
  getTripLocation,
  type HomeRecommendation,
} from '@/features/discovery/filter-trips';
import type { OwnedTrip } from '@/types/owned-trip';
import { useTheme } from '@/hooks/use-theme';
import { TripAnimalTag } from '@/features/animals/animal-ui';

export function HomeSection({
  title,
  action,
  onAction,
  children,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  children: ReactNode;
}) {
  return (
    <View style={{ gap: 8 }}>
      <View
        style={[
          layout.row,
          { justifyContent: 'space-between', flexWrap: 'wrap' },
        ]}
      >
        <AppText
          variant="heading"
          accessibilityRole="header"
          style={{ fontSize: 18, lineHeight: 24, flex: 1, minWidth: 120 }}
        >
          {title}
        </AppText>
        {action && onAction ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={action}
            onPress={onAction}
            style={[layout.row, { minHeight: 48 }]}
          >
            <AppText variant="label" color="primaryStrong">
              {action}
            </AppText>
            <Icon name="arrow" size={16} />
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}
export function NextTripPreview({
  trip,
  onPress,
}: {
  trip: OwnedTrip;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={'Szczegóły najbliższego wyjazdu: ' + trip.title}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      <CompactTripCard style={{ gap: 12 }}>
        <View style={[layout.row, { alignItems: 'flex-start', gap: 12 }]}>
          <TripThumbnail kind={trip.landscape} size={52} height={64} />
          <View style={{ flex: 1, gap: 4 }}>
            <AppText
              variant="label"
              style={{ fontSize: 17, lineHeight: 22 }}
              numberOfLines={2}
            >
              {trip.title}
            </AppText>
            <AppText variant="caption" color="textSecondary" numberOfLines={2}>
              {ownTripPlace(trip)}
              {trip.mode === 'flexible' ? ' · cel do ustalenia' : ''}
            </AppText>
            <AppText variant="caption" color="textSecondary">
              {ownTripDates(trip)}
            </AppText>
          </View>
        </View>
        <TripAnimalTag animals={trip.animals} />
        <View
          style={[
            layout.row,
            {
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              borderTopWidth: 1,
              borderTopColor: theme.border,
              paddingTop: 8,
            },
          ]}
        >
          <TripStatusBadge status={getTripStatus(trip, todayDate())} />
          <View style={layout.row}>
            <AppText variant="label" color="primaryStrong">
              Szczegóły
            </AppText>
            <Icon name="chevron" size={16} />
          </View>
        </View>
      </CompactTripCard>
    </Pressable>
  );
}
export function RecommendationPreview({
  item,
  onPress,
}: {
  item: HomeRecommendation;
  onPress: () => void;
}) {
  const { trip, group } = item.proposal;
  const theme = useTheme();
  const reason =
    item.source === 'trip'
      ? item.dateShifted
        ? item.nights === 1
          ? 'Do 1 wspólnej nocy'
          : 'Do ' + item.nights + ' wspólnych nocy'
        : formatSharedNights(item.nights)
      : item.source === 'interests'
        ? 'Lubicie: ' + item.commonInterests.slice(0, 2).join(', ')
        : 'Pomysł na wyjazd';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        'Zobacz propozycję: ' + trip.title + ', ' + group.name
      }
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      <CompactTripCard style={{ padding: 12, gap: 8 }}>
        <View style={[layout.row, { alignItems: 'flex-start', gap: 12 }]}>
          <TripThumbnail kind={trip.landscape} size={44} height={48} />
          <View style={{ flex: 1, gap: 2 }}>
            <AppText
              variant="label"
              style={{ fontSize: 16, lineHeight: 22 }}
              numberOfLines={2}
            >
              {trip.title}
            </AppText>
            <AppText variant="caption" color="textSecondary" numberOfLines={1}>
              {group.name}
            </AppText>
            <AppText variant="caption" color="textSecondary" numberOfLines={1}>
              {getTripLocation(trip)}
            </AppText>
            <AppText variant="caption" color="textSecondary">
              {formatTripDates(trip)}
            </AppText>
          </View>
        </View>
        <TripAnimalTag animals={trip.animals} />
        <View
          style={[
            layout.row,
            { justifyContent: 'space-between', flexWrap: 'wrap' },
          ]}
        >
          <View
            style={{
              flexShrink: 1,
              borderRadius: 10,
              backgroundColor:
                item.source === 'inspiration'
                  ? theme.muted
                  : theme.positiveBackground,
              paddingVertical: 4,
              paddingHorizontal: 8,
            }}
          >
            <AppText
              variant="caption"
              color={
                item.source === 'inspiration' ? 'textSecondary' : 'positive'
              }
            >
              {reason}
            </AppText>
          </View>
          <View style={layout.row}>
            <AppText variant="caption" color="primaryStrong">
              Zobacz wyjazd
            </AppText>
            <Icon name="arrow" size={14} />
          </View>
        </View>
      </CompactTripCard>
    </Pressable>
  );
}
export function ActivityPreview({
  title,
  description,
  icon,
  onPress,
}: {
  title: string;
  description: string;
  icon: IconName;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [
        layout.row,
        {
          minHeight: 76,
          padding: 12,
          gap: 12,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: theme.border,
          backgroundColor: theme.muted,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <View
        style={{
          width: 40,
          height: 40,
          backgroundColor: theme.backgroundElement,
          borderRadius: 14,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Icon name={icon} size={22} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="label">{title}</AppText>
        <AppText variant="caption" color="textSecondary" numberOfLines={2}>
          {description}
        </AppText>
      </View>
      <Icon name="chevron" size={18} />
    </Pressable>
  );
}
