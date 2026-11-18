-- Initial schema: profiles, conversations, messages, attachments storage bucket.
-- Safe to run on a fresh Supabase project. Non-destructive: creates only, drops nothing.

-- ---------------------------------------------------------------------------
-- Shared helper: keep updated_at current
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user
-- ---------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 100),
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

create policy "Users can view their own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Create a profile automatically when a user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- conversations: a chat thread owned by a user
-- ---------------------------------------------------------------------------
create table public.conversations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title      text check (char_length(title) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index conversations_user_id_updated_at_idx
  on public.conversations (user_id, updated_at desc);

create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

alter table public.conversations enable row level security;

create policy "Users can view their own conversations"
  on public.conversations for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their own conversations"
  on public.conversations for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own conversations"
  on public.conversations for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own conversations"
  on public.conversations for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- messages: individual chat messages within a conversation
-- ---------------------------------------------------------------------------
create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  role            text not null check (role in ('user', 'assistant', 'system')),
  content         text not null,
  created_at      timestamptz not null default now()
);

create index messages_conversation_id_created_at_idx
  on public.messages (conversation_id, created_at);

create index messages_user_id_idx
  on public.messages (user_id);

alter table public.messages enable row level security;

create policy "Users can view their own messages"
  on public.messages for select to authenticated
  using ((select auth.uid()) = user_id);

-- Insert only into a conversation the user owns.
create policy "Users can add messages to their own conversations"
  on public.messages for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and c.user_id = (select auth.uid())
    )
  );

create policy "Users can delete their own messages"
  on public.messages for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Bump the parent conversation's updated_at when a message is added.
create or replace function public.touch_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations
     set updated_at = now()
   where id = new.conversation_id;
  return new;
end;
$$;

create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function public.touch_conversation();

-- ---------------------------------------------------------------------------
-- Storage: private "attachments" bucket.
-- Files must be stored under a folder named after the user's id:
--   attachments/<user_id>/<filename>
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 10485760)  -- 10 MB
on conflict (id) do nothing;

create policy "Users can view their own attachments"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Users can upload their own attachments"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Users can update their own attachments"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Users can delete their own attachments"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
