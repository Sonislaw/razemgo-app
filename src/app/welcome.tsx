import { router } from 'expo-router';
import { Image } from 'expo-image';
import { View } from 'react-native';
import {
  AppText,
  Button,
  DemoBadge,
  Screen,
  layout,
} from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import { useProfile } from '@/features/profile/profile-context';
import { useTheme } from '@/hooks/use-theme';

export default function WelcomeScreen() {
  const theme = useTheme();
  const { hasProfile } = useProfile();
  return (
    <Screen>
      <View style={[layout.row, { paddingVertical: 8 }]}>
        <Image
          source={require('@/assets/images/zgrana-symbol.svg')}
          style={{ width: 40, height: 40 }}
          contentFit="contain"
          accessible={false}
        />
        <AppText variant="heading" color="brand">
          RazemGo
        </AppText>
      </View>
      <View
        style={{
          borderRadius: 28,
          backgroundColor: theme.hero,
          padding: 24,
          gap: 16,
        }}
      >
        <Icon name="sun" size={30} color={theme.energy} />
        <AppText variant="title" accessibilityRole="header">
          Wasz kierunek.{'\n'}Wasze towarzystwo.
        </AppText>
        <AppText color="heroMuted">
          Nad morze, pod namiot, a może gdzieś zupełnie indziej? Poznajcie
          ludzi, z którymi będzie Wam po drodze.
        </AppText>
      </View>
      <View style={{ gap: 16 }}>
        {(
          [
            {
              icon: 'people',
              text: 'Pokażcie, kim jesteście i jak podróżujecie.',
            },
            {
              icon: 'trips',
              text: 'Zapiszcie konkretny cel albo wolny termin.',
            },
            { icon: 'chat', text: 'Poznajcie się po akceptacji zaproszenia.' },
          ] as const
        ).map((item) => (
          <View key={item.icon} style={layout.row}>
            <Icon name={item.icon} />
            <AppText style={{ flex: 1 }}>{item.text}</AppText>
          </View>
        ))}
      </View>
      <View style={{ gap: 8 }}>
        <Button
          label={hasProfile ? 'Przejdź na Start' : 'Utwórz profil ekipy'}
          icon={hasProfile ? 'arrow' : 'people'}
          onPress={() =>
            hasProfile
              ? router.dismissTo('/')
              : router.replace({
                  pathname: '/edit-profile',
                  params: { from: 'home' },
                })
          }
        />
        {!hasProfile ? (
          <Button
            label="Rozejrzyj się"
            variant="secondary"
            onPress={() => router.dismissTo('/')}
          />
        ) : null}
      </View>
      <DemoBadge />
    </Screen>
  );
}
