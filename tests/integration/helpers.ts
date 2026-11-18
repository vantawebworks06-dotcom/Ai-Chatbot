import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Integration tests run against a real Supabase project.
// They create temporary users/businesses and delete them afterwards.
// Enable with RUN_INTEGRATION=1 (see README "Testing").

try {
  process.loadEnvFile(".env.local");
} catch {
  /* env may come from the shell instead */
}

export const enabled =
  process.env.RUN_INTEGRATION === "1" &&
  Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
      process.env.SUPABASE_SECRET_KEY,
  );

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishable = () => process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

export function admin(): SupabaseClient {
  return createClient(url(), process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function anon(): SupabaseClient {
  return createClient(url(), publishable(), { auth: { persistSession: false, autoRefreshToken: false } });
}

export interface TestUser {
  id: string;
  email: string;
  client: SupabaseClient;
}

const created: { users: string[]; businesses: string[] } = { users: [], businesses: [] };

export async function createUser(label: string): Promise<TestUser> {
  const email = `velora-test-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const password = `Test-${crypto.randomUUID()}`;
  const { data, error } = await admin().auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  created.users.push(data.user.id);

  const client = anon();
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  return { id: data.user.id, email, client };
}

export async function createBusinessFor(user: TestUser, name: string): Promise<string> {
  const { data, error } = await user.client.rpc("create_business", { p_name: name });
  if (error) throw error;
  created.businesses.push(data as string);
  return data as string;
}

export async function makeAgent(user: TestUser) {
  const { error } = await admin().from("platform_agents").insert({ user_id: user.id, display_name: "Test Agent" });
  if (error) throw error;
}

export async function cleanup() {
  const db = admin();
  if (created.businesses.length) {
    await db.from("businesses").delete().in("id", created.businesses);
  }
  for (const id of created.users) await db.auth.admin.deleteUser(id);
  created.users = [];
  created.businesses = [];
}
