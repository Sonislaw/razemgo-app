import type { ReactNode } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, IconButton } from '@/components/ui/primitives';
import { Icon, type IconName } from '@/components/ui/icon';
import { MaxContentWidth, Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function GroupAvatar({
  groupId,
  size = 48,
}: {
  groupId: string;
  size?: number;
}) {
  const theme = useTheme();
  const index = Number(groupId.replace('demo-', '')) || 1;
  const backgrounds = [theme.hero, theme.muted, theme.positiveBackground];
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2.6,
        backgroundColor: backgrounds[(index - 1) % 3],
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name="people" size={size * 0.48} />
    </View>
  );
}

export function CountBadge({ count }: { count: number }) {
  const theme = useTheme();
  if (!count) return null;
  return (
    <View
      style={{
        minWidth: 22,
        minHeight: 22,
        paddingHorizontal: 6,
        borderRadius: 12,
        backgroundColor: theme.primaryStrong,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <AppText
        variant="caption"
        style={{ color: theme.onPrimary, fontWeight: '700' }}
      >
        {count > 99 ? '99+' : count}
      </AppText>
    </View>
  );
}

export function MessageSegments<T extends string>({
  value,
  options,
  onChange,
  subtle = false,
}: {
  value: T;
  options: { value: T; label: string; count?: number }[];
  onChange: (value: T) => void;
  subtle?: boolean;
}) {
  const theme = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        padding: 4,
        gap: 4,
        borderRadius: 16,
        backgroundColor: subtle ? theme.background : theme.muted,
      }}
    >
      {options.map((option) => (
        <Pressable
          key={option.value}
          accessibilityRole="tab"
          accessibilityLabel={
            option.label + (option.count ? ', ' + option.count : '')
          }
          accessibilityState={{ selected: value === option.value }}
          onPress={() => onChange(option.value)}
          style={({ pressed }) => ({
            flex: 1,
            minWidth: 0,
            minHeight: 48,
            paddingHorizontal: 8,
            paddingVertical: 10,
            borderRadius: 12,
            backgroundColor:
              value === option.value ? theme.backgroundElement : 'transparent',
            opacity: pressed ? 0.65 : 1,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: 6,
            flexWrap: 'wrap',
          })}
        >
          <AppText
            variant="label"
            color={value === option.value ? 'primaryStrong' : 'textSecondary'}
            style={{ textAlign: 'center', flexShrink: 1 }}
          >
            {option.label}
          </AppText>
          {option.count ? <CountBadge count={option.count} /> : null}
        </Pressable>
      ))}
    </View>
  );
}

export function MailboxEmpty({
  title,
  description,
  icon = 'chat',
  children,
}: {
  title: string;
  description: string;
  icon?: IconName;
  children?: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: 12, paddingVertical: 20 }}>
      <View
        style={{
          width: 60,
          height: 60,
          borderRadius: 20,
          backgroundColor: theme.hero,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Icon name={icon} size={30} />
      </View>
      <AppText
        variant="heading"
        accessibilityRole="header"
        style={{ textAlign: 'center' }}
      >
        {title}
      </AppText>
      <AppText
        color="textSecondary"
        style={{ textAlign: 'center', fontSize: 14, lineHeight: 21 }}
      >
        {description}
      </AppText>
      <View style={{ alignSelf: 'stretch', gap: 8 }}>{children}</View>
    </View>
  );
}

export function MessagingSheet({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const close = () => {
    Keyboard.dismiss();
    onClose();
  };
  return (
    <Modal
      transparent
      visible
      animationType="slide"
      onRequestClose={close}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.scrim }]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Zamknij panel"
          onPress={close}
          style={StyleSheet.absoluteFill}
        />
        <View
          role="dialog"
          accessibilityLabel={title}
          accessibilityViewIsModal
          aria-modal
          style={[
            styles.sheet,
            {
              backgroundColor: theme.backgroundElement,
              marginTop: insets.top,
              paddingBottom: Math.max(16, insets.bottom),
            },
          ]}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              padding: 16,
              gap: 12,
              borderBottomWidth: 1,
              borderColor: theme.border,
            }}
          >
            <AppText
              variant="heading"
              accessibilityRole="header"
              style={{ flex: 1 }}
            >
              {title}
            </AppText>
            <IconButton label="Zamknij" icon="close" onPress={close} />
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            style={{ flexShrink: 1 }}
            contentContainerStyle={{ padding: 16, gap: 12 }}
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  sheet: {
    width: '100%',
    maxWidth: MaxContentWidth,
    maxHeight: '92%',
    borderTopLeftRadius: Radius.hero,
    borderTopRightRadius: Radius.hero,
    overflow: 'hidden',
  },
});
