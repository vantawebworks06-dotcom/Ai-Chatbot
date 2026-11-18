import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import {
  supportReplyJsonSchema,
  supportReplySchema,
  type SupportAIProvider,
  type SupportAIRequest,
  type SupportAIResult,
} from "./types";

export class AnthropicSupportProvider implements SupportAIProvider {
  readonly name = "anthropic";
  private client: Anthropic;

  constructor(
    apiKey: string,
    private model: string,
  ) {
    // Short timeout: a customer is waiting. Failures fall back to a human.
    this.client = new Anthropic({ apiKey, timeout: 45_000, maxRetries: 1 });
  }

  async generateReply(request: SupportAIRequest): Promise<SupportAIResult> {
    const response = await this.client.beta.messages.create({
      model: this.model,
      max_tokens: 4000,
      // If the model declines for a safety reason, the API retries on a
      // fallback model inside the same call.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: { ...supportReplyJsonSchema } },
      },
      system: [
        { type: "text", text: request.system, cache_control: { type: "ephemeral" } },
        { type: "text", text: request.knowledge },
      ],
      messages: request.history.map((turn) => ({ role: turn.role, content: turn.content })),
    });

    if (response.stop_reason === "refusal") {
      return {
        reply: "",
        needs_human: true,
        reason: "requires_action",
        confidence: "low",
      };
    }
    if (response.stop_reason === "max_tokens") {
      throw new Error("AI reply was cut off (max_tokens)");
    }

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");

    return supportReplySchema.parse(JSON.parse(text));
  }
}
