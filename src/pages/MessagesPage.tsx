import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Search, MessageSquarePlus, ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import { useApp } from '../context/AppContext';
import ChatView from '../components/ChatView';
import MemberActionsModal from '../components/MemberActionsModal';
import CreateMemberModal from '../components/CreateMemberModal';
import { Avatar, EmptyState } from '../components/ui';
import { classNames, formatMessageTime, formatDayLabel, dayKey } from '../lib/utils';
import type { Profile } from '../lib/types';

type Filter = 'all' | 'unread';

function previewText(content: string): string {
  const clean = content.replace(/\s+/g, ' ').trim();
  return clean.length > 90 ? clean.slice(0, 90) + '…' : clean;
}

function timestampLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return formatMessageTime(iso);
  const yesterday = new Date(now.getTime() - 86400000);
  if (d.toDateString() === yesterday.toDateString()) return 'Hier';
  return formatDayLabel(iso);
}

export default function MessagesPage() {
  const { conversationId } = useParams<{ conversationId?: string }>();
  const {
    me, isAdmin, profiles, conversations, messagesByConversation, unreadByConversation,
    isOnline, setActiveConversationId,
  } = useApp();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [memberActions, setMemberActions] = useState<Profile | null>(null);

  const activeId = conversationId ?? conversations[0]?.id ?? null;

  useEffect(() => {
    setActiveConversationId(activeId);
    return () => setActiveConversationId(null);
  }, [activeId, setActiveConversationId]);

  // Pour le membre : synchroniser l'URL si absente
  useEffect(() => {
    if (!isAdmin && conversations.length === 1 && !conversationId) {
      navigate(`/messages/${conversations[0].id}`, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, conversations.length, conversationId]);

  const counterpartOf = useMemo(() => {
    const map = new Map<string, Profile>();
    for (const c of conversations) {
      const otherId = me?.role === 'admin' ? c.memberId : c.adminId;
      const other = profiles.find((p) => p.id === otherId);
      if (other) map.set(c.id, other);
    }
    return map;
  }, [conversations, profiles, me]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations
      .map((c) => {
        const counterpart = counterpartOf.get(c.id);
        const msgs = messagesByConversation[c.id] ?? [];
        const last = msgs.length ? msgs[msgs.length - 1] : null;
        return { conversation: c, counterpart, last, unread: unreadByConversation[c.id] ?? 0 };
      })
      .filter((row) => row.counterpart)
      .filter((row) => (filter === 'unread' ? row.unread > 0 : true))
      .filter((row) =>
        !q
          ? true
          : row.counterpart!.displayName.toLowerCase().includes(q) ||
            row.counterpart!.identifier.toLowerCase().includes(q),
      )
      .sort((a, b) => {
        const ta = a.last ? +new Date(a.last.createdAt) : +new Date(a.conversation.createdAt);
        const tb = b.last ? +new Date(b.last.createdAt) : +new Date(b.conversation.createdAt);
        return tb - ta;
      });
  }, [conversations, counterpartOf, messagesByConversation, unreadByConversation, filter, query]);

  const activeConversation = conversations.find((c) => c.id === activeId) ?? null;
  const activeCounterpart = activeConversation ? counterpartOf.get(activeConversation.id) ?? null : null;
  const showDetail = Boolean(activeConversation && activeCounterpart);

  /* ═══ Vue MEMBRE : un seul salon ═══ */
  if (!isAdmin) {
    return (
      <div className="h-full min-h-0 flex flex-col">
        {showDetail ? (
          <ChatView conversation={activeConversation!} counterpart={activeCounterpart!} isActive />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sage text-sm">Chargement de votre salon privé…</p>
          </div>
        )}
      </div>
    );
  }

  /* ═══ Vue ADMIN : liste (rail) + conversation (détail) ═══ */
  return (
    <div className="h-full min-h-0 flex">
      {/* ── Rail de salons ── */}
      <aside
        className={classNames(
          'shrink-0 w-full md:w-[340px] xl:w-[380px] flex-col min-h-0 border-r border-amber-100/[0.07] bg-salon-900/40',
          showDetail && conversationId ? 'hidden md:flex' : 'flex',
        )}
        aria-label="Salons privés"
      >
        <div className="shrink-0 px-4 pt-4 pb-3 border-b border-amber-100/[0.06]">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div>
              <h1 className="font-display text-xl font-semibold text-cream leading-none">Salons privés</h1>
              <p className="text-[10.5px] text-sage mt-1.5 uppercase tracking-[0.18em]">
                {rows.length} conversation{rows.length > 1 ? 's' : ''}
              </p>
            </div>
            <button className="btn-gold !px-3.5 !py-2.5 text-[12px]" onClick={() => setShowCreate(true)} title="Créer un compte membre">
              <MessageSquarePlus size={16} /> Nouveau membre
            </button>
          </div>

          <div className="relative">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sage pointer-events-none" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un membre…"
              className="field !pl-10 !py-2.5 !text-[13px] !rounded-xl"
              aria-label="Rechercher un membre"
            />
          </div>

          <div className="flex items-center gap-1.5 mt-2.5" role="tablist" aria-label="Filtrer les salons">
            {(['all', 'unread'] as Filter[]).map((f) => (
              <button
                key={f}
                role="tab"
                aria-selected={filter === f}
                onClick={() => setFilter(f)}
                className={classNames(
                  'px-3.5 py-1.5 rounded-full text-[11px] font-semibold uppercase tracking-[0.12em] transition-all border',
                  filter === f
                    ? 'bg-amber-100/10 text-goldbright border-amber-200/25'
                    : 'text-sage border-transparent hover:text-cream',
                )}
              >
                {f === 'all' ? 'Tous' : 'Non lus'}
              </button>
            ))}
          </div>
        </div>

        {/* Liste des membres */}
        <div className="flex-1 min-h-0 overflow-y-auto scroll-slim py-2">
          {rows.length === 0 ? (
            <EmptyState
              icon={<MessageSquarePlus size={26} />}
              title={query || filter === 'unread' ? 'Aucun résultat' : 'Aucun membre pour l’instant'}
              hint={query || filter === 'unread' ? 'Essayez un autre filtre ou un autre nom.' : 'Créez le premier compte membre : un salon privé s’ouvrira automatiquement.'}
            />
          ) : (
            rows.map(({ conversation, counterpart, last, unread }) => {
              const isActive = activeId === conversation.id;
              const online = isOnline(counterpart!);
              const mine = last?.senderId === me?.id;
              return (
                <button
                  key={conversation.id}
                  onClick={() => navigate(`/messages/${conversation.id}`)}
                  className={classNames(
                    'w-full flex items-center gap-3 px-4 py-3 text-left transition-all border-l-2',
                    isActive
                      ? 'bg-gradient-to-r from-amber-100/[0.09] to-transparent border-gold'
                      : 'border-transparent hover:bg-white/[0.03]',
                  )}
                  aria-current={isActive ? 'true' : undefined}
                >
                  <Avatar name={counterpart!.displayName} color={counterpart!.color} size={48} online={online} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="font-semibold text-[13.5px] text-cream truncate">{counterpart!.displayName}</span>
                      {last && <span className="text-[10px] tabular-nums text-sage shrink-0">{timestampLabel(last.createdAt)}</span>}
                    </span>
                    <span className="flex items-center justify-between gap-2 mt-0.5">
                      <span className="text-[11.5px] text-sage truncate">
                        {last ? (
                          <>
                            <span className="text-cream/55 font-medium">{mine ? 'Vous : ' : ''}</span>
                            {previewText(last.content)}
                          </>
                        ) : (
                          <span className="italic text-sage/70">Salon ouvert — dites bonjour</span>
                        )}
                      </span>
                      {unread > 0 && (
                        <span className="unread-badge shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-gold text-salon-950 text-[10px] font-extrabold flex items-center justify-center">
                          {unread}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* ── Détail conversation ── */}
      <section className={classNames('flex-1 min-w-0 min-h-0 flex-col', conversationId && showDetail ? 'flex' : 'hidden md:flex')}>
        {showDetail ? (
          <ChatView
            key={activeConversation!.id}
            conversation={activeConversation!}
            counterpart={activeCounterpart!}
            isActive
            onOpenMemberActions={() => setMemberActions(activeCounterpart!)}
          />
        ) : (
          <div className="hidden md:flex flex-1 items-center justify-center panel-grain">
            <EmptyState
              icon={<ShieldCheck size={30} />}
              title="Sélectionnez un salon"
              hint="Chaque membre dispose d'un salon privé avec vous. Les membres ne peuvent ni se voir ni se contacter entre eux."
            />
          </div>
        )}
      </section>

      {/* Modales */}
      {showCreate && <CreateMemberModal onClose={() => setShowCreate(false)} />}
      {memberActions && <MemberActionsModal member={memberActions} onClose={() => setMemberActions(null)} />}
    </div>
  );
}
