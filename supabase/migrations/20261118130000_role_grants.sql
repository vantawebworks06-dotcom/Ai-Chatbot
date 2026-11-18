-- Explicit privileges for the API roles.
--
-- This project does not grant table access to anon / authenticated /
-- service_role automatically, so each table needs explicit grants.
-- Row-level security still decides WHICH rows a role can touch; these grants
-- only decide which operations are possible at all.
--
-- anon (website visitors without a login) gets nothing: the widget goes
-- through the Next.js server, which uses service_role.

-- ---------------------------------------------------------------------------
-- Server (service_role): full access, used only by trusted server code
-- ---------------------------------------------------------------------------
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- ---------------------------------------------------------------------------
-- Signed-in users (authenticated): only operations that have RLS policies
-- ---------------------------------------------------------------------------
grant usage on schema public to authenticated;

grant select, update on public.profiles to authenticated;
grant select on public.platform_agents to authenticated;
grant select, update, delete on public.businesses to authenticated;
grant select on public.business_members to authenticated;
grant select, update on public.chatbot_settings to authenticated;
grant select, insert, update, delete on public.knowledge_items to authenticated;
grant select on public.knowledge_chunks to authenticated;
grant select on public.visitors to authenticated;
grant select on public.conversations to authenticated;
grant select on public.messages to authenticated;

-- Helper functions used inside RLS policies run as the querying role.
grant execute on function public.is_platform_agent() to authenticated, service_role;
grant execute on function public.is_business_member(uuid) to authenticated, service_role;
grant execute on function public.is_business_owner(uuid) to authenticated, service_role;
grant execute on function public.is_business_member_text(text) to authenticated, service_role;

-- Server-only retrieval (revoked from public in the previous migration).
grant execute on function public.match_knowledge(uuid, text, extensions.vector, int) to service_role;
grant usage on schema extensions to service_role;

-- RPCs callable by signed-in users (each checks permissions itself).
grant execute on function public.create_business(text, text, text, text, text) to authenticated;
grant execute on function public.agent_claim_conversation(uuid) to authenticated;
grant execute on function public.agent_send_message(uuid, text) to authenticated;
grant execute on function public.agent_return_to_ai(uuid) to authenticated;
grant execute on function public.agent_close_conversation(uuid) to authenticated;
grant execute on function public.agent_mark_read(uuid) to authenticated;
grant execute on function public.agent_set_typing(uuid) to authenticated;
