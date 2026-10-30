import type { Engine } from './engine';
import type { AccountStatus, Conversation, Message, Profile } from './types';
import { validateIdentifier, validatePassword } from './utils';

/**
 * DémoEngine — moteur de données local (localStorage) reproduisant EXACTEMENT
 * le comportement du backend Supabase :
 *  - identifiants + mots de passe (hachage SHA-256 + sel, jamais en clair)
 *  - un salon privé par membre, créé à la création du compte
 *  - RLS simulée : un membre ne peut JAMAIS voir le profil d'un autre membre
 *  - comptes suspendus : connexion refusée, envoi bloqué
 *  - messages envoyé / lu, compteur de non lus, dernière connexion
 *
 * Aucun compte démo : seul le compte administrateur Safidy est créé.
 */

const DB_KEY = 'lsalon.db.v2';
const SESSION_KEY = 'lsalon.session.v2';
const SALT = 'le-salon-sel-v1';
const ADMIN_IDENTIFIER = 'safidy';
const ADMIN_PASSWORD = '@Safidy15';

interface DemoDb {
  profiles: Profile[];
  credentials: Record<string, string>; // profileId -> hash
  conversations: Conversation[];
  messages: Message[];
}

const now = () => Date.now();
const iso = (ms: number) => new Date(ms).toISOString();
const rid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${now()}-${Math.random().toString(36).slice(2, 10)}`;

async function sha256(text: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Repli non cryptographique (très vieux navigateurs)
  let h1 = 0xdeadbeef ^ 0, h2 = 0x41c6ce57 ^ 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}
const hashPassword = (pw: string) => sha256(`${SALT}:${pw}`);

function seedDb(adminHash: string): DemoDb {
  const t = now();
  const adminId = rid();

  const profiles: Profile[] = [
    { id: adminId, identifier: ADMIN_IDENTIFIER, displayName: 'Safidy', role: 'admin', status: 'active', color: 'gold',
      createdAt: iso(t), lastSeenAt: iso(t) },
  ];

  return {
    profiles,
    credentials: { [adminId]: adminHash },
    conversations: [],
    messages: [],
  };
}

type Listener = (payload: any) => void;

export class DemoEngine implements Engine {
  readonly mode = 'demo' as const;

  private db: DemoDb | null = null;
  private ready: Promise<void>;
  private listeners = new Set<Listener>();
  private bc: BroadcastChannel | null = null;

  constructor() {
    this.ready = this.load();
    try {
      this.bc = new BroadcastChannel(DB_KEY);
      this.bc.onmessage = () => {
        this.db = null;
        void this.reloadQuietly();
        this.emitRaw();
      };
    } catch {
      this.bc = null;
    }
    window.addEventListener('storage', (e) => {
      if (e.key === DB_KEY) {
        this.db = null;
        void this.reloadQuietly();
        this.emitRaw();
      }
    });
  }

  private async load(): Promise<void> {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      try {
        this.db = JSON.parse(raw) as DemoDb;
        return;
      } catch { /* base corrompue → réinitialisation */ }
    }
    this.db = seedDb(await hashPassword(ADMIN_PASSWORD));
    this.persist();
  }

  private async reloadQuietly(): Promise<void> {
    await this.load();
  }

  private persist() {
    if (!this.db) return;
    localStorage.setItem(DB_KEY, JSON.stringify(this.db));
    try { this.bc?.postMessage('changed'); } catch { /* canal indisponible */ }
  }

  private async state(): Promise<DemoDb> {
    await this.ready;
    if (!this.db) throw new Error('Base locale indisponible.');
    return this.db;
  }

  /* ── Realtime local (émission aux abonnés du même onglet) ── */
  private emit(kind: 'insert' | 'update' | 'profile', row: any) {
    this.listeners.forEach((l) => l({ kind, row }));
  }
  private emitRaw() {
    // Après un changement externe, les abonnés relisent via les handlers globaux
    this.listeners.forEach((l) => l({ kind: 'sync', row: null }));
  }

  /* ───────────────────────── Auth ───────────────────────── */

  async signIn(identifier: string, password: string): Promise<Profile> {
    const db = await this.state();
    const s = identifier.trim().toLowerCase();
    const profile = db.profiles.find((p) => p.identifier === s);
    if (!profile) throw new Error('Identifiant ou mot de passe incorrect.');
    const hash = await hashPassword(password);
    if (db.credentials[profile.id] !== hash) throw new Error('Identifiant ou mot de passe incorrect.');
    if (profile.status === 'suspended')
      throw new Error('Ce compte est suspendu. Contactez l’administrateur pour le réactiver.');
    profile.lastSeenAt = iso(now());
    this.persist();
    localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: profile.id }));
    return this.publicProfile(profile);
  }

  async signOut(): Promise<void> {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) {
      try {
        const { userId } = JSON.parse(raw);
        const db = await this.state();
        const p = db.profiles.find((x) => x.id === userId);
        if (p) { p.lastSeenAt = iso(now()); this.persist(); }
      } catch { /* session illisible */ }
    }
    localStorage.removeItem(SESSION_KEY);
  }

  async restoreSession(): Promise<Profile | null> {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try {
      const { userId } = JSON.parse(raw);
      const db = await this.state();
      const p = db.profiles.find((x) => x.id === userId);
      if (!p) { localStorage.removeItem(SESSION_KEY); return null; }
      if (p.status === 'suspended') { localStorage.removeItem(SESSION_KEY); return null; }
      return this.publicProfile(p);
    } catch {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
  }

  /* ─────────────────────── Lecture ──────────────────────── */
  // RLS simulée : un membre ne récupère QUE l'admin — jamais un autre membre.

  private publicProfile(p: Profile): Profile {
    return { ...p };
  }

  async fetchAdmin(): Promise<Profile | null> {
    const db = await this.state();
    const admin = db.profiles.find((p) => p.role === 'admin');
    return admin ? this.publicProfile(admin) : null;
  }

  private sessionUserId(): string | null {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw).userId : null;
    } catch { return null; }
  }

  async fetchProfiles(): Promise<Profile[]> {
    const db = await this.state();
    const me = db.profiles.find((p) => p.id === this.sessionUserId());
    if (me?.role === 'admin') return db.profiles.map((p) => this.publicProfile(p));
    const admin = db.profiles.find((p) => p.role === 'admin');
    return admin ? [this.publicProfile(admin)] : []; // membre : uniquement l'admin
  }

  async fetchConversations(): Promise<Conversation[]> {
    const db = await this.state();
    const me = db.profiles.find((p) => p.id === this.sessionUserId());
    if (!me) return [];
    if (me.role === 'admin') return [...db.conversations];
    return db.conversations.filter((c) => c.memberId === me.id);
  }

  async fetchMessages(conversationId: string): Promise<Message[]> {
    const db = await this.state();
    const me = db.profiles.find((p) => p.id === this.sessionUserId());
    const conv = db.conversations.find((c) => c.id === conversationId);
    if (!me || !conv) return [];
    // RLS : seul l'admin ou le membre de la conversation peut lire
    if (me.role !== 'admin' && conv.memberId !== me.id) return [];
    return db.messages
      .filter((m) => m.conversationId === conversationId)
      .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt))
      .map((m) => ({ ...m }));
  }

  /* ─────────────────────── Mutations ────────────────────── */

  async sendMessage(conversationId: string, content: string): Promise<Message> {
    const db = await this.state();
    const me = db.profiles.find((p) => p.id === this.sessionUserId());
    if (!me) throw new Error('Session expirée. Reconnectez-vous.');
    if (me.status === 'suspended') throw new Error('Compte suspendu : envoi impossible.');
    const conv = db.conversations.find((c) => c.id === conversationId);
    if (!conv) throw new Error('Conversation introuvable.');
    if (me.role !== 'admin' && conv.memberId !== me.id)
      throw new Error('Accès refusé : conversation réservée à l’administrateur.');

    const message: Message = {
      id: rid(), conversationId, senderId: me.id,
      content: content.trim().slice(0, 4000),
      createdAt: iso(now()), readAt: null,
    };
    db.messages.push(message);
    me.lastSeenAt = iso(now());
    this.persist();
    this.emit('insert', { ...message });
    return message;
  }

  async markConversationRead(conversationId: string, readerId: string): Promise<void> {
    const db = await this.state();
    let changed = false;
    for (const m of db.messages) {
      if (m.conversationId === conversationId && m.senderId !== readerId && !m.readAt) {
        m.readAt = iso(now());
        changed = true;
        this.emit('update', { ...m });
      }
    }
    if (changed) this.persist();
  }

  async updateDisplayName(id: string, displayName: string): Promise<Profile> {
    const db = await this.state();
    const me = db.profiles.find((p) => p.id === this.sessionUserId());
    const target = db.profiles.find((p) => p.id === id);
    if (!target) throw new Error('Profil introuvable.');
    const isAdmin = me?.role === 'admin';
    if (!isAdmin && me?.id !== id) throw new Error('Action réservée à l’administrateur.');
    const name = displayName.trim();
    if (name.length < 1 || name.length > 80) throw new Error('Le nom affiché doit contenir entre 1 et 80 caractères.');
    target.displayName = name;
    this.persist();
    this.emit('profile', { ...target });
    return this.publicProfile(target);
  }

  async setStatus(id: string, status: AccountStatus): Promise<Profile> {
    const db = await this.state();
    const me = db.profiles.find((p) => p.id === this.sessionUserId());
    if (me?.role !== 'admin') throw new Error('Action réservée à l’administrateur.');
    const target = db.profiles.find((p) => p.id === id);
    if (!target) throw new Error('Membre introuvable.');
    if (target.role === 'admin') throw new Error('Le compte administrateur ne peut pas être suspendu.');
    target.status = status;
    this.persist();
    this.emit('profile', { ...target });
    return this.publicProfile(target);
  }

  async createMember(input: { identifier: string; displayName: string; password: string; color: string }): Promise<Profile> {
    const db = await this.state();
    const me = db.profiles.find((p) => p.id === this.sessionUserId());
    if (me?.role !== 'admin') throw new Error('Action réservée à l’administrateur.');

    const identifier = input.identifier.trim().toLowerCase();
    const idError = validateIdentifier(identifier);
    if (idError) throw new Error(idError);
    if (db.profiles.some((p) => p.identifier === identifier))
      throw new Error('Cet identifiant est déjà utilisé.');
    const pwError = validatePassword(input.password);
    if (pwError) throw new Error(pwError);
    const displayName = input.displayName.trim();
    if (displayName.length < 2) throw new Error('Le nom affiché doit contenir au moins 2 caractères.');

    const member: Profile = {
      id: rid(), identifier, displayName,
      role: 'member', status: 'active',
      color: input.color || 'emerald',
      createdAt: iso(now()), lastSeenAt: iso(now()),
    };
    db.profiles.push(member);
    db.credentials[member.id] = await hashPassword(input.password);
    db.conversations.push({ id: rid(), adminId: me.id, memberId: member.id, createdAt: iso(now()) });
    this.persist();
    this.emit('profile', { ...member });
    return this.publicProfile(member);
  }

  async resetPassword(id: string, newPassword: string): Promise<void> {
    const db = await this.state();
    const me = db.profiles.find((p) => p.id === this.sessionUserId());
    if (me?.role !== 'admin') throw new Error('Action réservée à l’administrateur.');
    const target = db.profiles.find((p) => p.id === id);
    if (!target) throw new Error('Membre introuvable.');
    if (target.role === 'admin') throw new Error('Le mot de passe de l’administrateur ne peut pas être réinitialisé ici.');
    const pwError = validatePassword(newPassword);
    if (pwError) throw new Error(pwError);
    db.credentials[id] = await hashPassword(newPassword);
    this.persist();
  }

  async deleteMember(id: string): Promise<void> {
    const db = await this.state();
    const me = db.profiles.find((p) => p.id === this.sessionUserId());
    if (me?.role !== 'admin') throw new Error('Action réservée à l’administrateur.');
    const target = db.profiles.find((p) => p.id === id);
    if (!target) throw new Error('Membre introuvable.');
    if (target.role === 'admin') throw new Error('Le compte administrateur ne peut pas être supprimé.');

    const convIds = db.conversations.filter((c) => c.memberId === id).map((c) => c.id);
    db.messages = db.messages.filter((m) => !convIds.includes(m.conversationId));
    db.conversations = db.conversations.filter((c) => c.memberId !== id);
    delete db.credentials[id];
    db.profiles = db.profiles.filter((p) => p.id !== id);
    this.persist();
    this.emit('profile', { ...target, status: 'suspended' }); // force le rafraîchissement
  }

  async heartbeat(id: string): Promise<void> {
    const db = await this.state();
    const p = db.profiles.find((x) => x.id === id);
    if (!p) return;
    p.lastSeenAt = iso(now());
    this.persist();
  }

  /* ─────────────────────── Realtime ─────────────────────── */

  onMessageInsert(cb: (m: Message) => void) {
    const l: Listener = ({ kind, row }) => {
      if (kind === 'insert' && row) cb(row as Message);
      else if (kind === 'sync') void this.refetchInto(cb, 'insert');
    };
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  onMessageUpdate(cb: (m: Message) => void) {
    const l: Listener = ({ kind, row }) => {
      if (kind === 'update' && row) cb(row as Message);
      else if (kind === 'sync') void this.refetchInto(cb, 'update');
    };
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  onProfileUpdate(cb: (p: Profile) => void) {
    const l: Listener = ({ kind, row }) => {
      if (kind === 'profile' && row) cb(row as Profile);
      else if (kind === 'sync') void this.refetchProfilesInto(cb);
    };
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  private async refetchInto(cb: (m: Message) => void, _kind: string) {
    // Changement venant d'un autre onglet : on ré-émet tous les messages.
    // AppContext fait des upserts idempotents, donc c'est sans effet néfaste.
    const db = await this.state();
    for (const m of db.messages) cb({ ...m });
  }
  private async refetchProfilesInto(cb: (p: Profile) => void) {
    const db = await this.state();
    for (const p of db.profiles) cb({ ...p });
  }
}

// Aide pour réinitialiser la démo depuis les réglages
export async function resetDemoDatabase(): Promise<void> {
  localStorage.removeItem(DB_KEY);
  localStorage.removeItem(SESSION_KEY);
}
