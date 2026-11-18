import "server-only";
import { serverEnv } from "@/lib/env";
import { AnthropicSupportProvider } from "./anthropic";
import type { SupportAIProvider } from "./types";

let provider: SupportAIProvider | null = null;

/** Returns the configured AI provider (AI_PROVIDER, default "anthropic"). */
export function getSupportAI(): SupportAIProvider {
  if (provider) return provider;

  const name = serverEnv.aiProvider();
  switch (name) {
    case "anthropic":
      provider = new AnthropicSupportProvider(serverEnv.anthropicApiKey(), serverEnv.aiModel());
      return provider;
    default:
      throw new Error(`Unknown AI_PROVIDER "${name}". Supported: anthropic.`);
  }
}
