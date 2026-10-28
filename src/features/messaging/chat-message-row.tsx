import { AppText, Button } from '@/components/ui/primitives';
import { Fonts, MaxContentWidth, Typography } from '@/constants/theme';
import { MessageReactionButton } from '@/features/messaging/message-reactions-ui';
import {
  formatMessageDate,
  formatMessageTime,
} from '@/features/messaging/messaging-state';
import { useTheme } from '@/hooks/use-theme';
import type { ChatMessage } from '@/types/messaging';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

export function ChatMessageRow({
  item,
  firstOfDay,
  canSend,
  simulateSendError,
  onReact,
  onRetry,
}: {
  item: ChatMessage;
  firstOfDay: boolean;
  canSend: boolean;
  simulateSendError: boolean;
  onReact: (id: string) => void;
  onRetry: (message: ChatMessage) => void;
}) {
  const theme = useTheme();
  const { fontScale } = useWindowDimensions();
  const reactionScale = Math.max(1, fontScale);
  const self = item.sender === 'self';
  return (
    <View testID={'chat-message-' + item.id} style={{ gap: 12 }}>
      {firstOfDay ? (
        <AppText
          variant="caption"
          color="textSecondary"
          style={{ textAlign: 'center' }}
        >
          {formatMessageDate(item.createdAt)}
        </AppText>
      ) : null}
      <View
        style={[
          styles.bubbleFrame,
          {
            alignSelf: self ? 'flex-end' : 'flex-start',
            paddingBottom: 14 * reactionScale,
          },
        ]}
      >
        <Pressable
          testID={'chat-bubble-' + item.id}
          accessible={false}
          delayLongPress={300}
          onLongPress={
            !self && canSend && item.status === 'sent'
              ? () => onReact(item.id)
              : undefined
          }
          style={[
            styles.bubble,
            {
              minWidth: self ? 180 : 110,
              paddingBottom: 16 * reactionScale,
              backgroundColor: self
                ? theme.primaryStrong
                : theme.backgroundElement,
              borderColor: self ? theme.primaryStrong : theme.border,
              borderBottomLeftRadius: self ? 18 : 4,
              borderBottomRightRadius: self ? 4 : 18,
            },
          ]}
        >
          <AppText
            style={{
              color: self ? theme.onPrimary : theme.text,
              fontSize: 15,
              lineHeight: 22,
            }}
          >
            {item.text}
          </AppText>
          <View style={{ alignItems: 'flex-end' }}>
            <AppText
              variant="caption"
              numberOfLines={1}
              style={{
                color: self ? theme.onPrimary : theme.textSecondary,
                textAlign: 'right',
                alignSelf: 'stretch',
              }}
            >
              {formatMessageTime(item.createdAt)}
              {self
                ? item.status === 'sending'
                  ? ' · Wysyłanie…'
                  : item.status === 'failed'
                    ? ' · Nie wysłano'
                    : item.read
                      ? ' · Odczytano'
                      : ' · Wysłano'
                : ''}
            </AppText>
          </View>
        </Pressable>
        <MessageReactionButton
          message={item}
          disabled={!canSend || item.status !== 'sent'}
          onPress={() => onReact(item.id)}
        />
      </View>
      {item.status === 'failed' ? (
        <View style={{ alignSelf: 'flex-end', maxWidth: '90%', gap: 4 }}>
          <AppText variant="caption" color="textSecondary">
            Nie udało się wysłać wiadomości. Spróbuj ponownie.
          </AppText>
          <Button
            label="Ponów wysyłanie"
            icon="refresh"
            variant="secondary"
            disabled={!canSend || simulateSendError}
            onPress={() => onRetry(item)}
          />
        </View>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1 },
  container: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  header: {
    padding: 8,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
  },
  pinned: {
    margin: 12,
    marginBottom: 0,
    padding: 12,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 60,
  },
  bubbleFrame: {
    maxWidth: '88%',
  },
  bubble: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    gap: 4,
  },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    maxHeight: 128,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontFamily: Fonts.sans,
    ...Typography.body,
  },
});
