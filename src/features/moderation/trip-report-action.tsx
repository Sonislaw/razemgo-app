import { BottomSheet } from '@/components/ui/bottom-sheet';
import { AppText, Button, Chip, layout } from '@/components/ui/primitives';
import { USE_DEMO_DATA } from '@/constants/app';
import { backendRequest } from '@/lib/backend-request';
import { createRequestKey } from '@/lib/request-key';
import { getSupabase } from '@/lib/supabase';
import type { ReportReason } from '@/types/messaging';
import { useRef, useState } from 'react';
import { View } from 'react-native';
export function TripReportAction({ tripId }: { tripId: string }) {
  return <ReportAction targetId={tripId} kind="trip" />;
}
export function GroupReportAction({ groupId }: { groupId: string }) {
  return <ReportAction targetId={groupId} kind="profile" />;
}
function ReportAction({
  targetId,
  kind,
}: {
  targetId: string;
  kind: 'trip' | 'profile';
}) {
  const [open, setOpen] = useState(false),
    [reason, setReason] = useState<ReportReason>('Spam');
  const [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false),
    [error, setError] = useState<string | null>(null);
  const key = useRef(createRequestKey()),
    pending = useRef(false);
  if (USE_DEMO_DATA) return null;
  const submit = async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await backendRequest(
        (signal) =>
          (kind === 'trip'
            ? getSupabase().rpc('report_trip', {
                target_trip_id: targetId,
                report_reason: reason,
                request_key: key.current,
              })
            : getSupabase().rpc('report_profile', {
                target_group_id: targetId,
                report_reason: reason,
                request_key: key.current,
              })
          ).abortSignal(signal),
        kind === 'trip' ? 'trips.report' : 'groups.report',
      );
      if (result.error) throw result.error;
      setSaved(true);
      setOpen(false);
    } catch {
      setError('Nie udało się zapisać zgłoszenia. Spróbuj ponownie.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: 8 }}>
      {saved ? (
        <AppText accessibilityLiveRegion="polite" color="positive">
          Zgłoszenie trafiło do moderacji. Dziękujemy.
        </AppText>
      ) : (
        <Button
          label={kind === 'trip' ? 'Zgłoś ogłoszenie' : 'Zgłoś profil'}
          icon="flag"
          variant="secondary"
          onPress={() => setOpen(true)}
        />
      )}
      {open ? (
        <BottomSheet
          title={kind === 'trip' ? 'Zgłoś ogłoszenie' : 'Zgłoś profil'}
          onClose={() => {
            if (!busy) setOpen(false);
          }}
        >
          <AppText>Co budzi Twoje obawy?</AppText>
          <View style={layout.wrap}>
            {(
              [
                'Spam',
                'Niewłaściwe treści',
                'Podszywanie się',
                'Inny powód',
              ] as const
            ).map((value) => (
              <Chip
                key={value}
                label={value}
                selected={reason === value}
                onPress={() => setReason(value)}
              />
            ))}
          </View>
          <AppText variant="caption" color="textSecondary">
            Moderacja otrzyma zapis{' '}
            {kind === 'trip' ? 'tego ogłoszenia' : 'publicznej części profilu'}{' '}
            i wybrany powód.
          </AppText>
          {error ? <AppText accessibilityRole="alert">{error}</AppText> : null}
          <Button
            label={busy ? 'Zapisywanie…' : 'Wyślij zgłoszenie'}
            disabled={busy}
            onPress={() => void submit()}
          />
        </BottomSheet>
      ) : null}
    </View>
  );
}
