import { router } from 'expo-router';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { BrandHeader } from '@/components/ui/brand-header';
import { AppText, Screen } from '@/components/ui/primitives';
import { Spacing } from '@/constants/theme';
import { HomeAction } from '@/features/home/home-ui';
import { WelcomeFeaturedListing } from '@/features/welcome/welcome-featured-listing';

export default function WelcomeScreen() {
  const { width } = useWindowDimensions();
  const density = width < 360 ? 'compact' : 'regular';
  const illustrationSize = width < 360 ? 80 : 96;

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
          Kamper, przyczepa, kampervan czy namiot — tu spotkasz ludzi z podobnymi
          planami.
        </AppText>
      </View>

      <View testID="welcome-actions" style={styles.actions}>
        <HomeAction
          label="Nowe konto"
          description="Załóż konto i znajdź towarzystwo na wyjazd."
          illustration={require('@/assets/images/welcome/join-the-crew.png')}
          illustrationSize={illustrationSize}
          density={density}
          orientation="vertical"
          showDescription={false}
          style={styles.action}
          onPress={() => router.push('/auth/sign-up')}
        />
        <HomeAction
          label="Zaloguj się"
          description="Wróć do swojej ekipy i wspólnych planów."
          illustration={require('@/assets/images/welcome/back-to-camp.png')}
          illustrationSize={illustrationSize}
          density={density}
          orientation="vertical"
          showDescription={false}
          style={styles.action}
          variant="secondary"
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
  action: { flex: 1, minWidth: 0 },
});
