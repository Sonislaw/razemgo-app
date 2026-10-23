import { useState, type ReactNode } from 'react';
import { Pressable, TextInput, View, type TextInputProps } from 'react-native';
import {
  AppText,
  Card,
  FieldLabel,
  PageHeader,
  Screen,
} from '@/components/ui/primitives';
import { useTheme } from '@/hooks/use-theme';

export function AuthScreen({
  title,
  description,
  header,
  children,
}: {
  title: string;
  description?: string;
  header?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Screen header={header}>
      {!header ? <PageHeader title={title} /> : null}
      <Card>
        {header ? (
          <AppText variant="heading" accessibilityRole="header">
            {title}
          </AppText>
        ) : null}
        {description ? (
          <AppText color="textSecondary">{description}</AppText>
        ) : null}
        {children}
      </Card>
    </Screen>
  );
}
export function AuthField({
  label,
  password = false,
  ...props
}: TextInputProps & { label: string; password?: boolean }) {
  const theme = useTheme();
  const [visible, setVisible] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      <FieldLabel required>{label}</FieldLabel>
      <View
        style={{
          flexDirection: 'row',
          borderWidth: 1,
          borderColor: theme.border,
          borderRadius: 12,
          backgroundColor: theme.background,
        }}
      >
        <TextInput
          {...props}
          accessibilityLabel={label}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry={password && !visible}
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 52,
            padding: 12,
            color: theme.text,
            fontSize: 16,
          }}
        />
        {password ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={visible ? 'Ukryj hasło' : 'Pokaż hasło'}
            onPress={() => setVisible(!visible)}
            style={{
              minWidth: 64,
              minHeight: 48,
              justifyContent: 'center',
              padding: 8,
            }}
          >
            <AppText variant="caption" color="primaryStrong">
              {visible ? 'Ukryj' : 'Pokaż'}
            </AppText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
export function AuthNotice({
  message,
  error = false,
}: {
  message: string | null;
  error?: boolean;
}) {
  const theme = useTheme();
  return message ? (
    <View
      accessibilityRole={error ? 'alert' : undefined}
      accessibilityLiveRegion="polite"
      style={{
        padding: 12,
        borderRadius: 12,
        backgroundColor: error ? theme.hero : theme.positiveBackground,
      }}
    >
      <AppText>{message}</AppText>
    </View>
  ) : null;
}
