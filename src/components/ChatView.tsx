import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Send, Search, X, Check, CheckCheck, Smile, Paperclip, ShieldCheck,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { Conversation, Message, Profile } from '../lib/types';
import { Avatar, OnlineText, RoleBadge, StatusBadge } from './ui';
import { classNames, dayKey, formatDayLabel, formatMessageTime, formatFullDate } from '../lib/utils';
import { useDebounced } from '../hooks/useDebounced';
import { AnimatePresence, motion } from 'framer-motion';

const QUICK_EMOJIS = ['😀','😂','🙂','😉','😍','🤔','😅','👍','👏','🙏','🎉','❤️','🔥','✨','✅','⚠️','📌','📎','☕','🍷'];

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g;
function renderRichText(text: string, query: string) {
  const q = query.trim().toLowerCase();
  const parts: Array<{ text: string; kind: 'text' | 'link' | 'mark' }> = [];
  let last = 0;
  const pushText = (raw: string) => {
    if (!raw) return;
    if (!q) { parts.push({ text: raw, kind: 'text' }); return; }
    let i = 0;
    const lower = raw.toLowerCase();
    while (i < raw.length) {
      const idx = lower.indexOf(q, i);
      if (idx === -1) { parts.push({ text: raw.slice(i), kind: 'text' }); break; }
      if (idx > i) parts.push({ text: raw.slice(i, idx), kind: 'text' });
      parts.push({ text: raw.slice(idx, idx + q.length), kind: 'mark' });
      i = idx + q.length;
    }
  };
  for (const match of text.matchAll(URL_RE)) {
    const idx = match.index ?? 0;
    pushText(text.slice(last, idx));
    parts.push({ text: match[0], kind: 'link' });
    last = idx + match[0].length;
  }
  pushText(text.slice(last));
  return parts.map((p, i) => {
    if (p.kind === 'link')
      return <a key={i} href={p.text} target="_blank" rel="noreferrer noopener" className="underline decoration-amber-200/50 underline-offset-2 text-goldbright break-all">{p.text}</a>;
    if (p.kind === 'mark') return <mark key={i} className="salon-mark">{p.text}</mark>;
    return <span key={i}>{p.text}</span>;
  });
}
const isImageUrl = (url: string) => /\.(png|jpe?g|gif|webp|avif)(\?\S*)?$/i.test(url);
const urlsOf = (text: string) => Array.from(text.matchAll(URL_RE)).map((m) => m[0]);

interface ChatViewProps {
  conversation: Conversation;
  counterpart: Profile;
  isActive: boolean; // true = visible (mobile detail) or desktop (always visible)
  onOpenMemberActions?: () => void;
}

