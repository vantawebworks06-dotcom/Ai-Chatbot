import "server-only";

// Server-side environment access. Throws a clear error when a required value
// is missing instead of failing later with a confusing message.

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Add it to .env.local (see .env.example).`,
    );
  }
  return value;
}

export const serverEnv = {
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL"),
  supabasePublishableKey: () => required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  supabaseSecretKey: () => required("SUPABASE_SECRET_KEY"),
  geminiApiKey: () => required("GEMINI_API_KEY"),
  aiModel: () => process.env.AI_MODEL || "gemini-3.5-flash-lite",
  aiProvider: () => process.env.AI_PROVIDER || "gemini",
  embeddingsProvider: () => process.env.EMBEDDINGS_PROVIDER || "none",
  voyageApiKey: () => required("VOYAGE_API_KEY"),
};
