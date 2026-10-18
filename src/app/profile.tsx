import { StyleSheet, View } from 'react-native';
import {
  AppText,
  Card,
  Chip,
  Header,
  Screen,
  SectionTitle,
  layout,
} from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import { MY_GROUP } from '@/data/mocks/travel';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function ProfileScreen() {
  const theme = useTheme();
  return (
    <Screen>
      <Header
        title="Wasza podróżnicza ekipa."
        subtitle="To, co lubicie, pomaga znaleźć wspólne tematy i kierunki."
        brand
      />
      <Card style={styles.identity}>
        <View style={[styles.avatar, { backgroundColor: theme.hero }]}>
          <Icon name="people" size={42} />
        </View>
        <AppText variant="heading" style={styles.center}>
          {MY_GROUP.name}
        </AppText>
        <AppText color="textSecondary" style={styles.center}>
          2 dorosłych · 2 dzieci
        </AppText>
        <View style={layout.row}>
          <Icon name="pin" size={18} />
          <AppText
            variant="label"
            color="textSecondary"
            style={{ flexShrink: 1 }}
          >
            {MY_GROUP.homeLocation}
          </AppText>
        </View>
        <AppText variant="caption" color="textSecondary" style={styles.center}>
          Fikcyjny profil pokazujący możliwości RazemGo.
        </AppText>
      </Card>
      <Card>
        <SectionTitle
          title="Najmłodsi podróżnicy"
          detail="Przybliżone przedziały wieku"
        />
        <View style={layout.wrap}>
          {MY_GROUP.childAgeBands.map((band) => (
            <Chip key={band} label={band + ' lat'} />
          ))}
        </View>
        <AppText variant="caption" color="textSecondary">
          Do poznania towarzystwa wystarczy przedział wieku. Dzieci nie mają
          własnych profili.
        </AppText>
      </Card>
      <Card>
        <SectionTitle title="Jak podróżujecie?" />
        <View style={layout.wrap}>
          {MY_GROUP.travelModes.map((mode) => (
            <Chip key={mode} label={mode} />
          ))}
        </View>
      </Card>
      <Card>
        <SectionTitle
          title="To Wasz klimat"
          detail="Pomysły na wspólnie spędzony czas"
        />
        <View style={layout.wrap}>
          {MY_GROUP.interests.map((interest) => (
            <Chip key={interest} label={interest} />
          ))}
        </View>
      </Card>
      <AppText variant="caption" color="textSecondary" style={styles.center}>
        Edycja profilu · Wkrótce{'\n'}RazemGo · miejsca łączą, ludzie zostają.
      </AppText>
    </Screen>
  );
}
const styles = StyleSheet.create({
  identity: { alignItems: 'center', paddingVertical: Spacing.four },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: Radius.hero,
    justifyContent: 'center',
    alignItems: 'center',
  },
  center: { textAlign: 'center' },
});
