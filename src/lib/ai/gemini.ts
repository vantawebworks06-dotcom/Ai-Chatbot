import "server-only";
import { GoogleGenAI } from "@google/genai";
import {
  supportReplyJsonSchema,
  supportReplySchema,
  type SupportAIProvider,
  type SupportAIRequest,
  type SupportAIResult,
} from "./types";

/**
 * Google Gemini via the official Gen AI SDK (Interactions API).
 * Stateless: store=false, and the full recent history is sent each time, so
 * no conversation data is kept by Google between requests.
 */
export class GeminiSupportProvider implements SupportAIProvider {
  readonly name = "gemini";
  private client: GoogleGenAI;

  constructor(
    apiKey: string,
    private model: string,
  ) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async generateReply(request: SupportAIRequest): Promise<SupportAIResult> {
    const interaction = await this.client.interactions.create(
      {
        model: this.model,
        store: false,
        system_instruction: `${request.system}\n\n${request.knowledge}`,
        input: request.history.map((turn) =>
          turn.role === "user"
            ? { type: "user_input" as const, content: [{ type: "text" as const, text: turn.content }] }
            : { type: "model_output" as const, content: [{ type: "text" as const, text: turn.content }] },
        ),
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: { ...supportReplyJsonSchema },
        },
        // Support replies are short; low thinking keeps customers from waiting.
        generation_config: { thinking_level: "low", max_output_tokens: 4000 },
      },
      // A customer is waiting. Failures fall back to a human agent.
      { timeout: 45_000, maxRetries: 1 },
    );

    if (interaction.status && interaction.status !== "completed") {
      throw new Error(`Gemini interaction ended with status "${interaction.status}"`);
    }
    const text = interaction.output_text;
    if (!text) throw new Error("Gemini returned no text");

    return supportReplySchema.parse(JSON.parse(text));
  }
}
