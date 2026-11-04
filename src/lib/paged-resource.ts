export interface ResourcePage<T, C> {
  items: T[];
  hasMore: boolean;
  cursor: C | null;
  totalCount: number;
  // Opaque fingerprint of the authorized result IDs and their ordering keys.
  // Missing fingerprints use the safe prefix reconciliation path.
  revision?: string;
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
  // Opt in for plain JSON DTOs. Other resources keep their existing semantics.
  reuseUnchangedItems?: boolean;
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
  const reconcileItems = (page: P | null, previous: P | null): P | null => {
    if (!options.reuseUnchangedItems || !page || !previous) return page;
    const byId = new Map(previous.items.map(item => [options.key(item),item]));
    const items = page.items.map(item => {
      const old = byId.get(options.key(item));
      return old && (old === item || JSON.stringify(old) === JSON.stringify(item)) ? old : item;
    });
    const unchanged = items.length === previous.items.length && items.every((item,i) => item === previous.items[i]);
    return { ...page, items: unchanged ? previous.items : items };
  };
  const checkCursor = (before: C, page: P | null) => {
    if (
      page?.hasMore &&
      (!page.cursor || JSON.stringify(before) === JSON.stringify(page.cursor))
    )
      throw Error('Invalid cursor progression');
  };
  const load = async (restart = false, desiredCount = 0) => {
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
      const validated =
        page && previous && options.refreshItems
          ? await options.refreshItems(previous.items, signal)
          : undefined;
      const validKeys = validated && new Set(validated.map(options.key));
      const boundary =
        validKeys &&
        previous?.items.findLast((item) => validKeys.has(options.key(item)));
      const boundaryKey = boundary ? options.key(boundary) : undefined;
      if (
        page &&
        previous &&
        options.refreshItems &&
        page.revision &&
        page.revision === previous.revision &&
        page.totalCount === previous.totalCount
      ) {
        const byId = new Map(
          validated!.map((item) => [options.key(item), item]),
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
          (page.items.length <
            Math.max(previous?.items.length ?? 0, desiredCount) ||
            (!!boundaryKey &&
              !page.items.some((item) => options.key(item) === boundaryKey))) &&
          version === generation
        ) {
          const next = await options.load(page.cursor, signal);
          checkCursor(page.cursor, next);
          if (
            next?.revision &&
            page.revision &&
            next.revision !== page.revision
          )
            throw Error('Results changed during reconciliation');
          if (!next) {
            page = null;
            break;
          }
          page = { ...next, items: unique([...page.items, ...next.items]) };
        }
      if (version === generation)
        publish({ page: reconcileItems(page,previous), status: 'ready', error: null });
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
      if (
        next?.revision &&
        previous.revision &&
        next.revision !== previous.revision
      ) {
        // The result set moved while paging. Reconcile the loaded prefix before
        // advancing; an old keyset cursor must not silently skip new records.
        await load(false, previous.items.length + next.items.length);
        return;
      }
      if (version === generation)
        publish({
          page: reconcileItems(next
            ? { ...next, items: unique([...previous.items, ...next.items]) }
            : null,previous),
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
