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
}
export interface ChatMessage {
  id: string;
  conversationId: string;
  sender: 'self' | 'other';
  text: string;
  createdAt: string;
  status: 'sent' | 'failed';
  read: boolean;
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
