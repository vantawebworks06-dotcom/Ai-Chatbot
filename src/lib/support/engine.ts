import type { SupportAIProvider, SupportAIResult } from "@/lib/ai/types";
import type {
  Business,
  ChatbotSettings,
  Conversation,
  KnowledgeMatch,
  Message,
  MessageSender,
} from "@/lib/types";
import {
  evaluateRules,
  handoffMessage,
  type HandoffReason,
} from "./handoff-rules";
import { buildSystemPrompt, formatKnowledge, toTurns } from "./prompt";

// The support engine decides what happens after a customer sends a message:
// answer with AI, hand off to a human, or stay quiet because a human is in
// control. It depends only on the SupportStore interface, so it is tested with
// an in-memory store (tests/unit/engine.test.ts) and runs against Supabase in
// production (src/lib/support/store.ts).

export interface SupportStore {
  getConversation(id: string): Promise<Conversation | null>;
  getRecentMessages(conversationId: string, limit: number): Promise<Message[]>;
  insertMessage(
    conversationId: string,
    sender: MessageSender,
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<Message>;
  updateConversation(id: string, patch: Partial<Conversation>): Promise<void>;
  getBotContext(businessId: string): Promise<{ business: Business; settings: ChatbotSettings }>;
  retrieveKnowledge(businessId: string, query: string): Promise<KnowledgeMatch[]>;
}

export interface EngineDeps {
  store: SupportStore;
  ai: SupportAIProvider;
  now?: () => Date;
  log?: (message: string, detail?: unknown) => void;
}

const HISTORY_LIMIT = 20;

function aiResultHandoff(result: SupportAIResult): HandoffReason | null {
  if (result.needs_human) {
    return result.reason === "not_in_knowledge" ? "no_knowledge" : "low_confidence";
  }
  if (result.confidence === "low" && result.reason !== "small_talk") return "low_confidence";
  if (!result.reply.trim()) return "low_confidence";
  return null;
}

type HandoffDeps = Pick<EngineDeps, "store" | "now">;

async function handOff(
  deps: HandoffDeps,
  conversation: Conversation,
  reason: HandoffReason,
  unhelpfulCount: number,
): Promise<Message[]> {
  const now = (deps.now ?? (() => new Date()))().toISOString();
  const message = await deps.store.insertMessage(conversation.id, "ai", handoffMessage(reason), {
    handoff: reason,
  });
  await deps.store.updateConversation(conversation.id, {
    mode: "waiting",
    handoff_reason: reason,
    handoff_at: now,
    unhelpful_count: unhelpfulCount,
  });
  return [message];
}

/**
 * Handles a customer message that has already been saved. Returns any new
 * messages (AI reply or handoff notice) to show the customer.
 */
export async function respondToVisitor(
  deps: EngineDeps,
  conversationId: string,
  visitorText: string,
): Promise<Message[]> {
  const conversation = await deps.store.getConversation(conversationId);
  if (!conversation || conversation.status !== "open") return [];

  // A human is in control (or has been requested): the AI stays silent.
  if (conversation.mode !== "ai") return [];

  const rules = evaluateRules(visitorText, conversation.unhelpful_count);
  const unhelpfulCount = conversation.unhelpful_count + (rules.unhelpful ? 1 : 0);

  if (rules.handoff) {
    return handOff(deps, conversation, rules.handoff, unhelpfulCount);
  }

  let result: SupportAIResult;
  let matches: KnowledgeMatch[] = [];
  try {
    const [{ business, settings }, history] = await Promise.all([
      deps.store.getBotContext(conversation.business_id),
      deps.store.getRecentMessages(conversation.id, HISTORY_LIMIT),
    ]);
    matches = await deps.store.retrieveKnowledge(conversation.business_id, visitorText);

    const turns = toTurns(history);
    if (!turns.length || turns[turns.length - 1].role !== "user") {
      turns.push({ role: "user", content: visitorText });
    }

    result = await deps.ai.generateReply({
      system: buildSystemPrompt(business, settings),
      knowledge: formatKnowledge(business, matches),
      history: turns,
    });
  } catch (error) {
    deps.log?.("AI reply failed; handing off", error);
    return handOff(deps, conversation, "ai_error", unhelpfulCount);
  }

  // An agent may have taken over while the AI was thinking.
  const latest = await deps.store.getConversation(conversation.id);
  if (!latest || latest.mode !== "ai" || latest.status !== "open") return [];

  const reason = aiResultHandoff(result);
  if (reason) return handOff(deps, latest, reason, unhelpfulCount);

  const message = await deps.store.insertMessage(conversation.id, "ai", result.reply.trim(), {
    confidence: result.confidence,
    reason: result.reason,
    sources: [...new Set(matches.map((m) => m.item_id))],
  });
  if (unhelpfulCount !== conversation.unhelpful_count) {
    await deps.store.updateConversation(conversation.id, { unhelpful_count: unhelpfulCount });
  }
  return [message];
}

/** The customer pressed "Talk to a person". */
export async function requestHuman(deps: HandoffDeps, conversationId: string): Promise<Message[]> {
  const conversation = await deps.store.getConversation(conversationId);
  if (!conversation || conversation.status !== "open" || conversation.mode !== "ai") return [];
  return handOff(deps, conversation, "customer_requested", conversation.unhelpful_count);
}
