import { ActivityIndicator, StyleSheet, View } from 'react-native';
import type { AutoPagination } from '@/hooks/use-auto-pagination';
import { useTheme } from '@/hooks/use-theme';
import { AppText } from './primitives';
import { DataStatus } from './data-status';

export function PaginationFooter({pagination,onRetry}: {pagination: AutoPagination; onRetry?: () => void}) {
  const theme = useTheme();
  if (!pagination.itemCount || (!pagination.hasMore && !pagination.loading)) return null;
  return <View testID="pagination-footer" style={styles.footer} accessibilityLiveRegion="polite">
    {pagination.loading ? <View style={styles.row} accessibilityState={{busy:true}}>
        <ActivityIndicator color={theme.primaryStrong} accessibilityLabel={pagination.loadingLabel ?? 'Wczytywanie kolejnych treści'} />
        <AppText variant="caption" color="textSecondary" style={{flexShrink:1}}>{pagination.loadingLabel ?? 'Wczytywanie kolejnych treści…'}</AppText>
      </View> : pagination.error ? <DataStatus status="error" error={pagination.error}
        onRetry={onRetry ?? (() => { void (pagination.onRetry ?? pagination.onLoadMore)(); })} /> : null}
  </View>;
}
const styles = StyleSheet.create({
  footer: {minHeight:56,justifyContent:'center'},
  row: {flexDirection:'row',alignItems:'center',justifyContent:'center',gap:12,paddingVertical:12},
});
