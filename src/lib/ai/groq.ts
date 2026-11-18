import "server-only";
import Groq from "groq-sdk";
import {
  supportReplyJsonSchema,
  supportReplySchema,
  type SupportAIProvider,
  type SupportAIRequest,
  type SupportAIResult,
} from "./types";

/**
 * Groq via the official groq-sdk (OpenAI-compatible chat completions).
 * Uses strict JSON Schema structured output, which Groq supports for
 * openai/gpt-oss-120b.
 */
export class GroqSupportProvider implements SupportAIProvider {
  readonly name = "groq";
  private client: Groq;

  constructor(
    apiKey: string,
    private model: string,
  ) {
    // A customer is waiting: short timeout (ms). Failures fall back to a human agent.
    this.client = new Groq({ apiKey, timeout: 45_000, maxRetries: 1 });
  }

  async generateReply(request: SupportAIRequest): Promise<SupportAIResult> {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: `${request.system}\n\n${request.knowledge}` },
        ...request.history.map((turn) => ({ role: turn.role, content: turn.content })),
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "support_reply",
          strict: true,
          schema: { ...supportReplyJsonSchema },
        },
      },
      // Short support answers: low reasoning keeps replies fast.
      reasoning_effort: "low",
      include_reasoning: false,
      max_completion_tokens: 4000,
    });

    const choice = completion.choices[0];
    if (!choice) throw new Error("Groq returned no choices");
    if (choice.finish_reason === "length") throw new Error("Groq reply was cut off (length)");

    const text = choice.message?.content;
    if (!text) throw new Error("Groq returned no text");

    return supportReplySchema.parse(JSON.parse(text));
  }
}
