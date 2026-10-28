export interface ResourcePage<T, C> {
  items: T[];
  hasMore: boolean;
  cursor: C | null;
  totalCount: number;
}
export interface ResourceState<T, C, P extends ResourcePage<T, C>> {
  page: P | null;
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  loadingMore: boolean;
}
export function createPagedResource<
  T,
  C,
  P extends ResourcePage<T, C>,
>(options: {
  load: (cursor: C | undefined, signal: AbortSignal) => Promise<P | null>;
  key: (item: T) => string;
  error: (error: unknown, phase: 'load' | 'more') => string;
  refreshItems?: (items: T[], signal: AbortSignal) => Promise<T[]>;
}) {
  let state: ResourceState<T, C, P> = {
    page: null,
    status: 'loading',
    error: null,
    loadingMore: false,
  };
  let generation = 0,
    failed: 'load' | 'more' = 'load';
  let controller: AbortController | undefined;
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<typeof state>) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };
  const unique = (items: T[]) => [
    ...new Map(items.map((item) => [options.key(item), item])).values(),
  ];
  const checkCursor = (before: C, page: P | null) => {
    if (
      page?.hasMore &&
      (!page.cursor || JSON.stringify(before) === JSON.stringify(page.cursor))
    )
      throw Error('Invalid cursor progression');
  };
  const load = async (restart = false) => {
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal,
      version = ++generation,
      previous = restart ? null : state.page;
    failed = 'load';
    publish({
      ...(restart ? { page: null } : {}),
      status: 'loading',
      error: null,
      loadingMore: false,
    });
    try {
      let page = await options.load(undefined, signal);
      if (page && previous && options.refreshItems) {
        const validated = await options.refreshItems(previous.items, signal);
        const byId = new Map(
          validated.map((item) => [options.key(item), item]),
        );
        const retained = previous.items.flatMap((item) =>
          byId.has(options.key(item)) ? [byId.get(options.key(item))!] : [],
        );
        const items = unique([...page.items, ...retained]);
        page = {
          ...page,
          items,
          cursor: previous.cursor ?? page.cursor,
          hasMore:
            items.length < page.totalCount &&
            (previous.hasMore || !!previous.cursor),
        };
      } else
        while (
          page?.hasMore &&
          page.cursor &&
          page.items.length < (previous?.items.length ?? 0) &&
          version === generation
        ) {
          const next = await options.load(page.cursor, signal);
          checkCursor(page.cursor, next);
          if (!next) {
            page = null;
            break;
          }
          page = { ...next, items: unique([...page.items, ...next.items]) };
        }
      if (version === generation)
        publish({ page, status: 'ready', error: null });
    } catch (error) {
      if (version === generation && !signal.aborted)
        publish({ status: 'error', error: options.error(error, 'load') });
    }
  };
  const more = async () => {
    if (
      state.status === 'loading' ||
      !state.page?.hasMore ||
      !state.page.cursor
    )
      return;
    const previous = state.page,
      version = generation;
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal;
    publish({ status: 'loading', loadingMore: true, error: null });
    try {
      const next = await options.load(previous.cursor!, signal);
      checkCursor(previous.cursor!, next);
      if (version === generation)
        publish({
          page: next
            ? { ...next, items: unique([...previous.items, ...next.items]) }
            : null,
          status: 'ready',
          loadingMore: false,
        });
    } catch (error) {
      if (version === generation && !signal.aborted) {
        failed = 'more';
        publish({
          status: 'error',
          loadingMore: false,
          error: options.error(error, 'more'),
        });
      }
    }
  };
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    restart: () => load(true),
    refresh: () => load(),
    more,
    retry: () => (failed === 'more' ? more() : load()),
    stop() {
      generation++;
      controller?.abort();
    },
  };
}
