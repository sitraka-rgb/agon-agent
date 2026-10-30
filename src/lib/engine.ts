import type { Conversation, Message, Profile } from './types';

/**
 * Contrat commun entre les deux moteurs de données :
 *  - DemoEngine    : démo locale (localStorage) — fonctionne hors-ligne, zéro configuration
 *  - SupabaseEngine: production (Supabase Auth + Postgres + RLS + Realtime)
 */
export interface Engine {
  readonly mode: 'demo' | 'live';

  /* ---- Authentification ---- */
  signIn(identifier: string, password: string): Promise<Profile>;
  signOut(): Promise<void>;
  restoreSession(): Promise<Profile | null>;

  /* ---- Lecture ---- */
  fetchAdmin(): Promise<Profile | null>;
  fetchProfiles(): Promise<Profile[]>; // membre : uniquement l'admin
  fetchConversations(): Promise<Conversation[]>; // membre : uniquement la sienne
  fetchMessages(conversationId: string): Promise<Message[]>;

  /* ---- Mutations ---- */
  sendMessage(conversationId: string, content: string): Promise<Message>;
  markConversationRead(conversationId: string, readerId: string): Promise<void>;
  updateDisplayName(id: string, displayName: string): Promise<Profile>;
  setStatus(id: string, status: 'active' | 'suspended'): Promise<Profile>;
  createMember(input: { identifier: string; displayName: string; password: string; color: string }): Promise<Profile>;
  resetPassword(id: string, newPassword: string): Promise<void>;
  deleteMember(id: string): Promise<void>;
  heartbeat(id: string): Promise<void>;

  /* ---- Temps réel (unsubscribe) ---- */
  onMessageInsert(cb: (m: Message) => void): () => void;
  onMessageUpdate(cb: (m: Message) => void): () => void;
  onProfileUpdate(cb: (p: Profile) => void): () => void;
}
