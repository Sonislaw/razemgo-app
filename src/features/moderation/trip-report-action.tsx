import {useRef,useState} from 'react';
import {View} from 'react-native';
import {AppText,Button,Chip,layout} from '@/components/ui/primitives';
import {BottomSheet} from '@/components/ui/bottom-sheet';
import {USE_DEMO_DATA} from '@/constants/app';
import {backendRequest} from '@/lib/backend-request';
import {getSupabase} from '@/lib/supabase';
import {createRequestKey} from '@/lib/request-key';
import type {ReportReason} from '@/types/messaging';
export function TripReportAction({tripId}:{tripId:string}) {
  const [open,setOpen]=useState(false),[reason,setReason]=useState<ReportReason>('Spam');
  const [busy,setBusy]=useState(false),[saved,setSaved]=useState(false),[error,setError]=useState<string|null>(null);
  const key=useRef(createRequestKey()),pending=useRef(false);
  if (USE_DEMO_DATA) return null;
  const submit=async()=>{
    if (pending.current) return;
    pending.current=true;setBusy(true);setError(null);
    try {
      const result=await backendRequest(signal=>getSupabase().rpc('report_trip',{target_trip_id:tripId,report_reason:reason,request_key:key.current}).abortSignal(signal),'trips.report');
      if (result.error) throw result.error;
      setSaved(true);setOpen(false);
    } catch {setError('Nie udało się zapisać zgłoszenia. Spróbuj ponownie.');}
    finally {pending.current=false;setBusy(false);}
  };
  return <View style={{gap:8}}>
    {saved ? <AppText accessibilityLiveRegion="polite" color="positive">Zgłoszenie trafiło do moderacji. Dziękujemy.</AppText> : <Button label="Zgłoś ogłoszenie" icon="flag" variant="secondary" onPress={()=>setOpen(true)} />}
    {open ? <BottomSheet title="Zgłoś ogłoszenie" onClose={()=>{if (!busy) setOpen(false);}}>
      <AppText>Co budzi Twoje obawy?</AppText><View style={layout.wrap}>{(['Spam','Niewłaściwe treści','Podszywanie się','Inny powód'] as const).map(value=><Chip key={value} label={value} selected={reason===value} onPress={()=>setReason(value)} />)}</View>
      <AppText variant="caption" color="textSecondary">Moderacja otrzyma zapis tego ogłoszenia i wybrany powód.</AppText>
      {error ? <AppText accessibilityRole="alert">{error}</AppText> : null}
      <Button label={busy ? 'Zapisywanie…' : 'Wyślij zgłoszenie'} disabled={busy} onPress={()=>void submit()} />
    </BottomSheet> : null}
  </View>;
}
