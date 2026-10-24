import { Linking, View } from 'react-native';
import { AppText, Button, Card, layout } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import { useAuth } from '@/features/auth/auth-context';
import { USE_DEMO_DATA } from '@/constants/app';
import { usePush } from './push-context';

export function PushPermissionCard({compact=false}: {compact?: boolean}) {
  const push=usePush();
  const {session}=useAuth();
  if(USE_DEMO_DATA || !session) return null;
  if(compact && ['enabled','checking','needs-build','unsupported'].includes(push.status)) return null;
  const descriptions={
    checking:'Sprawdzamy powiadomienia na tym urządzeniu.',
    enabled:'Ten telefon może odbierać powiadomienia, również gdy aplikacja jest zamknięta. Rodzaje powiadomień wybierzesz w ustawieniach poniżej.',
    off:'Powiadomienia są wyłączone na tym urządzeniu. Wiadomości i zaproszenia nadal znajdziesz w aplikacji.',
    permission:'Włącz powiadomienia, aby nie przegapić wiadomości ani zaproszenia do wspólnego wyjazdu.',
    denied:'Powiadomienia są zablokowane w ustawieniach telefonu. Możesz tam ponownie je włączyć.',
    'needs-build':'Aby korzystać z powiadomień na telefonie, zainstaluj najnowszą wersję aplikacji.',
    unsupported:'Powiadomienia na telefonie są dostępne w aplikacji Android i iOS.',
    error:'Nie udało się uruchomić powiadomień na tym urządzeniu.',
  };
  return <Card style={{gap:10}}>
    <View style={layout.row}>
      <Icon name="bell" size={22} />
      <AppText variant="label" style={{flex:1}}>Powiadomienia na telefonie</AppText>
      {push.status==='enabled' ? <AppText variant="caption" color="positive">Włączone</AppText> : null}
    </View>
    <AppText variant="caption" color="textSecondary">{descriptions[push.status]}</AppText>
    {push.error ? <AppText variant="caption" accessibilityRole="alert">{push.error}</AppText> : null}
    {push.status==='denied' ? <Button label="Otwórz ustawienia telefonu" variant="secondary" onPress={() => { void Linking.openSettings(); }} />
      : push.status==='enabled' ? <Button label="Wyłącz na tym urządzeniu" variant="secondary" disabled={push.busy} onPress={() => { void push.disable(); }} />
      : ['permission','off','error'].includes(push.status) ? <Button label={push.busy ? 'Proszę czekać…' : 'Włącz powiadomienia'} icon="bell" disabled={push.busy} onPress={() => { void push.synchronize(session.user.id,true); }} /> : null}
  </Card>;
}
