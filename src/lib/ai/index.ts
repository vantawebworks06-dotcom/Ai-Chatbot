import "server-only";
import { serverEnv } from "@/lib/env";
import { GroqSupportProvider } from "./groq";
import type { SupportAIProvider } from "./types";

let provider: SupportAIProvider | null = null;

/**
 * Returns the configured AI provider (AI_PROVIDER, default "groq").
 * To add another provider, implement SupportAIProvider (see ./types.ts) in a
 * new file and add a case here. Nothing else in the app needs to change.
 */
export function getSupportAI(): SupportAIProvider {
  if (provider) return provider;

  const name = serverEnv.aiProvider();
  switch (name) {
    case "groq":
      provider = new GroqSupportProvider(serverEnv.groqApiKey(), serverEnv.aiModel());
      return provider;
    default:
      throw new Error(`Unknown AI_PROVIDER "${name}". Supported: groq.`);
  }
}
