import {
  createContext,
  useContext,
  useReducer,
  type Dispatch,
  type ReactNode,
} from 'react';
import { DEMO_MAILBOX } from '@/data/mocks/messaging';
import { USE_DEMO_DATA } from '@/constants/app';
import type { MessagingState } from '@/types/messaging';
import {
  createMessagingState,
  messagingReducer,
  type MessagingAction,
} from './messaging-state';

interface MessagingContextValue {
  state: MessagingState;
  dispatch: Dispatch<MessagingAction>;
}
const MessagingContext = createContext<MessagingContextValue | null>(null);
export function MessagingProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(messagingReducer, DEMO_MAILBOX, (seed) =>
    createMessagingState(seed, USE_DEMO_DATA ? 'initial' : 'empty'),
  );
  return (
    <MessagingContext value={{ state, dispatch }}>{children}</MessagingContext>
  );
}
export function useMessaging() {
  const value = useContext(MessagingContext);
  if (!value) throw new Error('MessagingProvider is required');
  return value;
}
