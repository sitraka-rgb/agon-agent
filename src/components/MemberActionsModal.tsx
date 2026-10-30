import { useState, type FormEvent } from 'react';
import {
  Pencil, KeyRound, Ban, CheckCircle2, Trash2, Copy, Check, RefreshCw, Loader2, AlertTriangle,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { Profile } from '../lib/types';
import { Modal, Field, Avatar, StatusBadge, RoleBadge } from './ui';
import { generatePassword, validatePassword, formatFullDate, classNames } from '../lib/utils';

type Panel = 'root' | 'rename' | 'reset' | 'suspend' | 'delete';

export default function MemberActionsModal({ member, onClose }: { member: Profile; onClose: () => void }) {
  const { updateDisplayName, resetPassword, setStatus, deleteMember, toast } = useApp();
  const [panel, setPanel] = useState<Panel>('root');
  const [displayName, setDisplayName] = useState(member.displayName);
  const [newPassword, setNewPassword] = useState(() => generatePassword());
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const suspended = member.status === 'suspended';

  async function run(fn: () => Promise<void>, success: string) {
    setBusy(true);
    try {
      await fn();
      toast(success);
      if (panel !== 'delete') onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Action impossible.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast('Copie impossible.', 'error');
    }
  }

  /* ── Vue racine : fiche membre + actions ── */
  if (panel === 'root') {
    return (
      <Modal title="Gérer le membre" subtitle="Actions réservées à l'administrateur." onClose={onClose}>
        <div className="flex items-center gap-4 rounded-2xl border border-white/[0.07] bg-salon-800/50 p-4">
          <Avatar name={member.displayName} color={member.color} size={58} online={member.status === 'active'} />
          <div className="min-w-0">
            <p className="font-display text-lg font-semibold text-cream truncate">{member.displayName}</p>
            <p className="font-mono text-[11px] text-gold/85">@{member.identifier}</p>
            <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
              <RoleBadge role={member.role} />
              <StatusBadge status={member.status} />
            </div>
            <p className="mt-1.5 text-[10px] text-sage/80">Membre depuis le {formatFullDate(member.createdAt)}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2">
          <button className="btn-ghost justify-start !py-3" onClick={() => setPanel('rename')}>
            <Pencil size={16} className="text-gold" /> Modifier le nom affiché
          </button>
          <button className="btn-ghost justify-start !py-3" onClick={() => setPanel('reset')}>
            <KeyRound size={16} className="text-gold" /> Réinitialiser le mot de passe
          </button>
          {suspended ? (
            <button
              className="btn-ghost justify-start !py-3 !border-emerald-400/25 hover:!bg-emerald-950/30"
              onClick={() => run(() => setStatus(member.id, 'active'), `@${member.identifier} a été réactivé.`)}
              disabled={busy}
            >
              <UserCheckIcon /> Réactiver le compte
            </button>
          ) : (
            <button
              className="btn-ghost justify-start !py-3 !border-amber-400/25 hover:!bg-amber-950/30"
              onClick={() => setPanel('suspend')}
            >
              <Ban size={16} className="text-amber-400" /> Suspendre le compte
            </button>
          )}
          <button
            className="btn-ghost justify-start !py-3 !border-red-400/25 hover:!bg-red-950/30 text-red-200"
            onClick={() => setPanel('delete')}
          >
            <Trash2 size={16} className="text-red-400" /> Supprimer définitivement
          </button>
        </div>

      </Modal>
    );
  }

  /* ── Renommer ── */
  if (panel === 'rename') {
    return (
      <Modal title="Modifier le nom affiché" onClose={() => setPanel('root')}>
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (displayName.trim().length < 1) return;
            void run(() => updateDisplayName(member.id, displayName.trim()), 'Nom affiché mis à jour.');
          }}
          className="space-y-4"
        >
          <Field label="Nouveau nom affiché">
            <input className="field" value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoFocus maxLength={80} />
          </Field>
          <button type="submit" className="btn-gold w-full" disabled={busy}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Enregistrer
          </button>
        </form>
      </Modal>
    );
  }

  /* ── Réinitialiser le mot de passe ── */
  if (panel === 'reset') {
    const pwError = validatePassword(newPassword);
    return (
      <Modal title="Réinitialiser le mot de passe" subtitle={`Le membre @${member.identifier} devra se reconnecter avec ce nouveau mot de passe.`} onClose={() => setPanel('root')}>
        <Field label="Nouveau mot de passe" error={newPassword ? pwError : null} hint={!pwError ? 'Minimum 10 caractères, une lettre et un chiffre.' : undefined}>
          <div className="flex gap-2">
            <input className="field font-mono" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoCapitalize="none" spellCheck={false} autoFocus />
            <button type="button" className="icon-btn !w-11 !h-auto border border-white/10" onClick={() => setNewPassword(generatePassword())} aria-label="Générer">
              <RefreshCw size={17} />
            </button>
          </div>
        </Field>
        <button className="btn-ghost w-full mt-3 justify-center font-mono text-[12px]" onClick={() => copyText(`Le Salon Privé — nouveaux accès\nIdentifiant : ${member.identifier}\nMot de passe : ${newPassword}`)}>
          {copied ? <Check size={15} className="text-emerald-300" /> : <Copy size={15} />}
          {copied ? 'Copié' : 'Copier les nouveaux accès'}
        </button>
        <button
          className="btn-gold w-full mt-2"
          disabled={busy || !!pwError}
          onClick={() => run(() => resetPassword(member.id, newPassword), 'Mot de passe réinitialisé.')}
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />} Appliquer le nouveau mot de passe
        </button>
      </Modal>
    );
  }

  /* ── Suspendre ── */
  if (panel === 'suspend') {
    return (
      <Modal title="Suspendre le compte ?" onClose={() => setPanel('root')}>
        <div className="flex items-start gap-3 rounded-2xl border border-amber-400/25 bg-amber-950/25 p-4">
          <AlertTriangle size={20} className="text-amber-400 shrink-0 mt-0.5" />
          <p className="text-[13px] leading-relaxed text-amber-100/90">
            <span className="font-semibold">@{member.identifier}</span> ne pourra plus se connecter ni envoyer de message.
            L'historique de la conversation est conservé. Vous pourrez réactiver le compte à tout moment.
          </p>
        </div>
        <div className="mt-4 flex gap-2">
          <button className="btn-ghost flex-1 justify-center" onClick={() => setPanel('root')}>Annuler</button>
          <button
            className="btn-danger flex-1"
            disabled={busy}
            onClick={() => run(() => setStatus(member.id, 'suspended'), `@${member.identifier} est suspendu.`)}
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Ban size={16} />} Suspendre
          </button>
        </div>
      </Modal>
    );
  }

  /* ── Supprimer ── */
  return (
    <Modal title="Supprimer définitivement ?" subtitle="Cette action est irréversible." onClose={() => setPanel('root')}>
      <div className="flex items-start gap-3 rounded-2xl border border-red-400/30 bg-red-950/30 p-4">
        <AlertTriangle size={20} className="text-red-400 shrink-0 mt-0.5" />
        <div className="text-[13px] leading-relaxed text-red-100/90">
          <p><span className="font-semibold">@{member.identifier}</span>, son compte, son salon privé et <span className="font-semibold">tous les messages échangés</span> seront supprimés.</p>
          <p className="mt-2">Tapez <span className="font-mono text-cream bg-black/40 px-1.5 py-0.5 rounded">{member.identifier}</span> pour confirmer.</p>
        </div>
      </div>
      <input
        className="field font-mono mt-3"
        placeholder={member.identifier}
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value)}
        autoFocus
        autoCapitalize="none"
        spellCheck={false}
        aria-label="Confirmation en tapant l'identifiant"
      />
      <div className="mt-3 flex gap-2">
        <button className="btn-ghost flex-1 justify-center" onClick={() => setPanel('root')}>Annuler</button>
        <button
          className="btn-danger flex-1"
          disabled={busy || confirmText.trim().toLowerCase() !== member.identifier}
          onClick={() => run(async () => { await deleteMember(member.id); onClose(); }, `@${member.identifier} a été supprimé.`)}
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />} Supprimer
        </button>
      </div>
    </Modal>
  );
}

function UserCheckIcon() {
  return <CheckCircle2 size={16} className="text-emerald-400" />;
}
