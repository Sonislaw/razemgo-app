import { useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Icon } from '@/components/ui/icon';
import { AppText, Button } from '@/components/ui/primitives';
import { Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { SHARING_ENABLED, SHARING_SCHEME } from './share-config';
import { createShareLink, type SharedKind } from './share-links';
import { copySharedLink } from './copy-link';

export function ShareLinkButton({ kind, targetId, compact = false, translucent = false, disabled = false, label, onPress }: {
  kind: SharedKind;
  targetId: string;
  compact?: boolean;
  translucent?: boolean;
  disabled?: boolean;
  label?: string;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const { fontScale } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  const link = createShareLink(kind, targetId, SHARING_SCHEME);
  if (!SHARING_ENABLED || (!link && !disabled && !onPress)) return null;
  const title = kind === 'trip' ? 'Udostępnij wyjazd' : 'Udostępnij ekipę';
  const circle = compact ? Typography.caption.lineHeight * fontScale + 10 : 44;
  const copy = async () => {
    if (!link || busy) return;
    setBusy(true); setError(false); setCopied(false);
    try {
      await copySharedLink(link);
      setCopied(true);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={label ?? title} accessibilityState={{ disabled }}
      testID={'share-' + kind + '-' + targetId} disabled={disabled}
      onPress={event => { event.stopPropagation(); if (onPress) { onPress(); return; } setCopied(false); setError(false); setOpen(true); }}
      style={({ pressed }) => ({ width: Math.max(44, circle), height: Math.max(44, circle),
        alignItems: compact ? 'flex-end' : 'center', justifyContent: compact ? 'flex-start' : 'center', opacity: pressed || disabled ? 0.65 : 1 })}>
      <View style={{ width: circle, height: circle, borderRadius: circle / 2, alignItems: 'center', justifyContent: 'center',
        backgroundColor: translucent ? theme.backgroundElement + 'CC' : theme.backgroundElement, borderColor: theme.border, borderWidth: 1 }}>
        <Icon name="share" size={compact ? 18 : 22} color={theme.primaryStrong} />
      </View>
    </Pressable>
    {open ? <BottomSheet title={title} onClose={() => { if (!busy) setOpen(false); }}>
      <AppText color="textSecondary">Skopiuj link i wklej go w rozmowie w RazemGo.</AppText>
      <AppText selectable color="textSecondary">{link}</AppText>
      {copied ? <AppText accessibilityRole="alert" color="primaryStrong">Link skopiowany</AppText> : null}
      {error ? <AppText accessibilityRole="alert">Nie udało się skopiować linku. Spróbuj ponownie.</AppText> : null}
      <Button label={busy ? 'Kopiowanie…' : 'Kopiuj link'} icon={copied ? 'check' : 'copy'} disabled={busy} onPress={() => { void copy(); }} />
    </BottomSheet> : null}
  </>;
}
