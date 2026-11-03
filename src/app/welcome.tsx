import { BrandHeader } from '@/components/ui/brand-header';
import { AppText, Screen } from '@/components/ui/primitives';
import { Spacing } from '@/constants/theme';
import { HomeScenicAction } from '@/features/home/home-scenic-action';
import { WelcomeFeaturedListing } from '@/features/welcome/welcome-featured-listing';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

export default function WelcomeScreen() {
  return (
    <Screen
      testID="welcome-main"
      header={<BrandHeader />}
      footerPlacement="fixed"
    >
      <View style={styles.intro}>
        <AppText variant="heading" accessibilityRole="header">
          Znajdź swoją ekipę w drodze.
        </AppText>
        <AppText color="textSecondary" style={styles.description}>
          Kamper, przyczepa, kampervan czy namiot — tu spotkasz ludzi z
          podobnymi planami.
        </AppText>
      </View>

      <View testID="welcome-actions" style={styles.actions}>
        <HomeScenicAction
          kind="register"
          onPress={() => router.push('/auth/sign-up')}
        />
        <HomeScenicAction
          kind="login"
          onPress={() => router.push('/auth/sign-in')}
        />
      </View>
      <WelcomeFeaturedListing />
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: Spacing.two, paddingTop: Spacing.one },
  description: { fontSize: 15, lineHeight: 22 },
  actions: { flexDirection: 'row', gap: 12, paddingVertical: Spacing.two },
});