export default function ChatView({ conversation, counterpart, isActive, onOpenMemberActions }: ChatViewProps) {
  const {
    me, isAdmin, messagesByConversation, sendMessage, markConversationRead,
    isOnline, toast,
  } = useApp();
  const navigate = useNavigate();
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [otherTyping, setOtherTyping] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const typingTimeout = useRef<number | null>(null);
  const typingChannel = useRef<BroadcastChannel | null>(null);

  const messages = messagesByConversation[conversation.id] ?? [];
  const debouncedSearch = useDebounced(search, 200);
  const online = isOnline(counterpart);

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return messages;
    return messages.filter((m) => m.content.toLowerCase().includes(q));
  }, [messages, debouncedSearch]);

  /* Marquage "lu" dès que la conversation est visible et active */
  useEffect(() => {
    if (isActive && me && messages.some((m) => m.senderId !== me.id && !m.readAt)) {
      markConversationRead(conversation.id).catch(() => {});
    }
  }, [isActive, messages, conversation.id, me, markConversationRead]);

  /* Défilement automatique en bas */
  const lastId = messages.length ? messages[messages.length - 1].id : null;
  useEffect(() => {
    if (!isActive) return;
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [lastId, isActive]);

  /* Hauteur automatique du champ de saisie */
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 150) + 'px';
  }, [draft]);

  /* Canal "en train d'écrire" (local à l'appareil pour la démo ; Supabase Realtime en live) */
  useEffect(() => {
    try {
      const bc = new BroadcastChannel(`salon-typing-${conversation.id}`);
      typingChannel.current = bc;
      bc.onmessage = (e) => {
        if (e.data?.from !== me?.id) {
          setOtherTyping(true);
          if (typingTimeout.current) window.clearTimeout(typingTimeout.current);
          typingTimeout.current = window.setTimeout(() => setOtherTyping(false), 2600);
        }
      };
      return () => {
        bc.close();
        typingChannel.current = null;
        if (typingTimeout.current) window.clearTimeout(typingTimeout.current);
      };
    } catch {
      return;
    }
  }, [conversation.id, me?.id]);

  function notifyTyping() {
    try { typingChannel.current?.postMessage({ from: me?.id }); } catch { /* canal indisponible */ }
  }

  async function onSubmit(e?: FormEvent) {
    e?.preventDefault();
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    setDraft('');
    try {
      await sendMessage(conversation.id, content);
    } catch (err) {
      setDraft(content);
      toast(err instanceof Error ? err.message : "Envoi impossible.", 'error');
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void onSubmit();
    }
  }

  /* Regroupement par jour */
  const dayGroups = useMemo(() => {
    const groups: Array<{ key: string; label: string; items: Message[] }> = [];
    for (const m of filtered) {
      const k = dayKey(m.createdAt);
      const last = groups[groups.length - 1];
      if (last && last.key === k) last.items.push(m);
      else groups.push({ key: k, label: formatDayLabel(m.createdAt), items: [m] });
    }
    return groups;
  }, [filtered]);

  const counterpartSuspended = counterpart.status === 'suspended';

  return (
    <div className="relative flex flex-col h-full min-h-0 bg-transparent">
      {/* ══════════ En-tête du salon ══════════ */}
      <div className="shrink-0 flex items-center gap-2 sm:gap-3 px-2 sm:px-4 h-14 sm:h-[64px] border-b border-amber-100/[0.08] bg-salon-900/70 backdrop-blur-xl">
        <button className="icon-btn md:hidden" onClick={() => navigate('/messages')} aria-label="Retour à la liste des salons">
          <ArrowLeft size={20} />
        </button>

        <Avatar name={counterpart.displayName} color={counterpart.color} size={38} online={online} className="sm:hidden" />
        <Avatar name={counterpart.displayName} color={counterpart.color} size={42} online={online} className="hidden sm:block" />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-display font-semibold text-[14px] sm:text-[15px] text-cream truncate leading-tight">
              {counterpart.displayName}
            </p>
            {counterpart.role === 'admin' && <RoleBadge role="admin" />}
            {counterpartSuspended && <StatusBadge status="suspended" />}
          </div>
          <OnlineText online={online} lastSeen={counterpart.lastSeenAt} />
        </div>

        <button className={classNames('icon-btn', searchOpen && 'text-goldbright bg-amber-100/[0.07]')} onClick={() => setSearchOpen((v) => !v)} aria-label="Rechercher dans ce salon">
          <Search size={18} />
        </button>
        {isAdmin && onOpenMemberActions && (
          <button className="icon-btn" onClick={onOpenMemberActions} aria-label="Gérer ce membre" title="Gérer ce membre">
            <ShieldCheck size={18} />
          </button>
        )}
      </div>

      {/* Bandeau de recherche */}
      <AnimatePresence>
        {searchOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="shrink-0 overflow-hidden border-b border-amber-100/[0.08] bg-salon-900/85"
          >
            <div className="flex items-center gap-2 px-3 sm:px-4 py-2">
              <Search size={15} className="text-sage shrink-0" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher dans ce salon…"
                className="flex-1 bg-transparent outline-none text-[13px] placeholder:text-sage/60 text-cream py-1.5"
                aria-label="Rechercher dans les messages"
              />
              {search && (
                <span className="text-[11px] text-gold/90 font-medium whitespace-nowrap">
                  {filtered.length} résultat{filtered.length > 1 ? 's' : ''}
                </span>
              )}
              <button className="icon-btn !w-8 !h-8" onClick={() => { setSearch(''); setSearchOpen(false); }} aria-label="Fermer la recherche">
                <X size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════ Fil des messages ══════════ */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto scroll-slim px-3 sm:px-6 py-4" style={{ background: 'radial-gradient(1000px 500px at 50% -10%, rgba(47,191,143,0.05), transparent 55%)' }}>
        <div className="max-w-3xl mx-auto">
          {filtered.length === 0 && (
            <p className="text-center text-[12px] text-sage py-10">
              {debouncedSearch.trim() ? 'Aucun message ne correspond à votre recherche.' : 'La conversation est vierge. Dites bonjour.'}
            </p>
          )}

          {dayGroups.map((group) => (
            <div key={group.key}>
              <div className="flex items-center gap-3 my-4">
                <span className="flex-1 h-px bg-gradient-to-r from-transparent via-amber-100/15 to-transparent" />
                <span className="text-[10px] uppercase tracking-[0.2em] text-amber-100/45 font-semibold whitespace-nowrap">{group.label}</span>
                <span className="flex-1 h-px bg-gradient-to-r from-transparent via-amber-100/15 to-transparent" />
              </div>

              <div className="space-y-1.5">
                {group.items.map((m, idx) => {
                  const mine = m.senderId === me?.id;
                  const prev = group.items[idx - 1];
                  const next = group.items[idx + 1];
                  const sameSenderAsPrev = prev?.senderId === m.senderId;
                  const sameSenderAsNext = next?.senderId === m.senderId;
                  const images = urlsOf(m.content).filter(isImageUrl);
                  return (
                    <div key={m.id} className={classNames('flex', mine ? 'justify-end' : 'justify-start', sameSenderAsPrev ? 'mt-0.5' : 'mt-3')}>
                      <div
                        className={classNames(
                          'relative max-w-[82%] sm:max-w-[68%] px-3.5 pt-2 pb-[7px] text-[13.5px] leading-snug whitespace-pre-wrap break-words',
                          mine ? 'bubble-mine' : 'bubble-in',
                          !sameSenderAsPrev && (mine ? 'rounded-2xl rounded-br-md' : 'rounded-2xl rounded-bl-md'),
                          sameSenderAsPrev && 'rounded-2xl',
                          sameSenderAsNext && (mine ? 'rounded-br-md' : 'rounded-bl-md'),
                        )}
                        title={formatFullDate(m.createdAt)}
                      >
                        {renderRichText(m.content, debouncedSearch)}

                        {images.map((src) => (
                          <button key={src} onClick={() => setLightbox(src)} className="block mt-2 rounded-lg overflow-hidden border border-black/30 hover:opacity-95 transition-opacity">
                            <img src={src} alt="Pièce jointe" className="max-h-56 sm:max-h-64 w-auto max-w-full object-cover" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                          </button>
                        ))}

                        <span className={classNames('flex items-center gap-1.5 mt-1', mine ? 'justify-end' : 'justify-start')}>
                          <span className="text-[9.5px] tabular-nums text-white/45">{formatMessageTime(m.createdAt)}</span>
                          {mine && (
                            m.readAt
                              ? <CheckCheck size={13} className="text-emerald-300" aria-label="Lu" />
                              : <Check size={13} className="text-white/45" aria-label="Envoyé" />
                          )}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Indicateur de frappe */}
          {otherTyping && (
            <div className="flex justify-start mt-3">
              <div className="bubble-in rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1.5">
                <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>

      {/* ══════════ Zone de saisie ══════════ */}
      <form onSubmit={onSubmit} className="shrink-0 border-t border-amber-100/[0.08] bg-salon-900/80 backdrop-blur-xl px-2 sm:px-4 pt-2 pb-2 sm:pb-3" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom, 0px))' }}>
        <div className="max-w-3xl mx-auto relative">
          {/* Sélecteur d'emojis */}
          <AnimatePresence>
            {emojiOpen && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.97 }}
                className="absolute bottom-[calc(100%+10px)] left-0 z-20 flex flex-wrap gap-1 rounded-2xl border border-amber-100/15 bg-salon-800/95 backdrop-blur-xl p-2 shadow-2xl max-w-[280px]"
                role="menu"
              >
                {QUICK_EMOJIS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    className="w-9 h-9 text-lg rounded-lg hover:bg-white/10 transition-colors"
                    onClick={() => { setDraft((d) => d + em); setEmojiOpen(false); textareaRef.current?.focus(); }}
                  >
                    {em}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-end gap-1.5 sm:gap-2">
            <button type="button" className={classNames('icon-btn mb-1', emojiOpen && 'text-goldbright bg-amber-100/[0.07]')} onClick={() => setEmojiOpen((v) => !v)} aria-label="Insérer un emoji">
              <Smile size={21} />
            </button>
            <label className="icon-btn mb-1 cursor-pointer" title="Coller un lien d'image pour l'afficher" aria-label="Insérer une image">
              <Paperclip size={20} />
              <input
                type="text"
                className="sr-only"
                onFocus={(e) => {
                  const url = window.prompt('Collez l’adresse (URL) de l’image à afficher :');
                  if (url && /^https?:\/\/\S+$/i.test(url.trim())) {
                    setDraft((d) => (d ? d + ' ' + url.trim() : url.trim()));
                  }
                  e.currentTarget.blur();
                }}
              />
            </label>
            <textarea
              ref={textareaRef}
              rows={1}
              value={draft}
              onChange={(e) => { setDraft(e.target.value); notifyTyping(); }}
              onKeyDown={onKeyDown}
              placeholder={counterpartSuspended && !isAdmin ? 'Compte suspendu : envoi bloqué…' : 'Votre message…'}
              className="flex-1 resize-none bg-salon-800/80 border border-amber-100/[0.09] focus:border-amber-200/30 focus:bg-salon-800 rounded-2xl px-4 py-[11px] text-[14px] leading-snug text-cream placeholder:text-sage/55 outline-none transition-all max-h-[150px] scroll-slim"
              aria-label="Votre message"
            />
            <button
              type="submit"
              disabled={!draft.trim() || sending}
              className="mb-1 w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 transition-all bg-gradient-to-br from-goldbright via-gold to-golddeep text-salon-950 border border-amber-100/40 shadow-[0_8px_22px_-6px_rgba(217,180,91,0.45)] disabled:opacity-35 disabled:shadow-none disabled:cursor-not-allowed hover:brightness-110 active:scale-95"
              aria-label="Envoyer le message"
            >
              <Send size={18} strokeWidth={2.2} className="translate-x-[1px]" />
            </button>
          </div>
        </div>
      </form>

      {/* Visionneuse d'image */}
      {lightbox && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/85 backdrop-blur-sm" role="dialog" aria-label="Aperçu de l'image" onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 icon-btn !text-cream" onClick={() => setLightbox(null)} aria-label="Fermer">
            <X size={22} />
          </button>
          <img src={lightbox} alt="Pièce jointe en plein écran" className="max-w-[92vw] max-h-[85vh] rounded-xl shadow-2xl" />
        </div>
      )}
    </div>
  );
}
