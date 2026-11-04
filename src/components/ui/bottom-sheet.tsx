import type { ReactNode } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText, IconButton } from './primitives';
import { SheetBackdrop, SheetModal, SheetSurface } from './sheet-modal';
import { MaxContentWidth, Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useIsFocused } from 'expo-router';
import { useAutoPagination, type AutoPagination } from '@/hooks/use-auto-pagination';
import { PaginationFooter } from './pagination-footer';

export function BottomSheet({
  title,
  children,
  onClose,
  pagination,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  pagination?: AutoPagination;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const paging = useAutoPagination(pagination ? {...pagination,enabled:focused && pagination.enabled !== false} : undefined);
  const close = () => {
    Keyboard.dismiss();
    onClose();
  };
  return (
    <SheetModal onRequestClose={close}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <SheetBackdrop label="Zamknij panel" onPress={close} />
        <SheetSurface
          role="dialog"
          accessibilityLabel={title}
          accessibilityViewIsModal
          aria-modal
          style={[
            styles.sheet,
            {
              backgroundColor: theme.backgroundElement,
              marginTop: insets.top,
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
            testID="sheet-scroll"
            onScroll={pagination ? paging.onScroll : undefined}
            onScrollBeginDrag={pagination ? paging.onScrollBeginDrag : undefined}
            onLayout={pagination ? paging.onLayout : undefined}
            onContentSizeChange={pagination ? paging.onContentSizeChange : undefined}
            scrollEventThrottle={pagination ? 100 : undefined}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            style={{ flexShrink: 1 }}
            contentContainerStyle={{ padding: 16, paddingBottom: 24 + Math.max(insets.bottom, 16), gap: 12 }}
          >
            {children}
            {pagination ? <PaginationFooter pagination={{...pagination,loading:pagination.loading||paging.requesting}} onRetry={paging.retry} /> : null}
          </ScrollView>
        </SheetSurface>
      </KeyboardAvoidingView>
    </SheetModal>
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
