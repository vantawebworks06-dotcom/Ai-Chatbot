-- Velora support platform schema.
--
-- Replaces the placeholder per-user chat tables from the initial migration
-- (public.conversations / public.messages, which held no data) with a
-- multi-tenant support model: businesses, members, platform agents, chatbot
-- settings, knowledge base, visitors, conversations and messages.
--
-- Tenant isolation is enforced with row-level security everywhere. Widget
-- visitors never talk to the database directly; the Next.js server does that
-- with the service-role key after verifying the visitor's token.

create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------------------
-- Remove placeholder chat tables from the initial migration
-- ---------------------------------------------------------------------------
drop trigger if exists messages_touch_conversation on public.messages;
drop function if exists public.touch_conversation();
drop table if exists public.messages;
drop table if exists public.conversations;

-- ---------------------------------------------------------------------------
-- Platform agents (you, and any future support staff)
-- ---------------------------------------------------------------------------
create table public.platform_agents (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  role         text not null default 'agent' check (role in ('admin', 'agent')),
  display_name text,
  created_at   timestamptz not null default now()
);

alter table public.platform_agents enable row level security;

create or replace function public.is_platform_agent()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.platform_agents where user_id = auth.uid()
  );
$$;

create policy "Agents can view agents"
  on public.platform_agents for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_platform_agent()));

-- ---------------------------------------------------------------------------
-- Businesses (tenants)
-- ---------------------------------------------------------------------------
create table public.businesses (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(name) between 1 and 120),
  website_url    text,
  description    text,
  industry       text,
  country        text,
  timezone       text not null default 'UTC',
  currency       text not null default 'USD',
  phone          text,
  support_email  text,
  address        text,
  business_hours text,
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create trigger businesses_set_updated_at
  before update on public.businesses
  for each row execute function public.set_updated_at();

create table public.business_members (
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        text not null default 'owner' check (role in ('owner', 'member')),
  created_at  timestamptz not null default now(),
  primary key (business_id, user_id)
);

create index business_members_user_id_idx on public.business_members (user_id);

create or replace function public.is_business_member(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.business_members
    where business_id = p_business_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_business_owner(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.business_members
    where business_id = p_business_id and user_id = auth.uid() and role = 'owner'
  );
$$;

-- Same check for storage paths, where the business id arrives as text.
create or replace function public.is_business_member_text(p_business_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_business_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return public.is_business_member(p_business_id::uuid);
end;
$$;

alter table public.businesses enable row level security;
alter table public.business_members enable row level security;

create policy "Members and agents can view a business"
  on public.businesses for select to authenticated
  using ((select public.is_business_member(id)) or (select public.is_platform_agent()));

create policy "Owners and agents can update a business"
  on public.businesses for update to authenticated
  using ((select public.is_business_owner(id)) or (select public.is_platform_agent()))
  with check ((select public.is_business_owner(id)) or (select public.is_platform_agent()));

create policy "Owners can delete a business"
  on public.businesses for delete to authenticated
  using ((select public.is_business_owner(id)));

-- Businesses are created through create_business() so the creator becomes owner.

create policy "Members and agents can view memberships"
  on public.business_members for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.is_business_member(business_id))
    or (select public.is_platform_agent())
  );

