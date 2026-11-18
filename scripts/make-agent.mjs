// Grants platform-agent access (the agent inbox) to an existing user.
// Usage:  npm run make-agent -- you@example.com "Your Name"
// The user must have signed up first. Reads keys from .env.local.
import { createClient } from "@supabase/supabase-js";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* use shell env */
}

const [email, displayName] = process.argv.slice(2);
if (!email) {
  console.error('Usage: npm run make-agent -- you@example.com "Your Name"');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local first.");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });

let user = null;
for (let page = 1; page <= 50 && !user; page++) {
  const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
  if (error) throw error;
  user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) ?? null;
  if (data.users.length < 200) break;
}
if (!user) {
  console.error(`No user with email ${email}. Sign up in the app first, then run this again.`);
  process.exit(1);
}

const { error } = await db
  .from("platform_agents")
  .upsert({ user_id: user.id, role: "admin", display_name: displayName || email.split("@")[0] });
if (error) throw error;
console.log(`✓ ${email} is now a platform agent. Sign in and open /agent.`);
