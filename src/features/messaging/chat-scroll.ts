// Keep following messages separate from geometry/read/reaction refreshes. A new
// viewport (keyboard) may follow the bottom, but must not interrupt older reading.
export function createChatScrollController() {
  let ready = false, tail: string | null = null, atBottom = true, pending = false, viewport = 0;
  return {
    messagesChanged(nextTail: string | null, loaded: boolean) {
      if (!loaded) return;
      if (!ready || nextTail !== tail) pending = atBottom;
      ready = true; tail = nextTail;
    },
    scrolled(offset: number, content: number, height: number) {
      if (viewport && Math.abs(height - viewport) > 1) return;
      // The list is inverted: offset zero is the newest message.
      atBottom = offset < 100;
      if (!atBottom) pending = false;
    },
    viewportChanged(height: number) { viewport = height; return ready && atBottom; },
    contentChanged() { const follow = ready && pending; pending = false; return follow; },
    readingOlder() { atBottom = false; pending = false; },
    requestBottom() { atBottom = true; pending = true; },
    isAtBottom() { return atBottom; },
  };
}
