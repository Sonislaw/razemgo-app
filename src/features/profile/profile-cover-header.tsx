import type { ReactNode } from 'react';
import { Image } from 'expo-image';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, IconButton } from '@/components/ui/primitives';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import type { ProfileAvatarId } from '@/types/avatar';
import { getProfileCover } from './profile-cover-data';

export function ProfileCoverHeader({
  avatarId,
  title,
  onBack,
  actions,
  leadingAction,
}: {
  avatarId?: ProfileAvatarId;
  title: string;
  onBack?: () => void;
  actions?: ReactNode;
  leadingAction?: ReactNode;
}) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'ios' ? 0 : insets.top;
  const cover = getProfileCover(avatarId);
  return (
    <View
      testID="profile-cover-header"
      style={[styles.header, { height: Math.min(360, Math.max(272, width * 0.76)) + topInset }]}
    >
      <View
        pointerEvents="none"
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={StyleSheet.absoluteFill}
      >
        <Image
          testID={'profile-cover-' + cover.avatarId}
          source={cover.source}
          recyclingKey={cover.avatarId}
          cachePolicy="memory-disk"
          contentFit="cover"
          contentPosition="center"
          transition={0}
          style={StyleSheet.absoluteFill}
          accessible={false}
          alt=""
        />
        <Image
          source={require('@/assets/images/profile-covers/header-shade.svg')}
          contentFit="fill"
          style={StyleSheet.absoluteFill}
          accessible={false}
          alt=""
        />
      </View>
      <View style={[
        styles.toolbar,
        {
          paddingTop: topInset + Spacing.three,
          paddingLeft: Math.max(Spacing.four, insets.left),
          paddingRight: Math.max(Spacing.four, insets.right),
        },
      ]}>
        {onBack ? <IconButton icon="back" label="Wróć" onPress={onBack} /> : leadingAction ?? <View style={styles.spacer} />}
        <AppText accessibilityRole="header" variant="heading" style={styles.title}>{title}</AppText>
        {actions ?? <View style={styles.spacer} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { width: '100%', backgroundColor: '#344952', overflow: 'hidden' },
  toolbar: {
    width: '100%',
    maxWidth: MaxContentWidth + Spacing.four * 2,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  spacer: { width: 48, height: 48 },
  title: { flex: 1, minWidth: 0, textAlign: 'center', color: '#FFFFFF', fontSize: 24, lineHeight: 32 },
});
