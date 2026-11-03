import type { ReactNode } from 'react';
export function MapListLayer({
  hidden,
  children,
}: {
  hidden: boolean;
  children: ReactNode;
}) {
  return (
    <div
      inert={hidden}
      aria-hidden={hidden}
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        visibility: hidden ? 'hidden' : 'visible',
      }}
    >
      {children}
    </div>
  );
}
