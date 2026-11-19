// Creates (or repairs) a Velora login without sending a confirmation email,
// and optionally makes it a platform agent. Useful when Supabase's built-in
// email sender is rate-limited.
//
// Usage:  npm run create-account
//         npm run create-account -- you@example.com "Your Name"
//
// The password is typed with hidden input and never written to disk or logs.
// Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY from .env.local / .env.
import readline from "node:readline";
import { createClient } from "@supabase/supabase-js";

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    /* file missing */
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local first.");
  process.exit(1);
}

// One reader for all questions, so buffered input isn't lost between them.
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: Boolean(process.stdin.isTTY),
});
let muted = false;
rl._writeToOutput = (text) => {
  if (!muted) rl.output.write(text);
  else if (text.includes("\n") || text.includes("\r")) rl.output.write("\n");
  else rl.output.write("*".repeat(text.length));
};

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    muted = false;
    rl.question(question, (answer) => {
      muted = false;
      if (hidden) process.stdout.write("\n");
      resolve(answer.trim());
    });
    muted = hidden;
  });
}

const [argEmail, argName] = process.argv.slice(2);
const email = (argEmail || (await ask("Email: "))).toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("That doesn't look like an email address.");
  process.exit(1);
}
const name = argName || (await ask("Your name (shown to customers when you reply): ")) || email.split("@")[0];

const password = await ask("Password (min 8 characters, hidden): ", { hidden: true });
if (password.length < 8) {
  console.error("Password must be at least 8 characters.");
  process.exit(1);
}
const again = await ask("Repeat password: ", { hidden: true });
if (again !== password) {
  console.error("Passwords don't match.");
  process.exit(1);
}
const makeAgent = !/^n/i.test((await ask("Give this account the agent inbox? [Y/n]: ")) || "y");
rl.close();

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

// Find an existing user (e.g. a half-finished sign-up that never got its email).
let user = null;
for (let page = 1; page <= 50 && !user; page++) {
  const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
  if (error) throw error;
  user = data.users.find((u) => u.email?.toLowerCase() === email) ?? null;
  if (data.users.length < 200) break;
}

if (user) {
  const { error } = await db.auth.admin.updateUserById(user.id, { password, email_confirm: true });
  if (error) throw error;
  console.log(`✓ Existing account ${email} confirmed and password updated.`);
} else {
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  user = data.user;
  console.log(`✓ Account ${email} created (already confirmed, no email needed).`);
}

if (makeAgent) {
  const { error } = await db
    .from("platform_agents")
    .upsert({ user_id: user.id, role: "admin", display_name: name });
  if (error) throw error;
  console.log(`✓ ${name} is a platform agent (agent inbox at /agent).`);
}

console.log("\nNext: sign in at http://localhost:3000/login");
console.log("Create your business at http://localhost:3000/onboarding (the agent inbox links to it).");
