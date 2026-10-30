-- ═══════════════════════════════════════════════════════════════════════════
--  LE SALON — Schéma complet Supabase (Postgres + Auth + Realtime)
--  Messagerie privée : un seul administrateur, un salon privé par membre.
--
--  À exécuter dans : Supabase Dashboard → SQL Editor → New query → Run
--  Idempotent : peut être relancé sans erreur.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────
--  1. TABLES
-- ─────────────────────────────────────────────────────────────

-- Profils applicatifs (1 profil = 1 utilisateur auth.users)
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  identifier    text unique not null check (identifier ~ '^[a-z0-9][a-z0-9._-]{2,23}$'),
  display_name  text not null check (char_length(display_name) between 1 and 80),
  role          text not null default 'member' check (role in ('admin', 'member')),
  status        text not null default 'active' check (status in ('active', 'suspended')),
  color         text not null default 'emerald',
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);
create unique index if not exists profiles_identifier_idx on public.profiles (identifier);

-- Une seule conversation privée par membre, toujours avec l'administrateur
create table if not exists public.conversations (
  id          uuid primary key default gen_random_uuid(),
  admin_id    uuid not null references public.profiles(id) on delete cascade,
  member_id   uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (admin_id, member_id),
  check (admin_id <> member_id)
);

-- Messages
create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id       uuid not null references public.profiles(id) on delete cascade,
  content         text not null check (char_length(content) between 1 and 4000),
  created_at      timestamptz not null default now(),
  read_at         timestamptz
);
create index if not exists messages_conversation_idx on public.messages (conversation_id, created_at);
create index if not exists messages_unread_idx       on public.messages (conversation_id) where read_at is null;

-- ─────────────────────────────────────────────────────────────
--  2. FONCTION is_admin()
--  security definer → lit profiles sans re-déclencher les policies (pas de récursion)
-- ─────────────────────────────────────────────────────────────

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and status = 'active'
  );
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, anon;

-- ─────────────────────────────────────────────────────────────
--  3. TRIGGERS DE GARDE (application des règles au niveau base)
-- ─────────────────────────────────────────────────────────────

-- Un non-admin ne peut pas toucher à l'identifiant, au rôle ou au statut,
-- même s'il a le droit de modifier son propre profil.
create or replace function public.guard_profile_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    if new.identifier is distinct from old.identifier
       or new.role       is distinct from old.role
       or new.status     is distinct from old.status then
      raise exception 'Seul l''administrateur peut modifier l''identifiant, le rôle ou le statut du compte.';
    end if;
  end if;
  -- L''identifiant et le rôle d''un administrateur ne changent jamais via l''app
  if old.role = 'admin' and new.role <> 'admin' then
    raise exception 'Le compte administrateur ne peut pas être rétrogradé.';
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
for each row execute function public.guard_profile_update();

-- Un message ne peut être modifié que pour passer à "lu".
-- Le contenu, l'expéditeur et la conversation sont immuables.
create or replace function public.guard_message_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    if new.content         is distinct from old.content
       or new.sender_id    is distinct from old.sender_id
       or new.conversation_id is distinct from old.conversation_id
       or new.created_at   is distinct from old.created_at then
      raise exception 'Seul le statut de lecture d''un message peut être modifié.';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists messages_guard on public.messages;
create trigger messages_guard before update on public.messages
for each row execute function public.guard_message_update();

-- ─────────────────────────────────────────────────────────────
--  4. ROW LEVEL SECURITY
--  Le blocage des membres entre eux est appliqué ICI, dans la base —
--  pas dans l'interface.
-- ─────────────────────────────────────────────────────────────

alter table public.profiles      enable row level security;
alter table public.conversations enable row level security;
alter table public.messages      enable row level security;

-- ── profiles ─────────────────────────────────────────────
-- Lecture : son propre profil, le profil admin (pour dialoguer),
-- ou tout le monde si l'on est admin. Les membres ne se voient JAMAIS entre eux.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or role = 'admin' or public.is_admin());

-- Mise à jour : son propre profil, ou tout profil si admin.
-- (colonnes sensibles protégées par le trigger guard_profile_update)
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- Insertion / suppression : jamais depuis le navigateur.
-- La création et la suppression passent par la Edge Function admin-api (service_role).
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert to authenticated
  with check (public.is_admin());  -- conservé pour la traçabilité ; la fonction utilise service_role

drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete on public.profiles
  for delete to authenticated
  using (false);  -- suppression uniquement via Edge Function (admin-api)

-- ── conversations ────────────────────────────────────────
-- Lecture : l'admin voit tout, le membre ne voit que la sienne.
drop policy if exists conversations_select on public.conversations;
create policy conversations_select on public.conversations
  for select to authenticated
  using (member_id = auth.uid() or admin_id = auth.uid() or public.is_admin());

drop policy if exists conversations_insert on public.conversations;
create policy conversations_insert on public.conversations
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists conversations_delete on public.conversations;
create policy conversations_delete on public.conversations
  for delete to authenticated
  using (public.is_admin());

-- ── messages ─────────────────────────────────────────────
-- Lecture : participants de la conversation, ou admin actif.
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (c.member_id = auth.uid() or c.admin_id = auth.uid() or public.is_admin())
    )
  );

-- Envoi : uniquement soi-même, dans une conversation où l'on est partie prenante,
-- et uniquement si son compte est ACTIF (un compte suspendu ne peut plus écrire).
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'active')
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (public.is_admin() or c.member_id = auth.uid())
    )
  );

-- Marquage "lu" : uniquement les messages reçus (pas les siens),
-- et uniquement la colonne read_at (trigger guard_message_update).
drop policy if exists messages_update on public.messages;
create policy messages_update on public.messages
  for update to authenticated
  using (
    sender_id <> auth.uid()
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (c.member_id = auth.uid() or c.admin_id = auth.uid() or public.is_admin())
    )
  )
  with check (
    sender_id <> auth.uid()
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (c.member_id = auth.uid() or c.admin_id = auth.uid() or public.is_admin())
    )
  );

drop policy if exists messages_delete on public.messages;
create policy messages_delete on public.messages
  for delete to authenticated
  using (public.is_admin());

-- ─────────────────────────────────────────────────────────────
--  5. PRIVILÈGES
-- ─────────────────────────────────────────────────────────────

grant select, update on public.profiles to authenticated;
grant select, insert, update on public.conversations to authenticated;
grant select, insert, update on public.messages to authenticated;
grant all on public.profiles, public.conversations, public.messages to service_role;

-- ─────────────────────────────────────────────────────────────
--  6. REALTIME (Messages en temps réel + présence)
-- ─────────────────────────────────────────────────────────────

do $$
begin
  begin
    alter publication supabase_realtime add table public.messages;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.profiles;
  exception when duplicate_object then null;
  end;
end $$;

-- ═════════════════════════════════════════════════════════════
--  7. CRÉATION DU PREMIER COMPTE ADMINISTRATEUR
--  ─────────────────────────────────────────────────────────
--  À exécuter APRÈS les étapes 1 à 6. Crée :
--    • l'utilisateur auth  safidy@site.local / @Safidy15
--    • son profil public (rôle admin)
--  ⚠ CHANGEZ LE MOT DE PASSE dès la première connexion.
-- ═════════════════════════════════════════════════════════════

do $$
declare
  admin_uid uuid;
begin
  select id into admin_uid from auth.users where email = 'safidy@site.local';

  if admin_uid is null then
    admin_uid := gen_random_uuid();
    insert into auth.users (
      id, instance_id, aud, role, email,
      encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      admin_uid,
      '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated',
      'safidy@site.local',
      crypt('@Safidy15', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"identifier":"safidy","display_name":"Safidy"}'::jsonb,
      now(), now(),
      '', '', '', ''
    );
    raise notice 'Utilisateur auth safidy@site.local créé (id %).', admin_uid;
  else
    raise notice 'Utilisateur safidy@site.local déjà présent (id %).', admin_uid;
  end if;

  insert into public.profiles (id, identifier, display_name, role, status, color)
  values (admin_uid, 'safidy', 'Safidy', 'admin', 'active', 'gold')
  on conflict (id) do update set identifier = 'safidy', display_name = 'Safidy', role = 'admin', status = 'active';
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
--  Vérifications rapides après installation :
--    select identifier, role, status from public.profiles;
--    select tablename, policyname from pg_policies where schemaname = 'public';
-- ═══════════════════════════════════════════════════════════════════════════