-- ---------------------------------------------------------------------------
-- Chatbot settings (one row per business)
-- ---------------------------------------------------------------------------
create table public.chatbot_settings (
  business_id     uuid primary key references public.businesses (id) on delete cascade,
  enabled         boolean not null default true,
  bot_name        text not null default 'Assistant' check (char_length(bot_name) between 1 and 60),
  welcome_message text not null default 'Hi there! How can we help you today?'
                  check (char_length(welcome_message) <= 500),
  primary_color   text not null default '#2563eb' check (primary_color ~* '^#[0-9a-f]{6}$'),
  position        text not null default 'right' check (position in ('right', 'left')),
  allowed_domains text[] not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger chatbot_settings_set_updated_at
  before update on public.chatbot_settings
  for each row execute function public.set_updated_at();

alter table public.chatbot_settings enable row level security;

create policy "Members and agents can view chatbot settings"
  on public.chatbot_settings for select to authenticated
  using ((select public.is_business_member(business_id)) or (select public.is_platform_agent()));

create policy "Owners and agents can update chatbot settings"
  on public.chatbot_settings for update to authenticated
  using ((select public.is_business_owner(business_id)) or (select public.is_platform_agent()))
  with check ((select public.is_business_owner(business_id)) or (select public.is_platform_agent()));

-- Create a business, make the caller its owner, and create default settings.
create or replace function public.create_business(
  p_name text,
  p_website_url text default null,
  p_country text default null,
  p_timezone text default 'UTC',
  p_currency text default 'USD'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  insert into public.businesses (name, website_url, country, timezone, currency, created_by)
  values (
    trim(p_name),
    nullif(trim(p_website_url), ''),
    nullif(trim(p_country), ''),
    coalesce(nullif(trim(p_timezone), ''), 'UTC'),
    coalesce(nullif(upper(trim(p_currency)), ''), 'USD'),
    v_uid
  )
  returning id into v_id;

  insert into public.business_members (business_id, user_id, role) values (v_id, v_uid, 'owner');
  insert into public.chatbot_settings (business_id, bot_name)
  values (v_id, left(trim(p_name), 48) || ' Support');

  return v_id;
end;
$$;

revoke execute on function public.create_business(text, text, text, text, text) from public, anon;
grant execute on function public.create_business(text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Knowledge base
-- ---------------------------------------------------------------------------
create table public.knowledge_items (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  kind        text not null check (kind in (
                'faq', 'product', 'shipping_policy', 'return_policy', 'info', 'document'
              )),
  title       text not null check (char_length(title) between 1 and 300),
  content     text not null default '',
  file_path   text,
  file_name   text,
  status      text not null default 'ready' check (status in ('processing', 'ready', 'error')),
  error       text,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index knowledge_items_business_id_idx on public.knowledge_items (business_id, kind);

create trigger knowledge_items_set_updated_at
  before update on public.knowledge_items
  for each row execute function public.set_updated_at();

create table public.knowledge_chunks (
  id          bigint generated always as identity primary key,
  business_id uuid not null references public.businesses (id) on delete cascade,
  item_id     uuid not null references public.knowledge_items (id) on delete cascade,
  chunk_index int not null,
  content     text not null,
  fts         tsvector generated always as (to_tsvector('english', content)) stored,
  embedding   extensions.vector(1024),
  created_at  timestamptz not null default now()
);

create index knowledge_chunks_business_id_idx on public.knowledge_chunks (business_id);
create index knowledge_chunks_item_id_idx on public.knowledge_chunks (item_id);
create index knowledge_chunks_fts_idx on public.knowledge_chunks using gin (fts);
create index knowledge_chunks_embedding_idx on public.knowledge_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

alter table public.knowledge_items enable row level security;
alter table public.knowledge_chunks enable row level security;

create policy "Members and agents can view knowledge"
  on public.knowledge_items for select to authenticated
  using ((select public.is_business_member(business_id)) or (select public.is_platform_agent()));

create policy "Members can add knowledge"
  on public.knowledge_items for insert to authenticated
  with check ((select public.is_business_member(business_id)));

create policy "Members can edit knowledge"
  on public.knowledge_items for update to authenticated
  using ((select public.is_business_member(business_id)))
  with check ((select public.is_business_member(business_id)));

create policy "Members can delete knowledge"
  on public.knowledge_items for delete to authenticated
  using ((select public.is_business_member(business_id)));

-- Chunks are written only by the server (service role) during ingestion.
create policy "Members and agents can view knowledge chunks"
  on public.knowledge_chunks for select to authenticated
  using ((select public.is_business_member(business_id)) or (select public.is_platform_agent()));

-- Hybrid retrieval (full-text + optional vector), always scoped to one business.
-- Server-only: execute is revoked from client roles below.
create or replace function public.match_knowledge(
  p_business_id uuid,
  p_query text,
  p_embedding extensions.vector(1024) default null,
  p_limit int default 6
)
returns table (
  chunk_id bigint,
  item_id  uuid,
  title    text,
  kind     text,
  content  text,
  score    double precision
)
language sql
stable
set search_path = public, extensions
as $$
  with q as (
    select replace(plainto_tsquery('english', coalesce(p_query, ''))::text, ' & ', ' | ') as qt
  ),
  fts as (
    select c.id,
           row_number() over (
             order by ts_rank_cd(c.fts, to_tsquery('english', q.qt)) desc
           ) as rnk
    from public.knowledge_chunks c, q
    where c.business_id = p_business_id
      and q.qt <> ''
      and c.fts @@ to_tsquery('english', q.qt)
    order by 2
    limit 20
  ),
  vec as (
    select c.id,
           row_number() over (order by c.embedding <=> p_embedding) as rnk
    from public.knowledge_chunks c
    where p_embedding is not null
      and c.business_id = p_business_id
      and c.embedding is not null
    order by c.embedding <=> p_embedding
    limit 20
  ),
  fused as (
    select id, sum(1.0 / (60 + rnk))::double precision as score
    from (select * from fts union all select * from vec) u
    group by id
  )
  select c.id, c.item_id, i.title, i.kind, c.content, f.score
  from fused f
  join public.knowledge_chunks c on c.id = f.id
  join public.knowledge_items i on i.id = c.item_id
  where c.business_id = p_business_id
  order by f.score desc
  limit greatest(1, least(p_limit, 20));
$$;

revoke execute on function public.match_knowledge(uuid, text, extensions.vector, int)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Visitors (website customers chatting through the widget)
-- ---------------------------------------------------------------------------
create table public.visitors (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses (id) on delete cascade,
  token_hash   text not null unique,
  name         text check (char_length(name) <= 120),
  email        text check (char_length(email) <= 254),
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index visitors_business_id_idx on public.visitors (business_id);

alter table public.visitors enable row level security;

create policy "Members and agents can view visitors"
  on public.visitors for select to authenticated
  using ((select public.is_business_member(business_id)) or (select public.is_platform_agent()));

-- ---------------------------------------------------------------------------
-- Conversations
-- ---------------------------------------------------------------------------
create table public.conversations (
  id                   uuid primary key default gen_random_uuid(),
  business_id          uuid not null references public.businesses (id) on delete cascade,
  visitor_id           uuid not null references public.visitors (id) on delete cascade,
  status               text not null default 'open' check (status in ('open', 'closed')),
  -- ai: bot answers. waiting: handed off, waiting for an agent. human: agent in control.
  mode                 text not null default 'ai' check (mode in ('ai', 'waiting', 'human')),
  assigned_agent_id    uuid references auth.users (id) on delete set null,
  handoff_reason       text,
  handoff_at           timestamptz,
  unhelpful_count      int not null default 0,
  agent_unread         int not null default 0,
  last_message_at      timestamptz,
  last_message_preview text,
  visitor_typing_at    timestamptz,
  agent_typing_at      timestamptz,
  page_url             text,
  created_at           timestamptz not null default now(),
  closed_at            timestamptz
);

create index conversations_business_id_idx on public.conversations (business_id, last_message_at desc);
create index conversations_visitor_id_idx on public.conversations (visitor_id, created_at desc);
create index conversations_queue_idx on public.conversations (status, mode, last_message_at desc);

alter table public.conversations enable row level security;

create policy "Members and agents can view conversations"
  on public.conversations for select to authenticated
  using ((select public.is_business_member(business_id)) or (select public.is_platform_agent()));

-- All changes go through the server or the agent_* functions below.

-- ---------------------------------------------------------------------------
-- Messages
-- ---------------------------------------------------------------------------
create table public.messages (
  id              bigint generated always as identity primary key,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  business_id     uuid not null references public.businesses (id) on delete cascade,
  sender          text not null check (sender in ('visitor', 'ai', 'agent', 'system')),
  agent_id        uuid references auth.users (id) on delete set null,
  content         text not null check (char_length(content) between 1 and 8000),
  metadata        jsonb not null default '{}',
  created_at      timestamptz not null default now()
);

create index messages_conversation_id_idx on public.messages (conversation_id, id);
create index messages_business_id_idx on public.messages (business_id, created_at desc);
create index messages_content_search_idx on public.messages
  using gin (to_tsvector('simple', content));

alter table public.messages enable row level security;

create policy "Members and agents can view messages"
  on public.messages for select to authenticated
  using ((select public.is_business_member(business_id)) or (select public.is_platform_agent()));

-- Keep messages.business_id consistent with the conversation, and update the
-- conversation summary columns on every new message.
create or replace function public.messages_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select c.business_id into new.business_id
  from public.conversations c where c.id = new.conversation_id;
  if new.business_id is null then
    raise exception 'Conversation % not found', new.conversation_id;
  end if;
  return new;
end;
$$;

create trigger messages_before_insert
  before insert on public.messages
  for each row execute function public.messages_before_insert();

create or replace function public.messages_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations
     set last_message_at      = new.created_at,
         last_message_preview = left(new.content, 160),
         agent_unread         = case when new.sender = 'visitor'
                                     then agent_unread + 1 else agent_unread end,
         visitor_typing_at    = case when new.sender = 'visitor' then null else visitor_typing_at end,
         agent_typing_at      = case when new.sender = 'agent' then null else agent_typing_at end
   where id = new.conversation_id;
  return new;
end;
$$;

create trigger messages_after_insert
  after insert on public.messages
  for each row execute function public.messages_after_insert();

-- ---------------------------------------------------------------------------
-- Agent actions (only platform agents may call these)
-- ---------------------------------------------------------------------------
create or replace function public.require_platform_agent()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_agent() then
    raise exception 'Only platform agents can do this' using errcode = '42501';
  end if;
  return auth.uid();
end;
$$;

create or replace function public.agent_claim_conversation(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := public.require_platform_agent();
  v_name text;
begin
  update public.conversations
     set mode = 'human',
         status = 'open',
         closed_at = null,
         assigned_agent_id = v_uid,
         agent_unread = 0
   where id = p_conversation_id;
  if not found then
    raise exception 'Conversation not found';
  end if;

  select coalesce(display_name, 'A support agent') into v_name
  from public.platform_agents where user_id = v_uid;

  insert into public.messages (conversation_id, business_id, sender, agent_id, content)
  values (p_conversation_id, '00000000-0000-0000-0000-000000000000', 'system', v_uid,
          v_name || ' has joined the conversation.');
end;
$$;

create or replace function public.agent_send_message(p_conversation_id uuid, p_content text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := public.require_platform_agent();
  v_conv public.conversations%rowtype;
  v_id   bigint;
begin
  if p_content is null or char_length(trim(p_content)) = 0 then
    raise exception 'Message is empty';
  end if;

  select * into v_conv from public.conversations where id = p_conversation_id;
  if not found then
    raise exception 'Conversation not found';
  end if;

  -- Replying takes control, so the AI never talks over the agent.
  if v_conv.mode <> 'human' or v_conv.assigned_agent_id is distinct from v_uid
     or v_conv.status <> 'open' then
    perform public.agent_claim_conversation(p_conversation_id);
  end if;

  insert into public.messages (conversation_id, business_id, sender, agent_id, content)
  values (p_conversation_id, '00000000-0000-0000-0000-000000000000', 'agent', v_uid,
          left(trim(p_content), 8000))
  returning id into v_id;

  update public.conversations set agent_unread = 0 where id = p_conversation_id;
  return v_id;
end;
$$;

create or replace function public.agent_return_to_ai(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_platform_agent();
begin
  update public.conversations
     set mode = 'ai',
         assigned_agent_id = null,
         unhelpful_count = 0,
         agent_typing_at = null,
         status = 'open',
         closed_at = null
   where id = p_conversation_id;
  if not found then
    raise exception 'Conversation not found';
  end if;

  insert into public.messages (conversation_id, business_id, sender, agent_id, content)
  values (p_conversation_id, '00000000-0000-0000-0000-000000000000', 'system', v_uid,
          'You''re now chatting with our AI assistant again. Ask for a person any time.');
end;
$$;

create or replace function public.agent_close_conversation(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_platform_agent();
begin
  update public.conversations
     set status = 'closed',
         closed_at = now(),
         agent_unread = 0,
         agent_typing_at = null
   where id = p_conversation_id;
  if not found then
    raise exception 'Conversation not found';
  end if;

  insert into public.messages (conversation_id, business_id, sender, agent_id, content)
  values (p_conversation_id, '00000000-0000-0000-0000-000000000000', 'system', v_uid,
          'This conversation has been closed.');
end;
$$;

create or replace function public.agent_mark_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_platform_agent();
  update public.conversations set agent_unread = 0 where id = p_conversation_id;
end;
$$;

create or replace function public.agent_set_typing(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_platform_agent();
  update public.conversations set agent_typing_at = now()
   where id = p_conversation_id and mode = 'human';
end;
$$;

revoke execute on function public.agent_claim_conversation(uuid) from public, anon;
revoke execute on function public.agent_send_message(uuid, text) from public, anon;
revoke execute on function public.agent_return_to_ai(uuid) from public, anon;
revoke execute on function public.agent_close_conversation(uuid) from public, anon;
revoke execute on function public.agent_mark_read(uuid) from public, anon;
revoke execute on function public.agent_set_typing(uuid) from public, anon;
grant execute on function public.agent_claim_conversation(uuid) to authenticated;
grant execute on function public.agent_send_message(uuid, text) to authenticated;
grant execute on function public.agent_return_to_ai(uuid) to authenticated;
grant execute on function public.agent_close_conversation(uuid) to authenticated;
grant execute on function public.agent_mark_read(uuid) to authenticated;
grant execute on function public.agent_set_typing(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: agent and business dashboards subscribe to these (RLS applies).
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.conversations, public.messages;

-- ---------------------------------------------------------------------------
-- Storage: private bucket for uploaded knowledge documents.
-- Path convention: knowledge-docs/<business_id>/<file>
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('knowledge-docs', 'knowledge-docs', false, 10485760,
        array['application/pdf', 'text/plain', 'text/markdown', 'text/csv'])
on conflict (id) do nothing;

create policy "Members can read their business documents"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'knowledge-docs'
    and (select public.is_business_member_text((storage.foldername(name))[1]))
  );

create policy "Members can upload business documents"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'knowledge-docs'
    and (select public.is_business_member_text((storage.foldername(name))[1]))
  );

create policy "Members can delete business documents"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'knowledge-docs'
    and (select public.is_business_member_text((storage.foldername(name))[1]))
  );
