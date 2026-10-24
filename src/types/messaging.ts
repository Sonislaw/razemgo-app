import type { ProfileAvatarId } from './avatar';
import type { TripPlan } from './travel';

export interface MessagingContact {
  id: string;
  name: string;
  avatarId?: ProfileAvatarId;
  adultCount: number;
}
export type InvitationDirection = 'received' | 'sent';
export type InvitationStatus =
  'pending' | 'accepted' | 'declined' | 'withdrawn';
export type MailboxView = 'conversations' | 'invitations';
export type MailboxScenario =
  'initial' | 'conversations' | 'empty' | 'loading' | 'error';
export type ReportReason =
  'Spam' | 'Niewłaściwe treści' | 'Podszywanie się' | 'Inny powód';

export interface ContactInvitation {
  id: string;
  groupId: string;
  tripId: string;
  ownTripId?: string;
  direction: InvitationDirection;
  status: InvitationStatus;
  text: string;
  createdAt: string;
}
export interface Conversation {
  id: string;
  invitationId: string;
  groupId: string;
  tripId: string;
  unreadCount?: number;
  blocked?: boolean;
  updatedAt?: string;
  selfReadSequence?: number;
  otherReadSequence?: number;
}
export interface ChatMessage {
  id: string;
  conversationId: string;
  sender: 'self' | 'other';
  text: string;
  createdAt: string;
  status: 'sent' | 'failed' | 'sending';
  read: boolean;
  sequence?: number;
  requestKey?: string;
}
export interface LocalReport {
  id: string;
  conversationId: string;
  groupId: string;
  reason: ReportReason;
}
export interface MessagingSeed {
  invitations: ContactInvitation[];
  acceptedInvitations: ContactInvitation[];
  conversations: Conversation[];
  messages: ChatMessage[];
}
export interface MessagingState {
  contacts?: Record<string, MessagingContact>;
  trips?: Record<string, TripPlan>;
  invitations: ContactInvitation[];
  conversations: Conversation[];
  messages: ChatMessage[];
  blockedGroupIds: string[];
  reports: LocalReport[];
  nextSequence: number;
  view: MailboxView;
  direction: InvitationDirection;
  loadStatus: 'ready' | 'loading' | 'error';
  simulateSendError: boolean;
}
