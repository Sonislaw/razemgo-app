import { BottomSheet } from '@/components/ui/bottom-sheet';
import { AppText, Button } from '@/components/ui/primitives';
import { useTheme } from '@/hooks/use-theme';
import type { ChatMessage } from '@/types/messaging';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  MESSAGE_REACTIONS,
  messageReactionOption,
  type MessageReactionKind,
} from './message-reactions-data';
import { useMessaging, useMessagingSelector } from './messaging-context';
import { canSendToConversation } from './messaging-state';

export function MessageReactionButton({
  message,
  disabled,
  onPress,
}: {
  message: ChatMessage;
  disabled: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const { fontScale } = useWindowDimensions();
  const reaction = useMessagingSelector(
    (value) => value.messageReactions[message.id],
  );
  const option = messageReactionOption(reaction);
  // The message wrapper reserves the overhang even without a reaction. Keeping
  // the badge beside the bubble also makes its lower half touchable on Android.
  if (!option) return null;
  const scale = Math.max(1, fontScale);
  const frame = {
    position: 'absolute' as const,
    bottom: 0,
    right: 10,
    zIndex: 1,
    width: 34 * scale,
    height: 26 * scale,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.backgroundElement,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };
  if (message.sender === 'self')
    return (
      <View
        style={frame}
        accessible
        accessibilityLabel={'Reakcja rozmówcy: ' + option.label}
      >
        <AppText aria-hidden style={{ fontSize: 16, lineHeight: 20 }}>
          {option.emoji}
        </AppText>
      </View>
    );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={'Zmień reakcję: ' + option.label}
      accessibilityState={{ disabled, selected: !!option }}
      disabled={disabled}
      hitSlop={10}
      onPress={onPress}
      style={({ pressed }) => [
        frame,
        { opacity: disabled || pressed ? 0.5 : 1 },
      ]}
    >
      <AppText
        aria-hidden
        style={{ fontSize: 16, lineHeight: 20, color: theme.primaryStrong }}
      >
        {option.emoji}
      </AppText>
    </Pressable>
  );
}

export function MessageReactionPicker({
  message,
  onClose,
}: {
  message: ChatMessage;
  onClose: () => void;
}) {
  const theme = useTheme();
  const {
    state,
    messageReactions,
    messageReactionErrors,
    reactToMessage,
    reloadMessageReactions,
  } = useMessaging();
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [failedKind, setFailedKind] = useState<
    MessageReactionKind | null | undefined
  >();
  const mounted = useRef(true);
  const selected = messageReactions[message.id];
  const canReact =
    canSendToConversation(state, message.conversationId) &&
    message.sender === 'other';
  useEffect(() => {
    mounted.current = true;
    void reloadMessageReactions(message.conversationId).finally(() => {
      if (mounted.current) setLoading(false);
    });
    return () => {
      mounted.current = false;
    };
  }, [message.conversationId, reloadMessageReactions]);
  const reload = async () => {
    setLoading(true);
    await reloadMessageReactions(message.conversationId);
    if (mounted.current) setLoading(false);
  };
  const save = async (kind: MessageReactionKind | null) => {
    if (busy || !canReact) return;
    setBusy(true);
    setError(null);
    setFailedKind(undefined);
    try {
      await reactToMessage(message.id, kind);
      if (mounted.current) onClose();
    } catch {
      if (mounted.current) {
        setFailedKind(kind);
        setError(
          'Nie udało się zapisać reakcji. Sprawdź połączenie i spróbuj ponownie.',
        );
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const loadError = messageReactionErrors[message.conversationId];
  return (
    <BottomSheet
      title="Reakcja na wiadomość"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <AppText color="textSecondary" numberOfLines={3}>
        {message.text}
      </AppText>
      {loading ? (
        <ActivityIndicator
          color={theme.primaryStrong}
          accessibilityLabel="Wczytywanie reakcji na wiadomość"
        />
      ) : null}
      {loadError ? (
        <>
          <AppText accessibilityRole="alert">{loadError}</AppText>
          <Button
            label="Wczytaj reakcje ponownie"
            variant="secondary"
            onPress={() => {
              void reload();
            }}
          />
        </>
      ) : null}
      {!canReact ? (
        <AppText color="textSecondary">
          Reakcje są niedostępne dla tego kontaktu.
        </AppText>
      ) : null}
      {MESSAGE_REACTIONS.map((option) => (
        <Pressable
          key={option.kind}
          accessibilityRole="button"
          accessibilityLabel={option.label}
          aria-pressed={selected === option.kind}
          accessibilityState={{
            selected: selected === option.kind,
            disabled: busy || loading || !canReact,
          }}
          disabled={busy || loading || !canReact}
          onPress={() => {
            void save(selected === option.kind ? null : option.kind);
          }}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            minHeight: 48,
            padding: 8,
            borderRadius: 14,
            backgroundColor:
              selected === option.kind ? theme.backgroundSelected : theme.muted,
            opacity: pressed || busy ? 0.6 : 1,
          })}
        >
          <AppText aria-hidden style={{ fontSize: 26 }}>
            {option.emoji}
          </AppText>
          <AppText variant="label" style={{ flex: 1 }}>
            {option.label}
          </AppText>
          {selected === option.kind ? (
            <AppText color="primaryStrong">✓</AppText>
          ) : null}
        </Pressable>
      ))}
      {error ? <AppText accessibilityRole="alert">{error}</AppText> : null}
      {failedKind !== undefined ? (
        <Button
          label="Ponów zapis reakcji"
          disabled={busy || !canReact}
          onPress={() => {
            void save(failedKind);
          }}
        />
      ) : null}
      {selected ? (
        <Button
          label="Usuń reakcję"
          variant="secondary"
          disabled={busy || !canReact}
          onPress={() => {
            void save(null);
          }}
        />
      ) : null}
      {busy ? (
        <ActivityIndicator
          color={theme.primaryStrong}
          accessibilityLabel="Zapisywanie reakcji na wiadomość"
        />
      ) : null}
    </BottomSheet>
  );
}
