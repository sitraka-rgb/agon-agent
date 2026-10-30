import { FormEvent, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, EyeOff, LogIn, Loader2, ShieldCheck, KeyRound, UserRound, AlertCircle, Wifi } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { SalonLogo } from '../components/Logo';

export default function LoginPage() {
  const { signIn, toast } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/';

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!identifier.trim() || !password) {
      setError('Renseignez votre identifiant et votre mot de passe.');
      return;
    }
    setLoading(true);
    try {
      await signIn(identifier, password);
      toast('Bienvenue au Salon.');
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connexion impossible. Réessayez.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[100dvh] grid lg:grid-cols-[1.12fr_1fr] bg-salon-950 overflow-hidden">
      {/* ═══════════ Panneau d'ambiance (desktop) ═══════════ */}
      <div className="relative hidden lg:block overflow-hidden">
        <img
          src="/images/salon-login.jpg"
          alt="Le coin lecture privé du Salon, éclairé par une lampe de banquier"
          className="absolute inset-0 h-full w-full object-cover kenburns"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-salon-950/25 via-salon-950/35 to-salon-950" />
        <div className="absolute inset-0 bg-gradient-to-t from-salon-950/85 via-transparent to-salon-950/45" />

        <div className="relative z-10 h-full flex flex-col justify-between p-12 xl:p-16">
          <div className="flex items-center gap-3 text-amber-100/90">
            <SalonLogo size={40} />
            <span className="font-display text-lg tracking-wide text-cream/95">Le Salon Privé</span>
          </div>

          <div className="max-w-xl">
            <motion.h1
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.7 }}
              className="font-display text-5xl xl:text-6xl font-semibold leading-[1.06] text-cream"
            >
              Un salon,<br />
              <span className="italic text-goldbright">une poignée</span> de<br />confidences.
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.32, duration: 0.7 }}
              className="mt-6 text-[15px] leading-relaxed text-cream/75 max-w-md"
            >
              Une messagerie privée réservée aux membres invités. Chaque membre échange
              uniquement avec l'administrateur — jamais avec un autre membre.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.48, duration: 0.7 }}
              className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-[11px] uppercase tracking-[0.18em] text-amber-100/60"
            >
              <span className="flex items-center gap-2"><ShieldCheck size={14} className="text-gold" /> Chiffré & privé</span>
              <span className="flex items-center gap-2"><KeyRound size={14} className="text-gold" /> Comptes sur invitation</span>
              <span className="flex items-center gap-2"><Wifi size={14} className="text-gold" /> Temps réel</span>
            </motion.div>
          </div>
        </div>
      </div>

      {/* ═══════════ Panneau de connexion ═══════════ */}
      <div className="relative flex flex-col min-h-[100dvh] lg:min-h-0">
        {/* Art mobile en fondu derrière le formulaire */}
        <div className="lg:hidden absolute inset-0">
          <img
            src="/images/salon-login.jpg"
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover object-[62%_30%] opacity-60"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-salon-950/70 via-salon-950/55 to-salon-950" />
        </div>

        {/* Barre d'en-tête mobile */}
        <div className="relative lg:hidden flex items-center gap-2.5 px-5 pt-5">
          <SalonLogo size={34} />
          <span className="font-display text-base text-cream/95">Le Salon Privé</span>
        </div>

        <div className="relative flex-1 flex flex-col justify-center px-5 sm:px-10 lg:px-14 xl:px-16 py-8">
          <div className="w-full max-w-md mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55 }}
            >
              {/* En-tête */}
              <div className="flex items-center gap-4 mb-7">
                <SalonLogo size={58} className="hidden sm:block lg:hidden xl:block" />
                <div>
                  <p className="text-[10px] uppercase tracking-[0.28em] text-gold/90 font-semibold mb-1">Accès réservé</p>
                  <h2 className="font-display text-2xl sm:text-[27px] font-semibold text-cream leading-tight">
                    Entrez dans le salon
                  </h2>
                </div>
              </div>

              {/* Formulaire */}
              <form
                onSubmit={onSubmit}
                className="rounded-2xl border border-amber-100/10 bg-salon-900/80 lg:bg-salon-900/60 backdrop-blur-xl p-5 sm:p-6 shadow-[0_25px_70px_-20px_rgba(0,0,0,0.75)] panel-grain"
                noValidate
              >
                <div className="space-y-4">
                  <label className="block">
                    <span className="field-label">Identifiant</span>
                    <div className="relative">
                      <UserRound size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sage pointer-events-none" />
                      <input
                        className="field pl-10 font-medium tracking-wide"
                        type="text"
                        name="identifier"
                        autoComplete="username"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        placeholder="ex. safidy"
                        value={identifier}
                        onChange={(e) => { setIdentifier(e.target.value); setError(null); }}
                        disabled={loading}
                        autoFocus
                      />
                    </div>
                  </label>

                  <label className="block">
                    <span className="field-label">Mot de passe</span>
                    <div className="relative">
                      <KeyRound size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sage pointer-events-none" />
                      <input
                        className="field pl-10 pr-12"
                        type={showPassword ? 'text' : 'password'}
                        name="password"
                        autoComplete="current-password"
                        placeholder="Votre mot de passe"
                        value={password}
                        onChange={(e) => { setPassword(e.target.value); setError(null); }}
                        disabled={loading}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg text-sage hover:text-cream hover:bg-white/5 transition-colors"
                        aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                      >
                        {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                      </button>
                    </div>
                  </label>
                </div>

                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-4 flex items-start gap-2.5 rounded-xl border border-red-400/25 bg-red-950/50 px-3.5 py-2.5 text-[13px] leading-snug text-red-200"
                    role="alert"
                  >
                    <AlertCircle size={16} className="mt-0.5 shrink-0 text-red-300" />
                    <span>{error}</span>
                  </motion.div>
                )}

                <button type="submit" className="btn-gold w-full mt-5 !py-3 text-[15px]" disabled={loading}>
                  {loading ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />}
                  {loading ? 'Vérification…' : 'Se connecter'}
                </button>

                <p className="mt-4 text-center text-[11px] leading-relaxed text-sage/80">
                  Pas d'inscription publique. Vos identifiants vous sont remis<br className="hidden sm:block" />
                  par l'administrateur du Salon.
                </p>
              </form>

            </motion.div>
          </div>
        </div>

        <p className="relative hidden lg:block text-center pb-5 text-[10px] uppercase tracking-[0.25em] text-sage/50">
          Le Salon Privé — messagerie sur invitation
        </p>
      </div>
    </div>
  );
}
