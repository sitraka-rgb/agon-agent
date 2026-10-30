import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { engine, backendMode } from '../lib/backend';
import type { Conversation, Message, Profile } from '../lib/types';

export interface AppContextValue {
  mode: 'demo' | 'live';
  me: Profile | null;
  isAdmin: boolean;
  booting: boolean;
  profiles: Profile[];
  conversations: Conversation[];
  messagesByConversation: Record<string, Message[]>;
  activeConversationId: string | null;
  setActiveConversationId: (id: string | null) => void;
  unreadByConversation: Record<string, number>;
  totalUnread: number;
  isOnline: (profile: Profile | null | undefined) => boolean;
  signIn: (identifier: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  sendMessage: (conversationId: string, content: string) => Promise<void>;
  markConversationRead: (conversationId: string) => Promise<void>;
  updateDisplayName: (id: string, displayName: string) => Promise<void>;
  createMember: (input: { identifier: string; displayName: string; password: string; color: string }) => Promise<Profile>;
  resetPassword: (id: string, newPassword: string) => Promise<void>;
  deleteMember: (id: string) => Promise<void>;
  setStatus: (id: string, status: 'active' | 'suspended') => Promise<void>;
  refreshConversations: () => Promise<Conversation[]>;
  toast: (message: string, kind?: 'ok' | 'error') => void;
}

const AppContext = createContext<AppContextValue | null>(null);

const ONLINE_WINDOW_MS = 90_000;

export function AppProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Profile | null>(null);
  const [booting, setBooting] = useState(true);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messagesByConversation, setMessagesByConversation] = useState<Record<string, Message[]>>({});
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; kind: 'ok' | 'error' }>>([]);
  const toastId = useRef(0);
  const activeRef = useRef<string | null>(null);
  activeRef.current = activeConversationId;
  const conversationsRef = useRef<Conversation[]>([]);
  conversationsRef.current = conversations;

  const isAdmin = me?.role === 'admin';

  const toast = useCallback((message: string, kind: 'ok' | 'error' = 'ok') => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-2), { id, message, kind }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  /* ── Initial load: restore session + fetch data ── */
  const loadAll = useCallback(async (sessionProfile: Profile) => {
    const [profs, convs] = await Promise.all([engine.fetchProfiles(), engine.fetchConversations()]);
    setProfiles(profs);
    setConversations(convs);
    // Charger les messages de chaque salon (membre : 1 seul)
    const entries = await Promise.all(
      convs.map(async (c) => [c.id, await engine.fetchMessages(c.id)] as const),
    );
    setMessagesByConversation(Object.fromEntries(entries));
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const session = await engine.restoreSession();
        if (!mounted) return;
        if (session) {
          setMe(session);
          await loadAll(session);
        }
      } catch (err) {
        console.error('[Le Salon] Restauration de session :', err);
      } finally {
        if (mounted) setBooting(false);
      }
    })();
    return () => { mounted = false; };
  }, [loadAll]);

  /* ── Presence heartbeat : my profile + local clock tick ── */
  useEffect(() => {
    if (!me) return;
    const beat = () => {
      if (document.visibilityState === 'visible') {
        engine.heartbeat(me.id).catch(() => {});
        setMe((prev) => (prev ? { ...prev, lastSeenAt: new Date().toISOString() } : prev));
      }
    };
    beat();
    const iv = window.setInterval(beat, 30_000);
    const tickIv = window.setInterval(() => setTick((t) => t + 1), 30_000);
    const onVis = () => {
      if (document.visibilityState === 'visible') beat();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(iv);
      window.clearInterval(tickIv);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [me?.id]);

  /* ── Realtime subscriptions ── */
  const upsertMessage = useCallback((m: Message) => {
    setMessagesByConversation((prev) => {
      const list = prev[m.conversationId] ?? [];
      const idx = list.findIndex((x) => x.id === m.id);
      const next = idx >= 0 ? list.map((x) => (x.id === m.id ? m : x)) : [...list, m];
      next.sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
      return { ...prev, [m.conversationId]: next };
    });
  }, []);

  useEffect(() => {
    if (!me) return;
    const offInsert = engine.onMessageInsert((m) => {
      upsertMessage(m);
      if (me.role === 'admin' && !conversationsRef.current.some((c) => c.id === m.conversationId)) {
        refreshConversations()
          .then((convs) => Promise.all(convs.map((c) => engine.fetchMessages(c.id).then((msgs) => [c.id, msgs] as const))))
          .then((entries) => setMessagesByConversation((prev) => ({ ...prev, ...Object.fromEntries(entries) })))
          .catch(() => {});
      }
      if (m.senderId !== me.id && activeRef.current === m.conversationId && document.visibilityState === 'visible') {
        engine.markConversationRead(m.conversationId, me.id).catch(() => {});
      }
    });
    const offUpdate = engine.onMessageUpdate(upsertMessage);
    const offProfile = engine.onProfileUpdate((p) => {
      setProfiles((prev) => {
        const idx = prev.findIndex((x) => x.id === p.id);
        // Le membre ne voit jamais les autres membres : ne pas injecter d'inconnu
        if (idx < 0) {
          if (me.role === 'admin' && p.role === 'member') return [...prev, p];
          return prev;
        }
        return prev.map((x) => (x.id === p.id ? { ...x, ...p } : x));
      });
      setMe((prev) => (prev && prev.id === p.id ? { ...prev, ...p } : prev));
    });
    return () => { offInsert(); offUpdate(); offProfile(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id, upsertMessage]);

  /* ── Actions exposées ── */

  const signIn = useCallback(async (identifier: string, password: string) => {
    const profile = await engine.signIn(identifier, password);
    setMe(profile);
    await loadAll(profile);
    setActiveConversationId(null);
  }, [loadAll]);

  const signOut = useCallback(async () => {
    await engine.signOut();
    setMe(null);
    setProfiles([]);
    setConversations([]);
    setMessagesByConversation({});
    setActiveConversationId(null);
  }, []);

  const sendMessage = useCallback(async (conversationId: string, content: string) => {
    const sent = await engine.sendMessage(conversationId, content);
    upsertMessage(sent);
  }, [upsertMessage]);

  const markConversationRead = useCallback(async (conversationId: string) => {
    if (!me) return;
    await engine.markConversationRead(conversationId, me.id);
    // Mise à jour locale immédiate (le realtime confirmera)
    setMessagesByConversation((prev) => {
      const list = prev[conversationId];
      if (!list) return prev;
      const nowIso = new Date().toISOString();
      const next = list.map((m) =>
        m.senderId !== me.id && !m.readAt ? { ...m, readAt: nowIso } : m,
      );
      return { ...prev, [conversationId]: next };
    });
  }, [me]);

  const updateDisplayName = useCallback(async (id: string, displayName: string) => {
    const updated = await engine.updateDisplayName(id, displayName);
    setProfiles((prev) => prev.map((p) => (p.id === id ? { ...p, ...updated } : p)));
    setMe((prev) => (prev && prev.id === id ? { ...prev, ...updated } : prev));
  }, []);

  const createMember = useCallback(async (input: { identifier: string; displayName: string; password: string; color: string }) => {
    const created = await engine.createMember(input);
    const convs = await engine.fetchConversations();
    setConversations(convs);
    setProfiles((prev) => [...prev, created]);
    const msgs = await engine.fetchMessages(convs.find((c) => c.memberId === created.id)?.id ?? '');
    const conv = convs.find((c) => c.memberId === created.id);
    if (conv) setMessagesByConversation((prev) => ({ ...prev, [conv.id]: msgs }));
    return created;
  }, []);

  const resetPassword = useCallback(async (id: string, newPassword: string) => {
    await engine.resetPassword(id, newPassword);
  }, []);

  const deleteMember = useCallback(async (id: string) => {
    await engine.deleteMember(id);
    setProfiles((prev) => prev.filter((p) => p.id !== id));
    setConversations((prev) => {
      const removed = prev.filter((c) => c.memberId === id);
      setMessagesByConversation((msgs) => {
        const next = { ...msgs };
        removed.forEach((c) => delete next[c.id]);
        return next;
      });
      return prev.filter((c) => c.memberId !== id);
    });
    setActiveConversationId((active) => {
      const stillThere = conversations.some((c) => c.id === active && c.memberId !== id);
      return stillThere ? active : null;
    });
  }, [conversations]);

  const setStatus = useCallback(async (id: string, status: 'active' | 'suspended') => {
    const updated = await engine.setStatus(id, status);
    setProfiles((prev) => prev.map((p) => (p.id === id ? { ...p, ...updated } : p)));
  }, []);

  const refreshConversations = useCallback(async () => {
    const convs = await engine.fetchConversations();
    setConversations(convs);
    return convs;
  }, []);

  /* ── Dérivés : compteurs de non lus + présence ── */

  const unreadByConversation = useMemo(() => {
    if (!me) return {};
    const out: Record<string, number> = {};
    for (const [cid, list] of Object.entries(messagesByConversation)) {
      out[cid] = list.filter((m) => m.senderId !== me.id && !m.readAt).length;
    }
    return out;
  }, [messagesByConversation, me]);

  const totalUnread = useMemo(
    () => Object.values(unreadByConversation).reduce((a, b) => a + b, 0),
    [unreadByConversation],
  );

  const isOnline = useCallback((profile: Profile | null | undefined) => {
    if (!profile) return false;
    return Date.now() - +new Date(profile.lastSeenAt) < ONLINE_WINDOW_MS;
  }, []);

  const value: AppContextValue = {
    mode: backendMode,
    me,
    isAdmin,
    booting,
    profiles,
    conversations,
    messagesByConversation,
    activeConversationId,
    setActiveConversationId,
    unreadByConversation,
    totalUnread,
    isOnline,
    signIn,
    signOut,
    sendMessage,
    markConversationRead,
    updateDisplayName,
    createMember,
    resetPassword,
    deleteMember,
    setStatus,
    refreshConversations,
    toast,
  };

  return (
    <AppContext.Provider value={value}>
      {children}
      {/* ── Toasts ── */}
      <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 w-[min(92vw,420px)] pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto rounded-xl border px-4 py-2.5 text-sm shadow-2xl backdrop-blur-md ${
              t.kind === 'error'
                ? 'bg-red-950/85 border-red-400/30 text-red-100'
                : 'bg-emerald-950/85 border-emerald-400/30 text-emerald-100'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp doit être utilisé dans <AppProvider>.');
  return ctx;
}
