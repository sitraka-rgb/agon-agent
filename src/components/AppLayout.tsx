import { useEffect, useRef, useState } from 'react';
import { Outlet, NavLink, useNavigate, useLocation, matchPath } from 'react-router-dom';
import { LayoutDashboard, MessagesSquare, Settings, LogOut, Bell, ChevronDown } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Avatar, StatusBadge } from './ui';
import { SalonLogo } from './Logo';
import { classNames } from '../lib/utils';

const NAV_ITEMS = [
  { to: '/', label: 'Accueil', icon: LayoutDashboard, end: true },
  { to: '/messages', label: 'Messages', icon: MessagesSquare, end: false },
  { to: '/reglages', label: 'Réglages', icon: Settings, end: false },
];

function isInChatRoute(pathname: string) {
  return Boolean(matchPath('/messages/:conversationId', pathname));
}

export default function AppLayout() {
  const { me, isAdmin, signOut, totalUnread, toast } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Badge de titre d'onglet avec le compteur de non lus
  useEffect(() => {
    document.title = totalUnread > 0 ? `(${totalUnread}) Le Salon — messagerie privée` : 'Le Salon — messagerie privée';
    return () => { document.title = 'Le Salon — messagerie privée'; };
  }, [totalUnread]);

  const hiddenOnChatMobile = isInChatRoute(location.pathname);

  return (
    <div className="h-[100dvh] flex flex-col bg-salon-950 app-ambient overflow-hidden">
      {/* ══════════ Barre supérieure ══════════ */}
      <header className="relative z-30 shrink-0 border-b border-amber-100/[0.07] bg-salon-900/80 backdrop-blur-xl">
        <div className="mx-auto max-w-[1500px] h-14 sm:h-16 px-3 sm:px-5 flex items-center justify-between gap-2">
          {/* Marque */}
          <NavLink to="/" className="flex items-center gap-2 sm:gap-2.5 shrink-0 min-w-0 py-1.5">
            <SalonLogo size={30} className="sm:hidden" />
            <SalonLogo size={36} className="hidden sm:block" />
            <span className="hidden xs:block sm:block font-display text-[15px] sm:text-lg font-semibold text-cream tracking-wide truncate">
              Le Salon<span className="text-gold"> Privé</span>
            </span>
          </NavLink>

          {/* Navigation desktop / tablette */}
          <nav className="hidden md:flex items-center gap-1 absolute left-1/2 -translate-x-1/2">
            {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  classNames(
                    'relative flex items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-medium transition-all',
                    isActive
                      ? 'text-goldbright bg-amber-100/[0.07] border border-amber-200/15'
                      : 'text-sage hover:text-cream border border-transparent hover:bg-white/[0.04]',
                  )
                }
              >
                <Icon size={16} />
                {label}
                {to === '/messages' && totalUnread > 0 && (
                  <span className="unread-badge min-w-[20px] h-5 px-1.5 rounded-full bg-gold text-salon-950 text-[10px] font-bold flex items-center justify-center">
                    {totalUnread > 99 ? '99+' : totalUnread}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>

          {/* Zone droite */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Cloche avec compteur */}
            <button
              onClick={() => navigate('/messages')}
              className="icon-btn relative"
              aria-label={totalUnread > 0 ? `${totalUnread} message(s) non lu(s)` : 'Aucun message non lu'}
            >
              <Bell size={19} />
              {totalUnread > 0 && (
                <span className="unread-badge absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-gold text-salon-950 text-[9px] font-extrabold flex items-center justify-center border border-salon-900">
                  {totalUnread > 9 ? '9+' : totalUnread}
                </span>
              )}
            </button>

            {/* Menu utilisateur */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-1.5 sm:gap-2 rounded-xl border border-white/[0.06] hover:border-amber-200/20 bg-white/[0.02] hover:bg-white/[0.05] py-1.5 pl-1.5 pr-1.5 sm:pr-2 transition-all"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <Avatar name={me?.displayName ?? '?'} color={me?.color} size={30} online />
                <span className="hidden sm:block text-[12px] font-semibold text-cream/90 max-w-[110px] truncate">
                  {me?.displayName}
                </span>
                <ChevronDown size={14} className={classNames('text-sage transition-transform', menuOpen && 'rotate-180')} />
              </button>

              {menuOpen && (
                <div role="menu" className="absolute right-0 top-[calc(100%+8px)] w-72 rounded-2xl border border-amber-100/12 bg-salon-850 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] overflow-hidden z-50">
                  <div className="px-4 pt-4 pb-3 border-b border-white/5 flex items-center gap-3">
                    <Avatar name={me?.displayName ?? '?'} color={me?.color} size={46} online />
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-cream truncate">{me?.displayName}</p>
                      <p className="font-mono text-[10px] text-gold/80">@{me?.identifier}</p>
                      <div className="mt-1 flex items-center gap-1.5">
                        <StatusBadge status={me?.status ?? 'active'} />
                        {isAdmin && <span className="text-[9px] font-bold uppercase tracking-widest text-amber-300 border border-amber-300/30 bg-amber-400/10 rounded-full px-1.5 py-0.5">Admin</span>}
                      </div>
                    </div>
                  </div>
                  <button role="menuitem" onClick={() => navigate('/reglages')} className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] text-cream/85 hover:bg-white/[0.04] transition-colors text-left">
                    <Settings size={16} className="text-sage" /> Réglages du compte
                  </button>
                  <div className="border-t border-white/5">
                    <button
                      role="menuitem"
                      onClick={async () => {
                        await signOut();
                        toast('À très bientôt au Salon.');
                        navigate('/connexion');
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-[13px] font-medium text-red-300/90 hover:bg-red-950/40 transition-colors text-left"
                    >
                      <LogOut size={16} /> Se déconnecter
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ══════════ Contenu principal ══════════ */}
      <main className="relative flex-1 min-h-0 overflow-hidden">
        <Outlet />
      </main>

      {/* ══════════ Barre de navigation inférieure (mobile) ══════════ */}
      {!hiddenOnChatMobile && (
        <nav
          className="md:hidden relative z-30 shrink-0 border-t border-amber-100/[0.08] bg-salon-900/90 backdrop-blur-xl"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
          aria-label="Navigation principale"
        >
          <div className="grid grid-cols-3 h-[62px]">
            {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  classNames(
                    'relative flex flex-col items-center justify-center gap-0.5 transition-colors',
                    isActive ? 'text-goldbright' : 'text-sage',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={classNames('absolute top-0 h-[2.5px] rounded-b-full bg-gradient-to-r from-transparent via-gold to-transparent transition-all duration-300', isActive ? 'w-16 opacity-100' : 'w-0 opacity-0')} />
                    <span className="relative">
                      <Icon size={20} strokeWidth={isActive ? 2.2 : 1.8} />
                      {to === '/messages' && totalUnread > 0 && (
                        <span className="unread-badge absolute -top-1.5 -right-2.5 min-w-[17px] h-[17px] px-1 rounded-full bg-gold text-salon-950 text-[9px] font-extrabold flex items-center justify-center">
                          {totalUnread > 9 ? '9+' : totalUnread}
                        </span>
                      )}
                    </span>
                    <span className="text-[9px] font-semibold uppercase tracking-[0.12em]">{label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
