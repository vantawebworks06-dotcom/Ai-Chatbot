import { z } from "zod";

// Provider-neutral contract between the support engine and an LLM provider.
// To add another provider, implement SupportAIProvider and register it in
// src/lib/ai/index.ts.

export interface SupportTurn {
  role: "user" | "assistant";
  content: string;
}

export interface SupportAIRequest {
  /** Stable instructions (per business). */
  system: string;
  /** Retrieved knowledge for this message, already formatted. */
  knowledge: string;
  /** Conversation so far, oldest first. The last turn is the customer's. */
  history: SupportTurn[];
}

export const supportReplySchema = z.object({
  reply: z.string(),
  needs_human: z.boolean(),
  reason: z.enum([
    "answered",
    "small_talk",
    "clarifying_question",
    "not_in_knowledge",
    "low_confidence",
    "requires_action",
  ]),
  confidence: z.enum(["high", "medium", "low"]),
});

export type SupportAIResult = z.infer<typeof supportReplySchema>;

/** JSON Schema sent to the model (mirrors supportReplySchema). */
export const supportReplyJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "needs_human", "reason", "confidence"],
  properties: {
    reply: {
      type: "string",
      description: "The message shown to the customer.",
    },
    needs_human: {
      type: "boolean",
      description: "True when a human agent should take over this conversation.",
    },
    reason: {
      type: "string",
      enum: [
        "answered",
        "small_talk",
        "clarifying_question",
        "not_in_knowledge",
        "low_confidence",
        "requires_action",
      ],
    },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
} as const;

export interface SupportAIProvider {
  readonly name: string;
  generateReply(request: SupportAIRequest): Promise<SupportAIResult>;
}
