import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

export interface AutoPagination {
  itemCount: number;
  hasMore: boolean;
  loading: boolean;
  disabled?: boolean;
  enabled?: boolean;
  error?: string | null;
  resetKey?: unknown;
  loadingLabel?: string;
  onLoadMore: () => Promise<unknown> | void;
  onRetry?: () => Promise<unknown> | void;
}

export function useAutoPagination(pagination?: AutoPagination) {
  const [requesting,setRequesting] = useState(false);
  const current = useRef(pagination), active = useRef(true), pending = useRef(false);
  const requestedCount = useRef<number | null>(null), resetKey = useRef(pagination?.resetKey);
  const previousCount = useRef(pagination?.itemCount ?? 0);
  // Virtual lists can report their end before the first rows are measured.
  // Start paging only after scrolling or a drag, including a short list's edge.
  const interacted = useRef(false);
  const metrics = useRef({offset:0,content:0,viewport:0,count:-1});
  useLayoutEffect(() => {
    current.current = pagination;
    if (resetKey.current !== pagination?.resetKey || (pagination?.itemCount ?? 0) < previousCount.current)
      requestedCount.current = null;
    if (resetKey.current !== pagination?.resetKey || !pagination?.itemCount) interacted.current = false;
    resetKey.current = pagination?.resetKey;
    previousCount.current = pagination?.itemCount ?? 0;
  }, [pagination]);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);

  const request = useCallback(async (retry = false) => {
    const page = current.current;
    if (!active.current || !page || (!retry && !interacted.current) || page.enabled === false || !page.hasMore ||
      page.loading || page.disabled || pending.current || (!retry && page.error) ||
      (!retry && requestedCount.current === page.itemCount)) return;
    requestedCount.current = page.itemCount;
    pending.current = true;
    setRequesting(true);
    try { await (retry && page.onRetry ? page.onRetry() : page.onLoadMore()); }
    finally { pending.current = false; if (active.current) setRequesting(false); }
  }, []);
  const check = useCallback(() => {
    const {offset,content,viewport} = metrics.current;
    if (viewport <= 0 || content <= 0) return;
    if (content - viewport - offset <= Math.max(100,viewport * 0.3)) void request();
    else requestedCount.current = null;
  }, [request]);
  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const {contentOffset,contentSize,layoutMeasurement} = event.nativeEvent;
    if (contentOffset.y > 0) interacted.current = true;
    metrics.current = {offset:contentOffset.y,content:contentSize.height,viewport:layoutMeasurement.height,
      count:current.current?.itemCount ?? 0};
    check();
  }, [check]);
  const onScrollBeginDrag = useCallback(() => {
    interacted.current = true;
    check();
  }, [check]);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    metrics.current.viewport = event.nativeEvent.layout.height;
    check();
  }, [check]);
  const onContentSizeChange = useCallback((_width: number,height: number) => {
    metrics.current.content = height;
    metrics.current.count = current.current?.itemCount ?? 0;
    check();
  }, [check]);
  // Resume an end-of-list intent after a refresh or write finishes, using only
  // geometry measured for the currently rendered page, never a stale page size.
  useEffect(() => {
    if (pagination && !pagination.loading && !pagination.disabled &&
      metrics.current.count === pagination.itemCount) check();
  }, [pagination,check]);
  return {onScroll,onScrollBeginDrag,onLayout,onContentSizeChange,requesting,
    onEndReached: useCallback(() => { void request(); }, [request]),
    retry: useCallback(() => { void request(true); }, [request])};
}
