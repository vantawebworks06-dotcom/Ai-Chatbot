import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";

// Service-role client. Bypasses row-level security, so it must only run on
// the server, and every query must be scoped to a business explicitly.
let client: SupabaseClient | null = null;

export function createAdminClient(): SupabaseClient {
  if (!client) {
    client = createClient(serverEnv.supabaseUrl(), serverEnv.supabaseSecretKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
