import { BottomSheet } from '@/components/ui/bottom-sheet';
import { AppText, Button, Chip, IconButton, layout } from '@/components/ui/primitives';
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
type GroupBlockAction = {
  busy: boolean;
  error: string | null;
  onConfirm: () => Promise<void>;
};
export function GroupReportAction({ groupId, blockAction }: {
  groupId: string;
  blockAction: GroupBlockAction;
}) {
  return <ReportAction targetId={groupId} kind="profile" blockAction={blockAction} />;
}
function ReportAction({
  targetId,
  kind,
  blockAction,
}: {
  targetId: string;
  kind: 'trip' | 'profile';
  blockAction?: GroupBlockAction;
}) {
  const [panel, setPanel] = useState<'menu' | 'report' | 'block' | null>(null),
    [reason, setReason] = useState<ReportReason>('Spam');
  const [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false),
    [error, setError] = useState<string | null>(null);
  const key = useRef(createRequestKey()),
    pending = useRef(false);
  const menuTitle = kind === 'trip' ? 'Opcje wyjazdu' : 'Opcje profilu';
  const reportTitle = kind === 'trip' ? 'Zgłoś ogłoszenie' : 'Zgłoś profil';
  if (USE_DEMO_DATA && !blockAction) return null;
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
      setPanel('menu');
    } catch {
      setError('Nie udało się zapisać zgłoszenia. Spróbuj ponownie.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <>
      <IconButton label={menuTitle} icon="more" onPress={() => setPanel('menu')} />
      {panel ? (
        <BottomSheet
          title={panel === 'report' ? reportTitle : panel === 'block' ? 'Zablokować ekipę?' : menuTitle}
          onClose={() => {
            if (!busy && !(panel === 'block' && blockAction?.busy)) setPanel(null);
          }}
        >
          {panel === 'menu' && saved ? (
            <AppText accessibilityLiveRegion="polite" color="positive">
              Zgłoszenie trafiło do moderacji. Dziękujemy.
            </AppText>
          ) : null}
          {panel === 'menu' && !saved && !USE_DEMO_DATA ? (
            <Button
              label={reportTitle}
              icon="flag"
              variant="secondary"
              onPress={() => {
                setError(null);
                setPanel('report');
              }}
            />
          ) : null}
          {panel === 'menu' && blockAction ? (
            <Button
              label="Zablokuj ekipę"
              icon="block"
              variant="secondary"
              onPress={() => setPanel('block')}
            />
          ) : null}
          {panel === 'block' && blockAction ? (
            <>
              <AppText>Ekipa zniknie z Twoich propozycji i wyszukiwania. Obie strony stracą możliwość wysyłania wiadomości. Blokadę możesz usunąć w ustawieniach bezpieczeństwa.</AppText>
              {blockAction.error ? <AppText accessibilityRole="alert">{blockAction.error}</AppText> : null}
              <Button
                label={blockAction.busy ? 'Blokowanie…' : 'Zablokuj ekipę'}
                disabled={blockAction.busy}
                onPress={() => void blockAction.onConfirm()}
              />
            </>
          ) : null}
          {panel === 'report' ? (
            <>
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
            </>
          ) : null}
        </BottomSheet>
      ) : null}
    </>
  );
}
