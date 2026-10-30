import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Users, MessagesSquare, MailQuestion, UserCheck, ArrowRight, UserPlus,
  ShieldCheck, Clock, Inbox,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useApp } from '../context/AppContext';
import CreateMemberModal from '../components/CreateMemberModal';
import MemberActionsModal from '../components/MemberActionsModal';
import { Avatar, EmptyState } from '../components/ui';
import { classNames, formatLastSeen, formatMessageTime, formatDayLabel } from '../lib/utils';
import type { Profile } from '../lib/types';

export default function DashboardPage() {
  const {
    me, isAdmin, profiles, conversations, messagesByConversation, unreadByConversation,
    totalUnread, isOnline,
  } = useApp();
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const [memberActions, setMemberActions] = useState<Profile | null>(null);

  const members = useMemo(() => profiles.filter((p) => p.role === 'member'), [profiles]);
  const activeMembers = members.filter((m) => m.status === 'active').length;
  const onlineMembers = members.filter((m) => isOnline(m)).length;
  const totalMessages = useMemo(
    () => Object.values(messagesByConversation).reduce((sum, list) => sum + list.length, 0),
    [messagesByConversation],
  );

  /* Membre : vue simple "mon salon" */
  if (!isAdmin) {
    if (!me) return null;
    const myConversation = conversations[0];
    const unread = myConversation ? unreadByConversation[myConversation.id] ?? 0 : 0;
    return (
      <div className="h-full overflow-y-auto scroll-slim app-ambient">
        <div className="max-w-2xl mx-auto px-5 py-10 sm:py-14">
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <p className="text-[10px] uppercase tracking-[0.3em] text-gold/85 font-semibold">Votre espace privé</p>
            <h1 className="font-display text-3xl sm:text-4xl font-semibold text-cream mt-2 leading-tight">
              Bonjour, {me.displayName.split(' ')[0]}.
            </h1>
            <p className="text-[13px] text-sage mt-2">Ceci est votre salon privé avec l'administrateur du Salon. Personne d'autre n'y a accès.</p>

            <div className="mt-8 rounded-2xl border border-amber-100/12 bg-salon-850/80 panel-grain p-6 flex flex-col sm:flex-row sm:items-center gap-6 shadow-[0_20px_50px_-25px_rgba(0,0,0,0.8)]">
              <Avatar name="Safidy" color="gold" size={84} online={isOnline(profiles.find((p) => p.role === 'admin'))} />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase tracking-[0.22em] text-amber-200/70 font-semibold">Administrateur du Salon</p>
                <p className="font-display text-2xl font-semibold text-cream mt-1">Safidy</p>
                {unread > 0 ? (
                  <p className="mt-1.5 text-[13px] text-goldbright font-medium">{unread} message{unread > 1 ? 's' : ''} non lu{unread > 1 ? 's' : ''}</p>
                ) : (
                  <p className="mt-1.5 text-[12px] text-sage">Aucune réponse en attente.</p>
                )}
              </div>
              <button className="btn-gold shrink-0" onClick={() => myConversation && navigate(`/messages/${myConversation.id}`)}>
                Ouvrir mon salon <ArrowRight size={16} />
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  /* ═══ ADMIN : tableau de bord ═══ */
  const stats = [
    { label: 'Membres', value: members.length, icon: Users, tone: 'text-amber-200 border-amber-200/20 bg-amber-400/[0.06]' },
    { label: 'En ligne', value: onlineMembers, icon: UserCheck, tone: 'text-emerald-300 border-emerald-300/20 bg-emerald-400/[0.06]' },
    { label: 'Messages échangés', value: totalMessages, icon: MessagesSquare, tone: 'text-sky-300 border-sky-300/20 bg-sky-400/[0.06]' },
    { label: 'Non lus', value: totalUnread, icon: MailQuestion, tone: 'text-rose-300 border-rose-300/20 bg-rose-400/[0.06]' },
  ];

  // Non lus par membre, triés
  const perMember = conversations
    .map((c) => {
      const member = members.find((m) => m.id === c.memberId);
      if (!member) return null;
      const msgs = messagesByConversation[c.id] ?? [];
      const last = msgs.length ? msgs[msgs.length - 1] : null;
      return {
        member,
        conversationId: c.id,
        unread: unreadByConversation[c.id] ?? 0,
        last,
        online: isOnline(member),
      };
    })
    .filter(Boolean) as Array<{ member: Profile; conversationId: string; unread: number; last: { content: string; createdAt: string; senderId: string } | null; online: boolean }>;
  const unreadRows = perMember.filter((r) => r.unread > 0).sort((a, b) => b.unread - a.unread);
  const recentRows = [...perMember].filter((r) => r.last).sort((a, b) => +new Date(b.last!.createdAt) - +new Date(a.last!.createdAt)).slice(0, 5);

  return (
    <div className="h-full overflow-y-auto scroll-slim app-ambient">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-9">
        {/* En-tête */}
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-gold/85 font-semibold flex items-center gap-2"><ShieldCheck size={13} /> Espace de Safidy</p>
            <h1 className="font-display text-3xl sm:text-4xl font-semibold text-cream mt-2 leading-none">Tableau de bord</h1>
            <p className="text-[12px] text-sage mt-2">Vue d'ensemble du Salon — {activeMembers} membre{activeMembers > 1 ? 's' : ''} actif{activeMembers > 1 ? 's' : ''} sur {members.length}.</p>
          </div>
          <button className="btn-gold" onClick={() => setShowCreate(true)}>
            <UserPlus size={17} /> Nouveau membre
          </button>
        </div>

        {/* Statistiques */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
          {stats.map(({ label, value, icon: Icon, tone }) => (
            <div key={label} className={classNames('rounded-2xl border px-4 py-4 sm:px-5 sm:py-5', tone)}>
              <Icon size={18} className="opacity-80" />
              <p className="font-display text-2xl sm:text-3xl font-semibold text-cream mt-2 tabular-nums leading-none">{value}</p>
              <p className="text-[10px] sm:text-[10.5px] uppercase tracking-[0.16em] text-sage font-semibold mt-1.5">{label}</p>
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-5 gap-4 sm:gap-5 mt-5 sm:mt-6">
          {/* Non lus */}
          <section className="lg:col-span-2 rounded-2xl border border-amber-100/10 bg-salon-850/70 panel-grain p-4 sm:p-5">
            <h2 className="font-display text-lg font-semibold text-cream flex items-center gap-2"><Inbox size={18} className="text-gold" /> À lire</h2>
            <p className="text-[11px] text-sage mt-0.5 mb-3">Salons avec des messages en attente.</p>
            {unreadRows.length === 0 ? (
              <p className="text-[13px] text-sage/80 italic py-6 text-center">Tout est lu. Excellent.</p>
            ) : (
              <ul className="space-y-1">
                {unreadRows.map(({ member, conversationId, unread }) => (
                  <li key={member.id}>
                    <button onClick={() => navigate(`/messages/${conversationId}`)} className="w-full flex items-center gap-3 rounded-xl px-2.5 py-2.5 hover:bg-white/[0.04] transition-colors text-left">
                      <Avatar name={member.displayName} color={member.color} size={40} online={isOnline(member)} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-semibold text-cream truncate">{member.displayName}</span>
                        <span className="block text-[10.5px] text-sage">{formatLastSeen(member.lastSeenAt)}</span>
                      </span>
                      <span className="min-w-[26px] h-6 px-2 rounded-full bg-gold text-salon-950 text-[11px] font-extrabold flex items-center justify-center">{unread}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Activité récente */}
          <section className="lg:col-span-3 rounded-2xl border border-amber-100/10 bg-salon-850/70 panel-grain p-4 sm:p-5">
            <h2 className="font-display text-lg font-semibold text-cream flex items-center gap-2"><Clock size={18} className="text-gold" /> Activité récente</h2>
            <p className="text-[11px] text-sage mt-0.5 mb-3">Les derniers messages de vos salons.</p>
            {recentRows.length === 0 ? (
              <p className="text-[13px] text-sage/80 italic py-6 text-center">La conversation n'a pas encore commencé.</p>
            ) : (
              <ul className="divide-y divide-white/5">
                {recentRows.map(({ member, conversationId, last }) => (
                  <li key={member.id}>
                    <button onClick={() => navigate(`/messages/${conversationId}`)} className="w-full flex items-center gap-3 py-2.5 hover:bg-white/[0.03] rounded-lg px-2 transition-colors text-left">
                      <Avatar name={member.displayName} color={member.color} size={36} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className="text-[12px] font-semibold text-cream/95 truncate">{member.displayName}</span>
                          <span className="text-[9.5px] text-sage shrink-0">{formatDayLabel(last!.createdAt)} · {formatMessageTime(last!.createdAt)}</span>
                        </span>
                        <span className="block text-[11px] text-sage truncate mt-0.5">
                          {last!.senderId === me?.id ? 'Vous : ' : ''}{last!.content}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Annuaire des membres */}
        <section className="mt-5 sm:mt-6 rounded-2xl border border-amber-100/10 bg-salon-850/70 panel-grain overflow-hidden">
          <div className="flex items-center justify-between px-4 sm:px-5 pt-4 pb-3 border-b border-white/5">
            <h2 className="font-display text-lg font-semibold text-cream flex items-center gap-2"><Users size={18} className="text-gold" /> Membres du Salon</h2>
            <Link to="/messages" className="text-[11px] font-semibold text-gold hover:text-goldbright transition-colors flex items-center gap-1">Tous les salons <ArrowRight size={12} /></Link>
          </div>
          {members.length === 0 ? (
            <EmptyState icon={<Users size={26} />} title="Aucun membre" hint="Créez le premier compte : l'identifiant et le mot de passe vous seront remis à transmettre." />
          ) : (
            <div className="overflow-x-auto scroll-slim">
              <table className="w-full min-w-[560px] text-[13px]">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-[0.18em] text-sage">
                    <th className="px-4 sm:px-5 py-2.5 font-semibold">Membre</th>
                    <th className="px-3 py-2.5 font-semibold">Statut</th>
                    <th className="px-3 py-2.5 font-semibold">Présence</th>
                    <th className="px-4 sm:px-5 py-2.5 font-semibold text-right">Gérer</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => (
                    <tr key={member.id} className="border-t border-white/5 hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 sm:px-5 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={member.displayName} color={member.color} size={38} online={isOnline(member)} />
                          <div className="min-w-0">
                            <p className="font-semibold text-cream truncate max-w-[160px]">{member.displayName}</p>
                            <p className="font-mono text-[10px] text-gold/75">@{member.identifier}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className={classNames('text-[10px] font-bold uppercase tracking-widest', member.status === 'active' ? 'text-emerald-300' : 'text-red-300')}>
                          {member.status === 'active' ? 'Actif' : 'Suspendu'}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-[11px] text-sage whitespace-nowrap">{formatLastSeen(member.lastSeenAt)}</td>
                      <td className="px-4 sm:px-5 py-3 text-right">
                        <button className="btn-ghost !py-1.5 !px-3 text-[11px]" onClick={() => setMemberActions(member)}>Gérer</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {showCreate && <CreateMemberModal onClose={() => setShowCreate(false)} />}
      {memberActions && <MemberActionsModal member={memberActions} onClose={() => setMemberActions(null)} />}
    </div>
  );
}
