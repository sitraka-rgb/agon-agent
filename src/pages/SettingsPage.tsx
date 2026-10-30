import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Check, Loader2, LogOut, ShieldCheck, Fingerprint, Info, Database,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Avatar, RoleBadge, StatusBadge } from '../components/ui';
import { SalonLogo } from '../components/Logo';
import { formatFullDate, classNames } from '../lib/utils';

export default function SettingsPage() {
  const { me, isAdmin, mode, signOut, updateDisplayName, toast, conversations } = useApp();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState(me?.displayName ?? '');
  const [saving, setSaving] = useState(false);

  if (!me) return null;

  async function saveName(e: FormEvent) {
    e.preventDefault();
    const name = displayName.trim();
    if (!name) return;
    setSaving(true);
    try {
      await updateDisplayName(me!.id, name);
      toast('Nom affiché mis à jour.');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Mise à jour impossible.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto scroll-slim app-ambient">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-5">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-gold/85 font-semibold flex items-center gap-2"><Fingerprint size={13} /> Votre compte</p>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold text-cream mt-2">Réglages</h1>
        </div>

        {/* Carte identité */}
        <section className="rounded-2xl border border-amber-100/12 bg-salon-850/80 panel-grain p-5 sm:p-6 shadow-[0_20px_50px_-25px_rgba(0,0,0,0.8)]">
          <div className="flex flex-col sm:flex-row sm:items-center gap-5">
            <Avatar name={me.displayName} color={me.color} size={76} online />
            <div className="min-w-0">
              <p className="font-display text-xl font-semibold text-cream">{me.displayName}</p>
              <p className="font-mono text-[12px] text-gold/85 mt-0.5">@{me.identifier}</p>
              <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                <RoleBadge role={me.role} />
                <StatusBadge status={me.status} />
              </div>
              <p className="mt-2 text-[10.5px] text-sage/85">Membre du Salon depuis le {formatFullDate(me.createdAt)}</p>
            </div>
          </div>

          <form onSubmit={saveName} className="mt-5 border-t border-white/5 pt-5">
            <label className="block">
              <span className="field-label">Nom affiché</span>
              <input className="field" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={80} />
            </label>
            <button type="submit" className="btn-gold mt-3" disabled={saving || displayName.trim() === me.displayName || !displayName.trim()}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Enregistrer
            </button>
          </form>
        </section>

        {/* Sécurité & rôle */}
        <section className="rounded-2xl border border-white/[0.07] bg-salon-850/60 p-5">
          <h2 className="font-display text-base font-semibold text-cream flex items-center gap-2"><ShieldCheck size={17} className="text-gold" /> Sécurité du compte</h2>
          <ul className="mt-3 space-y-2.5 text-[12.5px] text-sage leading-relaxed">
            <li className="flex gap-2"><span className="text-gold">•</span> Connexion par identifiant et mot de passe — aucun e-mail, aucune inscription publique.</li>
            <li className="flex gap-2"><span className="text-gold">•</span> Mots de passe stockés sous forme de <span className="text-cream/85">hachés salés</span>, jamais en clair.</li>
            <li className="flex gap-2"><span className="text-gold">•</span> Vous dialoguez exclusivement avec l'administrateur. Les membres ne peuvent ni se voir ni s'écrire.</li>
            {isAdmin && (
              <li className="flex gap-2"><span className="text-gold">•</span> En tant qu'administrateur, vous créez, suspendez, réinitialisez et supprimez les comptes membres.</li>
            )}
          </ul>
          {!isAdmin && (
            <p className="mt-3 text-[11.5px] text-amber-100/70 border border-amber-200/15 bg-amber-400/[0.05] rounded-xl px-3.5 py-2.5">
              Mot de passe oublié ? Contactez la Direction : elle seule peut le réinitialiser.
            </p>
          )}
        </section>

        {/* État du backend */}
        <section className="rounded-2xl border border-white/[0.07] bg-salon-850/60 p-5">
          <h2 className="font-display text-base font-semibold text-cream flex items-center gap-2"><Database size={17} className="text-gold" /> Backend</h2>
          <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
            <div>
              {mode === 'live' ? (
                <>
                  <p className="text-[13px] font-semibold text-emerald-300">Mode production — Supabase connecté</p>
                  <p className="text-[11.5px] text-sage mt-1">Données dans Postgres, compteurs en direct, RLS appliquée par la base.</p>
                </>
              ) : (
                <>
                  <p className="text-[13px] font-semibold text-amber-200">Mode local — base enregistrée dans ce navigateur</p>
                  <p className="text-[11.5px] text-sage mt-1">Données conservées sur cet appareil.</p>
                </>
              )}
            </div>
          </div>
          <p className="mt-3 text-[10.5px] text-sage/70 font-mono">Salons ouverts : {conversations.length}</p>
        </section>

        {/* À propos */}
        <section className="rounded-2xl border border-white/[0.07] bg-salon-850/60 p-5 flex items-center gap-4">
          <SalonLogo size={46} />
          <div>
            <p className="font-display text-sm font-semibold text-cream flex items-center gap-2">Le Salon Privé <Info size={12} className="text-sage" /></p>
            <p className="text-[11px] text-sage mt-0.5 leading-relaxed">Messagerie privée sur invitation — un salon par membre, une seule direction, zéro fuite entre membres.</p>
          </div>
        </section>

        {/* Déconnexion */}
        <button
          className={classNames(
            'w-full flex items-center justify-center gap-2 rounded-2xl border border-red-400/25',
            'text-red-300 font-semibold text-[14px] py-3.5 hover:bg-red-950/30 hover:border-red-400/40 transition-all',
          )}
          onClick={async () => {
            await signOut();
            toast('À très bientôt au Salon.');
            navigate('/connexion');
          }}
        >
          <LogOut size={17} /> Se déconnecter
        </button>
      </div>
    </div>
  );
}
