import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { colorFor, initialsOf, classNames } from '../lib/utils';

/* ── Monogramme (avatar à initiales) ── */
export function Avatar({
  name,
  color,
  size = 44,
  online,
  className,
}: {
  name: string;
  color?: string;
  size?: number;
  online?: boolean;
  className?: string;
}) {
  const c = colorFor(color);
  return (
    <div className={classNames('relative shrink-0 select-none', className)} style={{ width: size, height: size }}>
      <div
        className="w-full h-full rounded-full flex items-center justify-center font-display font-semibold border border-white/10"
        style={{
          background: `radial-gradient(circle at 32% 30%, ${c.from}, ${c.to})`,
          color: c.text,
          fontSize: size * 0.38,
          letterSpacing: '0.02em',
        }}
      >
        {initialsOf(name)}
      </div>
      {online !== undefined && (
        <span
          className={`absolute bottom-0 right-0 rounded-full border-2 border-[#0a1c13] ${
            online ? 'bg-emerald-400' : 'bg-[#4a5a50]'
          }`}
          style={{ width: size * 0.3, height: size * 0.3 }}
          title={online ? 'En ligne' : 'Hors ligne'}
        />
      )}
    </div>
  );
}

/* ── Insigne de rôle ── */
export function RoleBadge({ role }: { role: 'admin' | 'member' }) {
  return role === 'admin' ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-amber-300">
      Administrateur
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-emerald-300/90">
      Membre
    </span>
  );
}

/* ── Badge de statut de compte ── */
export function StatusBadge({ status }: { status: 'active' | 'suspended' }) {
  return status === 'active' ? (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/25 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-emerald-300">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Actif
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-red-300/30 bg-red-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-red-300">
      <span className="w-1.5 h-1.5 rounded-full bg-red-400" /> Suspendu
    </span>
  );
}

/* ── Modale (bottom-sheet sur mobile, dialogue centré sur desktop) ── */
export function Modal({
  title,
  subtitle,
  onClose,
  children,
  wide,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className={classNames(
            'relative w-full bg-[#0d211750] bg-salon-850 border border-amber-200/10 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]',
            'rounded-t-2xl sm:rounded-2xl max-h-[94dvh] overflow-y-auto scroll-slim panel-grain',
            wide ? 'sm:max-w-lg' : 'sm:max-w-md',
          )}
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          transition={{ type: 'spring', damping: 30, stiffness: 380 }}
        >
          <div className="sticky top-0 z-10 flex items-start justify-between gap-4 px-5 sm:px-6 pt-5 pb-4 bg-salon-850/95 backdrop-blur-md border-b border-white/5 rounded-t-2xl sm:rounded-t-2xl">
            <div>
              <h2 className="font-display text-lg font-semibold text-cream leading-snug">{title}</h2>
              {subtitle && <p className="mt-0.5 text-xs text-sage leading-snug">{subtitle}</p>}
            </div>
            <button className="icon-btn -mr-2 -mt-1" onClick={onClose} aria-label="Fermer">
              <X size={18} />
            </button>
          </div>
          <div className="px-5 sm:px-6 py-5">{children}</div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/* ── Champ de formulaire ── */
export function Field({
  label,
  error,
  children,
  hint,
}: {
  label: string;
  error?: string | null;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      {children}
      {error ? (
        <span className="mt-1.5 block text-[11px] text-red-300/90 leading-snug">{error}</span>
      ) : hint ? (
        <span className="mt-1.5 block text-[11px] text-sage/80 leading-snug">{hint}</span>
      ) : null}
    </label>
  );
}

/* ── État vide ── */
export function EmptyState({ icon, title, hint }: { icon: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      <div className="w-16 h-16 rounded-2xl border border-amber-200/15 bg-salon-800/70 flex items-center justify-center text-amber-200/70 mb-4">
        {icon}
      </div>
      <p className="font-display text-base text-cream/90">{title}</p>
      {hint && <p className="mt-1.5 text-xs text-sage max-w-[240px] leading-relaxed">{hint}</p>}
    </div>
  );
}

/* ── Pastille "en ligne" texte ── */
export function OnlineText({ online, lastSeen }: { online: boolean; lastSeen: string }) {
  return online ? (
    <span className="text-[11px] text-emerald-300/90 font-medium">En ligne</span>
  ) : (
    <LastSeenLabel iso={lastSeen} />
  );
}

function LastSeenLabel({ iso }: { iso: string }) {
  const [, force] = useState(0);
  useEffect(() => {
    const iv = window.setInterval(() => force((x) => x + 1), 60_000);
    return () => window.clearInterval(iv);
  }, []);
  // import dynamique pour éviter un cycle : utilisation directe
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  const txt = min < 1 ? "vu à l'instant" : min < 60 ? `vu il y a ${min} min` : `vu le ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
  return <span className="text-[11px] text-sage">{txt}</span>;
}
