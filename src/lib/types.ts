export type Role = 'admin' | 'member';
export type AccountStatus = 'active' | 'suspended';

export interface Profile {
  id: string;
  identifier: string;
  displayName: string;
  role: Role;
  status: AccountStatus;
  color: string;
  createdAt: string;
  lastSeenAt: string;
}

export interface Conversation {
  id: string;
  adminId: string;
  memberId: string;
  createdAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: string;
  readAt: string | null;
}

export type BackendMode = 'demo' | 'live';

export interface Unsub {
  (): void;
}
