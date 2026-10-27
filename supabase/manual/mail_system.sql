-- MG Pro mail system (multi-account Gmail via Google OAuth).
-- Additive only: creates new mail_* tables. Does not touch existing tables or data.
-- Run once in the Supabase SQL Editor (project kcdsdaytrnzoiharmyxo).

-- Staff check used by RLS (security definer avoids user_roles RLS recursion).
create or replace function public.mail_is_staff(_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _uid and role::text in ('admin','employee'))
$$;
revoke all on function public.mail_is_staff(uuid) from public, anon;
grant execute on function public.mail_is_staff(uuid) to authenticated, service_role;

-- Mailboxes (no credentials here).
create table if not exists public.mail_accounts (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  display_name text,
  status text not null default 'active' check (status in ('active','paused','error','reauth_required')),
  last_error text,
  linked_at timestamptz not null default now(),
  history_id text,
  last_sync_at timestamptz,
  sync_lease_until timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.mail_accounts to authenticated;
grant all on public.mail_accounts to service_role;
alter table public.mail_accounts enable row level security;
drop policy if exists "staff read mail accounts" on public.mail_accounts;
create policy "staff read mail accounts" on public.mail_accounts for select to authenticated using (public.mail_is_staff(auth.uid()));

-- Encrypted OAuth tokens. Service role only: no grants, no policies for users.
create table if not exists public.mail_account_secrets (
  account_id uuid primary key references public.mail_accounts(id) on delete cascade,
  refresh_token_ciphertext text not null,
  access_token_ciphertext text,
  access_expires_at timestamptz,
  scopes text,
  updated_at timestamptz not null default now()
);
revoke all on public.mail_account_secrets from anon, authenticated;
grant all on public.mail_account_secrets to service_role;
alter table public.mail_account_secrets enable row level security;

-- One-time OAuth states (stores only a SHA-256 hash of the state).
create table if not exists public.mail_oauth_states (
  state_hash text primary key,
  user_id uuid not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
revoke all on public.mail_oauth_states from anon, authenticated;
grant all on public.mail_oauth_states to service_role;
alter table public.mail_oauth_states enable row level security;

-- Local labels (shared organization).
create table if not exists public.mail_labels (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null default '#d4af37',
  created_at timestamptz not null default now()
);
grant select on public.mail_labels to authenticated;
grant all on public.mail_labels to service_role;
alter table public.mail_labels enable row level security;
drop policy if exists "staff read mail labels" on public.mail_labels;
create policy "staff read mail labels" on public.mail_labels for select to authenticated using (public.mail_is_staff(auth.uid()));

-- Messages imported after linking (never pre-link history).
create table if not exists public.mail_messages (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.mail_accounts(id) on delete cascade,
  gmail_message_id text not null,
  gmail_thread_id text,
  folder text not null default 'inbox' check (folder in ('inbox','sent','drafts','spam','other')),
  from_addr text, to_addr text, cc_addr text,
  subject text, snippet text,
  rfc_message_id text, rfc_references text,
  internal_date timestamptz not null,
  body_text text, body_html text,
  has_attachments boolean not null default false,
  is_read boolean not null default false,
  read_at timestamptz, read_by uuid,
  starred boolean not null default false,
  archived boolean not null default false,
  trashed_at timestamptz,
  label_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (account_id, gmail_message_id)
);
create index if not exists mail_messages_date_idx on public.mail_messages (internal_date desc);
create index if not exists mail_messages_acct_date_idx on public.mail_messages (account_id, internal_date desc);
create index if not exists mail_messages_thread_idx on public.mail_messages (account_id, gmail_thread_id);
create index if not exists mail_messages_unread_idx on public.mail_messages (is_read) where is_read = false;
grant select on public.mail_messages to authenticated;
grant all on public.mail_messages to service_role;
alter table public.mail_messages enable row level security;
drop policy if exists "staff read mail messages" on public.mail_messages;
create policy "staff read mail messages" on public.mail_messages for select to authenticated using (public.mail_is_staff(auth.uid()));

create table if not exists public.mail_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.mail_messages(id) on delete cascade,
  gmail_attachment_id text not null,
  filename text not null,
  mime_type text,
  size_bytes integer
);
create index if not exists mail_attachments_msg_idx on public.mail_attachments (message_id);
grant select on public.mail_attachments to authenticated;
grant all on public.mail_attachments to service_role;
alter table public.mail_attachments enable row level security;
drop policy if exists "staff read mail attachments" on public.mail_attachments;
create policy "staff read mail attachments" on public.mail_attachments for select to authenticated using (public.mail_is_staff(auth.uid()));

-- Locally deleted messages: sync never re-imports them. Cascades with the account.
create table if not exists public.mail_local_tombstones (
  account_id uuid not null references public.mail_accounts(id) on delete cascade,
  gmail_message_id text not null,
  deleted_by uuid,
  deleted_at timestamptz not null default now(),
  primary key (account_id, gmail_message_id)
);
revoke all on public.mail_local_tombstones from anon, authenticated;
grant all on public.mail_local_tombstones to service_role;
alter table public.mail_local_tombstones enable row level security;

-- Local drafts (admin only, via server).
create table if not exists public.mail_drafts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.mail_accounts(id) on delete cascade,
  reply_to_message_id uuid references public.mail_messages(id) on delete set null,
  to_addr text not null default '', cc_addr text not null default '',
  subject text not null default '', body text not null default '',
  created_by uuid,
  updated_at timestamptz not null default now()
);
revoke all on public.mail_drafts from anon, authenticated;
grant all on public.mail_drafts to service_role;
alter table public.mail_drafts enable row level security;

-- Per-user notification dedupe (one row per staff user per new message).
create table if not exists public.mail_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  message_id uuid not null references public.mail_messages(id) on delete cascade,
  created_at timestamptz not null default now(),
  seen_at timestamptz,
  unique (user_id, message_id)
);
create index if not exists mail_notifications_user_idx on public.mail_notifications (user_id) where seen_at is null;
grant select on public.mail_notifications to authenticated;
grant all on public.mail_notifications to service_role;
alter table public.mail_notifications enable row level security;
drop policy if exists "own mail notifications" on public.mail_notifications;
create policy "own mail notifications" on public.mail_notifications for select to authenticated using (user_id = auth.uid());

-- Admin-only audit log (read through server after admin check).
create table if not exists public.mail_activity (
  id bigserial primary key,
  actor_id uuid,
  action text not null,
  account_id uuid references public.mail_accounts(id) on delete set null,
  message_id uuid references public.mail_messages(id) on delete set null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists mail_activity_date_idx on public.mail_activity (created_at desc);
revoke all on public.mail_activity from anon, authenticated;
grant all on public.mail_activity to service_role;
alter table public.mail_activity enable row level security;

-- Realtime for staff (RLS still applies to subscribers).
do $$ begin
  begin alter publication supabase_realtime add table public.mail_messages; exception when others then null; end;
  begin alter publication supabase_realtime add table public.mail_accounts; exception when others then null; end;
  begin alter publication supabase_realtime add table public.mail_notifications; exception when others then null; end;
end $$;
