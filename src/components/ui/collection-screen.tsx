import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useEffect, useRef, type ReactNode } from 'react';
import {
  FlatList,
  Platform,
  StyleSheet,
  View,
  type ListRenderItem,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScenicFooter } from './scenic-footer';
import { ScenicHeaderBackground } from './scenic-header';
import { useIsFocused } from 'expo-router';
import { useAutoPagination, type AutoPagination } from '@/hooks/use-auto-pagination';
import { PaginationFooter } from './pagination-footer';

interface CollectionScreenProps<T> {
  data: readonly T[];
  renderItem: ListRenderItem<T>;
  keyExtractor: (item: T) => string;
  header?: ReactNode;
  beforeList?: ReactNode;
  afterList?: ReactNode;
  empty?: ReactNode;
  children?: ReactNode;
  testID: string;
  itemGap?: number;
  onEndReached?: () => void;
  pagination?: AutoPagination;
}

// This is the screen's only vertical scroller. Card state belongs in the shared
// stores: rows outside the window can unmount without losing saves or reactions.
export function CollectionScreen<T>({
  data,
  renderItem,
  keyExtractor,
  header,
  beforeList,
  afterList,
  empty,
  children,
  testID,
  itemGap = 12,
  onEndReached,
  pagination,
}: CollectionScreenProps<T>) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const list = useRef<FlatList<T>>(null);
  const focused = useIsFocused();
  const paging = useAutoPagination(pagination ? {...pagination,enabled:focused && pagination.enabled !== false} : undefined);
  const gutter = {
    paddingLeft: Math.max(Spacing.four, insets.left),
    paddingRight: Math.max(Spacing.four, insets.right),
  };
  // Restarting a search clears its rows. Quiet refreshes keep them and therefore
  // preserve the native scroll position and the measured frames on return.
  useEffect(() => {
    if (!data.length)
      list.current?.scrollToOffset({ offset: 0, animated: false });
  }, [data.length]);
  return (
    <>
      <FlatList
        ref={list}
        testID={testID}
        data={data}
        onEndReached={pagination ? paging.onEndReached : onEndReached}
        onEndReachedThreshold={0.3}
        onScroll={pagination ? paging.onScroll : undefined}
        onScrollBeginDrag={pagination ? paging.onScrollBeginDrag : undefined}
        onLayout={pagination ? paging.onLayout : undefined}
        onContentSizeChange={pagination ? paging.onContentSizeChange : undefined}
        scrollEventThrottle={pagination ? 100 : undefined}
        keyExtractor={keyExtractor}
        style={{ flex: 1, backgroundColor: theme.background }}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={5}
        maxToRenderPerBatch={4}
        windowSize={5}
        updateCellsBatchingPeriod={32}
        removeClippedSubviews={false}
        renderItem={(info) => (
          <View style={gutter}>
            <View style={styles.column}>{renderItem(info)}</View>
          </View>
        )}
        ItemSeparatorComponent={<View style={{ height: itemGap }} />}
        ListHeaderComponent={
          <View
            testID={testID + '-loaded-' + data.length}
            style={{
              paddingTop: header
                ? 0
                : Spacing.three + (Platform.OS === 'ios' ? 0 : insets.top),
            }}
          >
            {!header ? (
              <ScenicHeaderBackground
                style={{ top: Platform.OS === 'ios' ? 0 : insets.top }}
              />
            ) : null}
            {header}
            <View style={gutter}>
              <View
                style={[
                  styles.column,
                  styles.stack,
                  { paddingBottom: itemGap },
                ]}
              >
                {beforeList}
              </View>
            </View>
          </View>
        }
        ListEmptyComponent={
          empty ? (
            <View style={gutter}>
              <View style={styles.column}>{empty}</View>
            </View>
          ) : undefined
        }
        ListFooterComponentStyle={styles.footer}
        ListFooterComponent={
          <View style={styles.footer}>
            <View style={gutter}>
              <View
                style={[
                  styles.column,
                  styles.stack,
                  {
                    paddingTop: data.length || empty ? itemGap : 0,
                    paddingBottom: Spacing.five,
                  },
                ]}
              >
                {afterList}
                {pagination ? <PaginationFooter pagination={{...pagination,loading:pagination.loading||paging.requesting}} onRetry={paging.retry} /> : null}
              </View>
            </View>
            <ScenicFooter />
          </View>
        }
      />
      {children}
    </>
  );
}
const styles = StyleSheet.create({
  content: { flexGrow: 1 },
  column: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  stack: { gap: Spacing.four },
  footer: { flexGrow: 1 },
});
