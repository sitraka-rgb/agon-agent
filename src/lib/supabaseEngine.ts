import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import type { Engine } from './engine';
import type { AccountStatus, Conversation, Message, Profile } from './types';

export const TECH_EMAIL_DOMAIN = 'site.local';
const identifierToEmail = (identifier: string) => `${identifier.trim().toLowerCase()}@${TECH_EMAIL_DOMAIN}`;

/* Correspondance snake_case (Postgres) ↔ camelCase (app) */
const fromProfile = (r: any): Profile => ({
  id: r.id, identifier: r.identifier, displayName: r.display_name,
  role: r.role, status: r.status, color: r.color ?? 'emerald',
  createdAt: r.created_at, lastSeenAt: r.last_seen_at,
});
const fromConversation = (r: any): Conversation => ({
  id: r.id, adminId: r.admin_id, memberId: r.member_id, createdAt: r.created_at,
});
const fromMessage = (r: any): Message => ({
  id: r.id, conversationId: r.conversation_id, senderId: r.sender_id,
  content: r.content, createdAt: r.created_at, readAt: r.read_at ?? null,
});

/**
 * SupabaseEngine — branchement production :
 *  - Auth : e-mail technique identifiant@site.local (jamais montré à l'utilisateur)
 *  - Postgres + RLS : le blocage membre↔membre est imposé par la base
 *  - Realtime : postgres_changes sur messages + profiles
 *  - Comptes (création / reset / suppression) : Edge Function admin-api (service_role côté serveur)
 */
export class SupabaseEngine implements Engine {
  readonly mode = 'live' as const;
  private client: SupabaseClient;
  private realtimeChannel: RealtimeChannel | null = null;

  constructor(url: string, anonKey: string) {
    this.client = createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
      realtime: { params: { eventsPerSecond: 20 } },
    });
  }

  /* ───────────────────────── Auth ───────────────────────── */

  async signIn(identifier: string, password: string): Promise<Profile> {
    const email = identifierToEmail(identifier);
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) {
      if (/invalid login credentials/i.test(error.message))
        throw new Error('Identifiant ou mot de passe incorrect.');
      throw new Error(error.message);
    }
    const profile = await this.fetchOwnProfile(data.user.id);
    if (!profile) {
      await this.client.auth.signOut();
      throw new Error('Profil introuvable pour ce compte. Contactez l’administrateur.');
    }
    if (profile.status === 'suspended') {
      await this.client.auth.signOut();
      throw new Error('Ce compte est suspendu. Contactez l’administrateur pour le réactiver.');
    }
    await this.heartbeat(profile.id);
    return profile;
  }

  async signOut(): Promise<void> {
    await this.client.auth.signOut();
  }

  async restoreSession(): Promise<Profile | null> {
    const { data } = await this.client.auth.getSession();
    if (!data.session?.user) return null;
    const profile = await this.fetchOwnProfile(data.session.user.id);
    if (!profile) return null;
    if (profile.status === 'suspended') {
      await this.client.auth.signOut();
      return null;
    }
    await this.heartbeat(profile.id);
    return profile;
  }

  private async fetchOwnProfile(userId: string): Promise<Profile | null> {
    const { data, error } = await this.client.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (error || !data) return null;
    return fromProfile(data);
  }

  /* ─────────────────────── Lecture ──────────────────────── */

  async fetchAdmin(): Promise<Profile | null> {
    const { data, error } = await this.client.from('profiles').select('*').eq('role', 'admin').limit(1).maybeSingle();
    if (error || !data) return null;
    return fromProfile(data);
  }

  async fetchProfiles(): Promise<Profile[]> {
    const { data, error } = await this.client.from('profiles').select('*').order('created_at', { ascending: true });
