import { Image, type ImageContentPosition, type ImageSource } from 'expo-image';
import { StyleSheet, View } from 'react-native';

const artwork: Record<string, { source: ImageSource; position?: ImageContentPosition }> = {
  profile: { source: require('@/assets/images/home/scenic/find-crew-family.webp'), position: 'right center' },
  plans: { source: require('@/assets/images/home/scenic/plan-trip.webp'), position: 'right center' },
  ideas: { source: require('@/assets/images/landscapes/watercolor/coast.jpg') },
  messages: { source: require('@/assets/images/passport/badges/messages.jpg') },
  contacts: { source: require('@/assets/images/home/scenic/find-crew-campfire-caravan.webp'), position: 'right center' },
  trip_favorites: { source: require('@/assets/images/passport/badges/trip_favorites.jpg') },
  group_favorites: { source: require('@/assets/images/welcome/scenic/join-the-crew.webp') },
  trip_reactions: { source: require('@/assets/images/profile-covers/watercolor/meadow-hedgehog.webp') },
  message_reactions: { source: require('@/assets/images/passport/badges/message_reactions.jpg') },
  saved_filters: { source: require('@/assets/images/passport/badges/saved_filters.jpg') },
  active_days: { source: require('@/assets/images/passport/badges/active_days.jpg') },
  destinations: { source: require('@/assets/images/profile-covers/watercolor/road-wolf.webp') },
  campgrounds: { source: require('@/assets/images/passport/badges/campgrounds.jpg') },
  landscapes: { source: require('@/assets/images/landscapes/watercolor/mountain.jpg') },
};

export function PassportBadgeArtwork({ categoryId }: { categoryId: string }) {
  const scene = artwork[categoryId] ?? artwork.landscapes;
  return <View style={StyleSheet.absoluteFill} pointerEvents="none" accessible={false}
    accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Image testID={'passport-badge-artwork-' + categoryId} source={scene.source}
      contentFit="cover" contentPosition={scene.position ?? 'center'} cachePolicy="memory-disk"
      transition={0} style={StyleSheet.absoluteFill} accessible={false} alt="" />
    <Image source={require('@/assets/images/passport/badges/text-shade.svg')} contentFit="fill"
      style={StyleSheet.absoluteFill} accessible={false} alt="" />
  </View>;
}
