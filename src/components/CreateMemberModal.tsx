import { useMemo, useState, type FormEvent } from 'react';
import { Copy, Check, RefreshCw, UserPlus, Loader2, ShieldCheck } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Modal, Field } from './ui';
import { generatePassword, validateIdentifier, validatePassword, COLOR_KEYS, colorFor, classNames } from '../lib/utils';

export default function CreateMemberModal({ onClose }: { onClose: () => void }) {
  const { createMember, toast } = useApp();
  const [identifier, setIdentifier] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState(() => generatePassword());
  const [color, setColor] = useState('emerald');
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<{ identifier: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const credentialBlock = useMemo(
    () => `Le Salon Privé — vos accès\nIdentifiant : ${identifier.trim().toLowerCase()}\nMot de passe : ${password}\nConnexion : ${window.location.origin}/connexion`,
    [identifier, password],
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    const idError = validateIdentifier(identifier);
    const pwError = validatePassword(password);
    const nameError = displayName.trim().length < 2 ? 'Le nom affiché doit contenir au moins 2 caractères.' : null;
    setErrors({ identifier: idError, password: pwError, displayName: nameError });
    if (idError || pwError || nameError) return;

    setLoading(true);
    try {
      await createMember({ identifier: identifier.trim().toLowerCase(), displayName: displayName.trim(), password, color });
      setCreated({ identifier: identifier.trim().toLowerCase(), password });
      toast('Membre créé et salon privé ouvert.');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Création impossible.', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function copyCredentials() {
    try {
      await navigator.clipboard.writeText(credentialBlock);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast('Copie impossible — sélectionnez le texte manuellement.', 'error');
    }
  }

  /* ── Écran de succès avec les identifiants à transmettre ── */
  if (created) {
    return (
      <Modal title="Compte créé" subtitle="Transmettez ces identifiants au membre — ils ne seront plus jamais affichés." onClose={onClose}>
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl border border-emerald-300/30 bg-emerald-400/10 flex items-center justify-center mb-4">
            <ShieldCheck size={30} className="text-emerald-300" />
          </div>
          <p className="text-sm text-sage">Le salon privé de <span className="text-cream font-semibold">{created.identifier}</span> est ouvert.</p>
        </div>

        <div className="mt-4 rounded-xl border border-amber-200/20 bg-black/45 p-4 font-mono text-[12px] leading-relaxed text-amber-100/90 whitespace-pre-line">
          {`Identifiant : ${created.identifier}\nMot de passe : ${created.password}`}
        </div>

        <button className="btn-ghost w-full mt-3 justify-center" onClick={copyCredentials}>
          {copied ? <Check size={15} className="text-emerald-300" /> : <Copy size={15} />}
          {copied ? 'Copié dans le presse-papier' : 'Copier le bloc de connexion'}
        </button>
        <button className="btn-gold w-full mt-2" onClick={onClose}>Terminé</button>
      </Modal>
    );
  }

  return (
    <Modal
      title="Nouveau membre"
      subtitle="Choisissez l'identifiant et le mot de passe, puis transmettez-les vous-même au membre."
      onClose={onClose}
      wide
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Nom affiché" error={errors.displayName}>
          <input
            className="field"
            placeholder="ex. Camille Perret"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            autoFocus
            maxLength={80}
          />
        </Field>

        <Field
          label="Identifiant de connexion"
          error={errors.identifier}
          hint={!errors.identifier ? 'Utilisé pour se connecter, jamais affiché publiquement.' : undefined}
        >
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-[13px] text-sage">@</span>
            <input
              className="field pl-8 font-mono lowercase"
              placeholder="ex. marie"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value.toLowerCase())}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              maxLength={24}
            />
          </div>
        </Field>

        <Field label="Mot de passe" error={errors.password} hint={!errors.password ? 'Minimum 10 caractères, une lettre et un chiffre.' : undefined}>
          <div className="flex gap-2">
            <input
              className="field font-mono"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoCapitalize="none"
              spellCheck={false}
            />
            <button type="button" className="icon-btn !w-11 !h-auto border border-white/10" onClick={() => setPassword(generatePassword())} title="Générer un nouveau mot de passe" aria-label="Générer un nouveau mot de passe">
              <RefreshCw size={17} />
            </button>
          </div>
        </Field>

        {/* Couleur du monogramme */}
        <div>
          <span className="field-label">Couleur du monogramme</span>
          <div className="flex gap-2 flex-wrap">
            {COLOR_KEYS.map((key) => {
              const c = colorFor(key);
              const active = color === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setColor(key)}
                  aria-pressed={active}
                  aria-label={`Couleur ${key}`}
                  className={classNames(
                    'w-9 h-9 rounded-full border-2 transition-all flex items-center justify-center',
                    active ? 'border-gold scale-110 shadow-[0_0_0_3px_rgba(217,180,91,0.25)]' : 'border-transparent opacity-70 hover:opacity-100',
                  )}
                  style={{ background: `radial-gradient(circle at 35% 32%, ${c.from}, ${c.to})` }}
                >
                  {active && <Check size={14} style={{ color: c.text }} strokeWidth={3} />}
                </button>
              );
            })}
          </div>
        </div>

        <button type="submit" className="btn-gold w-full !py-3" disabled={loading}>
          {loading ? <Loader2 size={17} className="animate-spin" /> : <UserPlus size={17} />}
          {loading ? 'Création du compte…' : 'Créer le compte et ouvrir le salon'}
        </button>
      </form>
    </Modal>
  );
}
