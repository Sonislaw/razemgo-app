import { useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref, type RefObject } from 'react';
import {
  Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView,
  StyleSheet, TextInput, View, type TextInputInstance,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Fonts, MaxContentWidth, Radius, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { AppText, FieldLabel } from './primitives';
import { Icon } from './icon';

export interface AutocompleteFieldHandle { focus: () => void }

interface SearchLayerProps {
  label: string;
  value: string;
  placeholder: string;
  maxLength: number;
  errorId?: string;
  onChangeText: (value: string) => void;
  onClose: () => void;
  onClear: () => void;
  clearLabel: string;
  onSubmitEditing?: () => void;
  inputRef: RefObject<TextInputInstance | null>;
  children: ReactNode;
}

function SearchLayerContent({ label, value, placeholder, maxLength, onChangeText, onClose,
  onClear, clearLabel, onSubmitEditing, inputRef, errorId, children }: SearchLayerProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return <KeyboardAvoidingView role="dialog" aria-modal accessibilityViewIsModal
    accessibilityLabel={'Wyszukiwanie: ' + label} testID="autocomplete-search-layer"
    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    style={[styles.layer, { backgroundColor: theme.backgroundElement }]}>
    <View style={[styles.header, {
      paddingTop: Math.max(insets.top, 12), paddingLeft: Math.max(insets.left, 16), paddingRight: Math.max(insets.right, 16),
    }]}>
      <View style={[styles.search, { borderColor: theme.primaryStrong, backgroundColor: theme.backgroundElement }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Wróć do formularza" onPress={onClose} style={styles.action}>
          <Icon name="back" size={24} color={theme.text} />
        </Pressable>
        <TextInput ref={inputRef} nativeID="autocomplete-search-input" autoFocus selectTextOnFocus accessibilityLabel={label} value={value}
          aria-invalid={!!errorId} aria-describedby={errorId}
          placeholder={placeholder} placeholderTextColor={theme.textSecondary}
          onChangeText={onChangeText} maxLength={maxLength} autoCorrect={false} autoComplete="off"
          returnKeyType={onSubmitEditing ? 'done' : 'search'}
          submitBehavior={onSubmitEditing ? 'blurAndSubmit' : 'submit'}
          onSubmitEditing={onSubmitEditing} underlineColorAndroid="transparent"
          style={[styles.input, { color: theme.text }]} />
        {value ? <Pressable accessibilityRole="button" accessibilityLabel={clearLabel}
          onPress={() => { onClear(); inputRef.current?.focus(); }} style={styles.action}>
          <Icon name="close" size={20} />
        </Pressable> : null}
      </View>
    </View>
    <ScrollView testID="autocomplete-results" keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
      style={styles.results} contentContainerStyle={[
        styles.resultsContent, { paddingBottom: Math.max(insets.bottom, 16),
          paddingLeft: Math.max(insets.left, 16), paddingRight: Math.max(insets.right, 16) },
      ]}>
      {children}
    </ScrollView>
  </KeyboardAvoidingView>;
}

export function AutocompleteField({ label, value, placeholder, onChangeText, onClear, clearLabel,
  required = false, hint, errorId, inputRef, maxLength, renderSuggestions, allowFreeText = false,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChangeText: (value: string) => void;
  onClear: () => void;
  clearLabel: string;
  required?: boolean;
  hint?: string;
  errorId?: string;
  inputRef?: Ref<AutocompleteFieldHandle>;
  maxLength: number;
  renderSuggestions: (close: () => void) => ReactNode;
  allowFreeText?: boolean;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const searchInput = useRef<TextInputInstance>(null);
  const focusFrame = useRef<number | null>(null);
  useEffect(() => () => {
    if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
  }, []);
  useImperativeHandle(inputRef, () => ({ focus: () => setOpen(true) }), []);
  const close = () => { Keyboard.dismiss(); setOpen(false); };
  const props: SearchLayerProps = {
    label, value, placeholder, maxLength, onChangeText, clearLabel, errorId,
    onClear, onClose: close, onSubmitEditing: allowFreeText ? close : undefined, inputRef: searchInput,
    children: open ? renderSuggestions(close) : null,
  };
  return <View style={styles.field}>
    <FieldLabel required={required}>{label}</FieldLabel>
    <View style={[styles.trigger, { backgroundColor: theme.background, borderColor: errorId ? theme.destructive : theme.border }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={'Otwórz wyszukiwanie: ' + label}
        accessibilityValue={value ? { text: value } : undefined}
        accessibilityHint={(required ? 'Pole wymagane. ' : '') + (value ? value + '. ' : '') + (hint ?? '')}
        aria-describedby={errorId} onPress={() => setOpen(true)} style={styles.triggerBody}>
        <Icon name="search" size={20} />
        <AppText numberOfLines={1} color={value ? 'text' : 'textSecondary'} style={styles.triggerText}>{value || placeholder}</AppText>
      </Pressable>
      {value ? <Pressable accessibilityRole="button" accessibilityLabel={clearLabel} onPress={onClear} style={styles.action}>
        <Icon name="close" size={20} />
      </Pressable> : null}
    </View>
    {hint ? <AppText variant="caption" color="textSecondary">{hint}</AppText> : null}
    {open ? <Modal transparent={false} presentationStyle="fullScreen" animationType="none"
      statusBarTranslucent navigationBarTranslucent onRequestClose={close} onShow={() => {
        // Let a parent modal release its focus trap before focusing this layer.
        focusFrame.current = requestAnimationFrame(() => {
          focusFrame.current = null;
          searchInput.current?.focus();
        });
      }}>
      {Platform.OS === 'web' ? <SearchLayerContent {...props} /> :
        <SafeAreaProvider><SearchLayerContent {...props} /></SafeAreaProvider>}
    </Modal> : null}
  </View>;
}

const styles = StyleSheet.create({
  field: { gap: 8 },
  layer: { flex: 1, alignItems: 'center' },
  header: { width: '100%', maxWidth: MaxContentWidth, paddingBottom: 12 },
  search: { flexDirection: 'row', alignItems: 'center', minHeight: 60, borderRadius: Radius.small, borderWidth: 2 },
  input: { flex: 1, minWidth: 0, minHeight: 56, paddingVertical: 12, paddingHorizontal: 2,
    borderWidth: 0, outlineWidth: 0, fontFamily: Fonts.sans, ...Typography.body },
  action: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  trigger: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: Radius.small },
  triggerBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 54, paddingLeft: 12, paddingRight: 8 },
  triggerText: { flex: 1 },
  results: { flex: 1, minHeight: 0, width: '100%', maxWidth: MaxContentWidth },
  resultsContent: { gap: 10, paddingTop: 4 },
});
