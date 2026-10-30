// ═══════════════════════════════════════════════════════════════════════════
//  LE SALON — Edge Function "admin-api"
//  Opérations réservées à l'administrateur qui exigent la clé service_role,
//  exécutées côté serveur : création / réinitialisation / suppression de membres.
//  La clé service_role n'apparaît JAMAIS dans le navigateur.
//
//  Déploiement :
//    supabase link --project-ref <votre-project-ref>
//    supabase functions deploy admin-api
// ═══════════════════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const IDENTIFIER_RE = /^[a-z0-9][a-z0-9._-]{2,23}$/;
const TECH_DOMAIN = 'site.local';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function validatePassword(pw: unknown): string | null {
  if (typeof pw !== 'string') return 'Mot de passe invalide.';
  if (pw.length < 10) return 'Le mot de passe doit contenir au moins 10 caractères.';
  if (!/[a-zA-ZÀ-ÿ]/.test(pw) || !/[0-9]/.test(pw))
    return 'Le mot de passe doit contenir au moins une lettre et un chiffre.';
  return null;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée.' }, 405);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // 1. Authentifier l'appelant via son JWT utilisateur
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Authentification requise.' }, 401);

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: authError } = await callerClient.auth.getUser();
    if (authError || !caller) return json({ error: 'Session invalide ou expirée.' }, 401);

    // 2. Vérifier que l'appelant est un administrateur ACTIF (via service_role)
    const service = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: callerProfile } = await service
      .from('profiles')
      .select('id, role, status')
      .eq('id', caller.id)
      .single();

    if (!callerProfile || callerProfile.role !== 'admin' || callerProfile.status !== 'active') {
      return json({ error: 'Action réservée à l’administrateur.' }, 403);
    }

    const body = await req.json();
    const action = body?.action as string;

    // ── CRÉATION D'UN MEMBRE ───────────────────────────────────────────────
    if (action === 'create_member') {
      const identifier = String(body.identifier ?? '').trim().toLowerCase();
      const displayName = String(body.displayName ?? '').trim();
      const password = String(body.password ?? '');
      const color = String(body.color ?? 'emerald');

      if (!IDENTIFIER_RE.test(identifier))
        return json({ error: 'Identifiant invalide : 3–24 caractères, minuscules, chiffres, « . », « _ » ou « - ».' }, 400);
      if (identifier === 'safidy')
        return json({ error: 'Cet identifiant est réservé au compte administrateur.' }, 400);
      if (displayName.length < 2 || displayName.length > 80)
        return json({ error: 'Le nom affiché doit contenir entre 2 et 80 caractères.' }, 400);
      const pwError = validatePassword(password);
      if (pwError) return json({ error: pwError }, 400);

      const { data: existing } = await service
        .from('profiles').select('id').eq('identifier', identifier).maybeSingle();
      if (existing) return json({ error: 'Cet identifiant est déjà utilisé.' }, 409);

      // Créer le compte auth (e-mail technique interne <identifiant>@site.local)
      const { data: created, error: createError } = await service.auth.admin.createUser({
        email: `${identifier}@${TECH_DOMAIN}`,
        password,
        email_confirm: true,
        user_metadata: { identifier, display_name: displayName },
      });
      if (createError || !created?.user)
        return json({ error: `Échec de la création du compte : ${createError?.message ?? 'inconnue'}` }, 500);

      const memberId = created.user.id;

      // Profil public + conversation privée avec l'administrateur
      const { error: profileError } = await service.from('profiles').insert({
        id: memberId, identifier, display_name: displayName,
        role: 'member', status: 'active', color,
      });
      if (profileError) {
        await service.auth.admin.deleteUser(memberId); // rollback propre
        return json({ error: `Échec de la création du profil : ${profileError.message}` }, 500);
      }
      const { error: convError } = await service.from('conversations').insert({
        admin_id: caller.id, member_id: memberId,
      });
      if (convError) {
        await service.auth.admin.deleteUser(memberId);
        return json({ error: `Échec de la création de la conversation : ${convError.message}` }, 500);
      }

      return json({ member: { id: memberId, identifier, displayName, status: 'active' } }, 201);
    }

    // ── RÉINITIALISATION DU MOT DE PASSE ───────────────────────────────────
    if (action === 'reset_password') {
      const userId = String(body.userId ?? '');
      const password = String(body.password ?? '');
      const pwError = validatePassword(password);
      if (pwError) return json({ error: pwError }, 400);

      const { data: target } = await service.from('profiles').select('role').eq('id', userId).single();
      if (!target) return json({ error: 'Membre introuvable.' }, 404);
      if (target.role === 'admin')
        return json({ error: 'Le mot de passe de l’administrateur ne peut pas être réinitialisé ici.' }, 400);

      const { error } = await service.auth.admin.updateUserById(userId, { password });
      if (error) return json({ error: `Échec de la réinitialisation : ${error.message}` }, 500);
      return json({ ok: true });
    }

    // ── SUPPRESSION D'UN MEMBRE ────────────────────────────────────────────
    if (action === 'delete_member') {
      const userId = String(body.userId ?? '');
      if (userId === caller.id) return json({ error: 'Vous ne pouvez pas supprimer votre propre compte.' }, 400);

      const { data: target } = await service.from('profiles').select('role').eq('id', userId).single();
      if (!target) return json({ error: 'Membre introuvable.' }, 404);
      if (target.role === 'admin') return json({ error: 'Le compte administrateur ne peut pas être supprimé.' }, 400);

      // cascade : profil → conversation → messages ; puis suppression de l'utilisateur auth
      const { error } = await service.auth.admin.deleteUser(userId);
      if (error) return json({ error: `Échec de la suppression : ${error.message}` }, 500);
      return json({ ok: true });
    }

    return json({ error: 'Action inconnue.' }, 400);
  } catch (err) {
    return json({ error: `Erreur serveur : ${(err as Error).message}` }, 500);
  }
});
