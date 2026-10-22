import { createContext, useContext, useReducer, type ReactNode } from 'react';
import { markNotificationsRead } from './notification-state';

interface NotificationsContextValue {
  readKeys: string[];
  markRead: (keys: string[]) => void;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(
  null,
);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [readKeys, markRead] = useReducer(markNotificationsRead, []);
  return (
    <NotificationsContext value={{ readKeys, markRead }}>
      {children}
    </NotificationsContext>
  );
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) throw new Error('NotificationsProvider is required');
  return context;
}
