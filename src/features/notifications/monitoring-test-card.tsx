import { useState } from 'react';
import { AppText, Button, Card } from '@/components/ui/primitives';
import { monitoringEnabled, sendMonitoringTest } from '@/lib/monitoring';

export function MonitoringTestCard() {
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  if (!__DEV__ || process.env.EXPO_PUBLIC_MONITORING_IN_DEV!=='true') return null;
  const send=async()=>{
    setBusy(true);setMessage('');
    try {
      const id=await sendMonitoringTest();
      setMessage(id ? 'Sprawdź w Sentry zdarzenie: '+id : 'Najpierw skonfiguruj publiczny DSN i zrestartuj Metro.');
    } catch { setMessage('Nie udało się przygotować raportu testowego.'); }
    finally { setBusy(false); }
  };
  return <Card style={{gap:12}}>
    <AppText variant="label">Diagnostyka deweloperska</AppText>
    <AppText variant="caption">Raport testowy nie zawiera danych konta. Jego odbiór potwierdź w panelu Sentry.</AppText>
    <Button label={busy ? 'Przygotowywanie raportu…' : 'Wyślij raport testowy'} disabled={busy || !monitoringEnabled()} variant="secondary" onPress={()=>{void send();}} />
    {message ? <AppText variant="caption" accessibilityLiveRegion="polite">{message}</AppText> : null}
  </Card>;
}
