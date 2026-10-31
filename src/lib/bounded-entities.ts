// Lists own their ordered pages. The cross-screen detail cache only retains
// recently hydrated entities and cannot grow with every page ever visited.
export function mergeRecentEntities<T extends { id: string }>(
  previous: T[],
  incoming: T[],
  limit = 100,
  pinnedIds: string[] = [],
): T[] {
  const entities = new Map(previous.map((item) => [item.id, item]));
  for (const item of incoming) {
    entities.delete(item.id);
    entities.set(item.id, item);
  }
  const pinned = new Set(pinnedIds.slice(0, limit));
  const retained = [...entities.values()].filter((item) => pinned.has(item.id));
  const available = Math.max(0, limit - retained.length);
  return [
    ...retained,
    ...(available
      ? [...entities.values()]
          .filter((item) => !pinned.has(item.id))
          .slice(-available)
      : []),
  ];
}
