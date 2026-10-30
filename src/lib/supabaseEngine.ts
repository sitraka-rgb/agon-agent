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
    if (error) throw new Error(error.message);
    return (data ?? []).map(fromProfile);
  }

  async fetchConversations(): Promise<Conversation[]> {
    const { data, error } = await this.client.from('conversations').select('*');
    if (error) throw new Error(error.message);
    return (data ?? []).map(fromConversation);
  }

  async fetchMessages(conversationId: string): Promise<Message[]> {
    const { data, error } = await this.client
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(1000);
    if (error) throw new Error(error.message);
    return (data ?? []).map(fromMessage);
  }

  /* ─────────────────────── Mutations ────────────────────── */

  async sendMessage(conversationId: string, content: string): Promise<Message> {
    const { data: userData } = await this.client.auth.getUser();
    const senderId = userData.user?.id;
    if (!senderId) throw new Error('Session expirée. Reconnectez-vous.');
    const { data, error } = await this.client
      .from('messages')
      .insert({ conversation_id: conversationId, sender_id: senderId, content: content.trim().slice(0, 4000) })
      .select('*')
      .single();
    if (error) {
      if (/row-level security|violates/i.test(error.message))
        throw new Error('Envoi refusé : compte suspendu ou conversation non autorisée.');
      throw new Error(error.message);
    }
    return fromMessage(data);
  }

  async markConversationRead(conversationId: string, _readerId: string): Promise<void> {
    const { error } = await this.client
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .is('read_at', null)
      .neq('sender_id', _readerId);
    if (error && !/row-level security/i.test(error.message)) {
      // Le marquage "lu" est best-effort : jamais bloquant pour l'UI
      console.warn('[Le Salon] Marquage lu impossible :', error.message);
    }
  }

  async updateDisplayName(id: string, displayName: string): Promise<Profile> {
    const name = displayName.trim();
    if (name.length < 1 || name.length > 80)
      throw new Error('Le nom affiché doit contenir entre 1 et 80 caractères.');
    const { data, error } = await this.client
      .from('profiles')
      .update({ display_name: name })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return fromProfile(data);
  }

  async setStatus(id: string, status: AccountStatus): Promise<Profile> {
    const { data, error } = await this.client
      .from('profiles')
      .update({ status })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return fromProfile(data);
  }

  /* Opérations sensibles → Edge Function admin-api (service_role côté serveur) */
  private async callAdminApi<T = any>(action: string, payload: Record<string, unknown>): Promise<T> {
    // Pass the signed-in user's JWT explicitly. Do not rely on an implicit
    // FunctionsClient auth header: the Edge Function must receive the real
    // user access token (never the anon/publishable API key).
    let { data: sessionData, error: sessionError } = await this.client.auth.getSession();
    if (sessionError) throw new Error(`Impossible de vérifier la session : ${sessionError.message}`);

    let session = sessionData.session;
    const expiresSoon = session?.expires_at != null && session.expires_at <= Math.floor(Date.now() / 1000) + 30;
    if (!session?.access_token || expiresSoon) {
      const refreshed = await this.client.auth.refreshSession();
      if (refreshed.error || !refreshed.data.session?.access_token) {
        throw new Error('Session expirée. Déconnectez-vous puis reconnectez-vous avant de réessayer.');
      }
      session = refreshed.data.session;
    }

    const { data, error } = await this.client.functions.invoke('admin-api', {
      body: { action, ...payload },
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (error) {
      // Essayer d'extraire le message métier renvoyé par la fonction
      let message = error.message;
      const ctx = (error as any).context;
      if (ctx?.json) {
        try {
          const body = await ctx.json();
          if (body?.error) message = body.error;
        } catch { /* corps non JSON */ }
      }
      if (/Failed to fetch|non-2xx|FunctionsHttpError/i.test(message))
        throw new Error('La fonction « admin-api » est injoignable. Déployez-la : supabase functions deploy admin-api');
      throw new Error(message);
    }
    if (data?.error) throw new Error(data.error);
    return data as T;
  }

  async createMember(input: { identifier: string; displayName: string; password: string; color: string }): Promise<Profile> {
    const out = await this.callAdminApi<{ member: { id: string } }>('create_member', {
      identifier: input.identifier,
      displayName: input.displayName,
      password: input.password,
      color: input.color,
    });
    const { data, error } = await this.client.from('profiles').select('*').eq('id', out.member.id).single();
    if (error) throw new Error(error.message);
    return fromProfile(data);
  }

  async resetPassword(id: string, newPassword: string): Promise<void> {
    await this.callAdminApi('reset_password', { userId: id, password: newPassword });
  }

  async deleteMember(id: string): Promise<void> {
    await this.callAdminApi('delete_member', { userId: id });
  }

  async heartbeat(id: string): Promise<void> {
    await this.client.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', id);
  }

  /* ─────────────────────── Realtime ─────────────────────── */

  private ensureChannel(): RealtimeChannel {
    if (this.realtimeChannel) return this.realtimeChannel;
    this.realtimeChannel = this.client.channel('salon-realtime');
    return this.realtimeChannel;
  }

  onMessageInsert(cb: (m: Message) => void): () => void {
    const channel = this.ensureChannel();
    const handler = (payload: any) => cb(fromMessage(payload.new));
    channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, handler);
    this.subscribeIfNeeded();
    return () => { channel.unsubscribe(); this.realtimeChannel = null; };
  }

  onMessageUpdate(cb: (m: Message) => void): () => void {
    const channel = this.ensureChannel();
    const handler = (payload: any) => cb(fromMessage(payload.new));
    channel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, handler);
    this.subscribeIfNeeded();
    return () => { channel.unsubscribe(); this.realtimeChannel = null; };
  }

  onProfileUpdate(cb: (p: Profile) => void): () => void {
    const channel = this.ensureChannel();
    const handler = (payload: any) => { if (payload.new && payload.new.id) cb(fromProfile(payload.new)); };
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, handler);
    this.subscribeIfNeeded();
    return () => { channel.unsubscribe(); this.realtimeChannel = null; };
  }

  private subscribed = false;
  private subscribeIfNeeded() {
    if (this.subscribed) return;
    this.subscribed = true;
    this.realtimeChannel?.subscribe((status) => {
      if (status === 'CHANNEL_ERROR') console.warn('[Le Salon] Realtime : erreur de canal (vérifiez la publication supabase_realtime).');
    });
  }
}
