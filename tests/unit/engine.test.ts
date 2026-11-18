import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupportAIProvider, SupportAIRequest, SupportAIResult } from "@/lib/ai/types";
import { requestHuman, respondToVisitor, type SupportStore } from "@/lib/support/engine";
import type {
  Business,
  ChatbotSettings,
  Conversation,
  KnowledgeMatch,
  Message,
  MessageSender,
} from "@/lib/types";

// In-memory implementation of the store the engine uses in production.
// AI is a test double that records what it was asked; no network calls.

const BIZ_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BIZ_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function business(id: string, name: string): Business {
  return {
    id,
    name,
    website_url: null,
    description: null,
    industry: null,
    country: null,
    timezone: "UTC",
    currency: "USD",
    phone: null,
    support_email: null,
    address: null,
    business_hours: "Mon–Fri 9–5",
    created_at: new Date().toISOString(),
  };
}

class MemoryStore implements SupportStore {
  conversations = new Map<string, Conversation>();
  messages: Message[] = [];
  knowledge: Record<string, KnowledgeMatch[]> = {};
  retrievedFor: string[] = [];
  private nextId = 1;

  addConversation(id: string, businessId: string, patch: Partial<Conversation> = {}) {
    this.conversations.set(id, {
      id,
      business_id: businessId,
      visitor_id: "v1",
      status: "open",
      mode: "ai",
      assigned_agent_id: null,
      handoff_reason: null,
      handoff_at: null,
      unhelpful_count: 0,
      agent_unread: 0,
      last_message_at: null,
      last_message_preview: null,
      visitor_typing_at: null,
      agent_typing_at: null,
      page_url: null,
      created_at: new Date().toISOString(),
      closed_at: null,
      ...patch,
    });
  }

  async getConversation(id: string) {
    const c = this.conversations.get(id);
    return c ? { ...c } : null;
  }
  async getRecentMessages(conversationId: string, limit: number) {
    return this.messages.filter((m) => m.conversation_id === conversationId).slice(-limit);
  }
  async insertMessage(conversationId: string, sender: MessageSender, content: string, metadata = {}) {
    const conv = this.conversations.get(conversationId)!;
    const m: Message = {
      id: this.nextId++,
      conversation_id: conversationId,
      business_id: conv.business_id,
      sender,
      agent_id: null,
      content,
      metadata,
      created_at: new Date().toISOString(),
    };
    this.messages.push(m);
    return m;
  }
  async updateConversation(id: string, patch: Partial<Conversation>) {
    this.conversations.set(id, { ...this.conversations.get(id)!, ...patch });
  }
  async getBotContext(businessId: string): Promise<{ business: Business; settings: ChatbotSettings }> {
    const name = businessId === BIZ_A ? "Alpha Shop" : "Beta Store";
    return {
      business: business(businessId, name),
      settings: {
        business_id: businessId,
        enabled: true,
        bot_name: `${name} Bot`,
        welcome_message: "Hi",
        primary_color: "#2563eb",
        position: "right",
        allowed_domains: [],
      },
    };
  }
  async retrieveKnowledge(businessId: string) {
    this.retrievedFor.push(businessId);
    return this.knowledge[businessId] ?? [];
  }
}

class FakeAI implements SupportAIProvider {
  name = "fake";
  calls: SupportAIRequest[] = [];
  constructor(private result: SupportAIResult | (() => Promise<SupportAIResult>)) {}
  async generateReply(req: SupportAIRequest) {
    this.calls.push(req);
    return typeof this.result === "function" ? this.result() : this.result;
  }
}

const answered: SupportAIResult = {
  reply: "We ship worldwide in 3–5 business days.",
  needs_human: false,
  reason: "answered",
  confidence: "high",
};

let store: MemoryStore;

async function visitorSays(convId: string, text: string, ai: SupportAIProvider) {
  await store.insertMessage(convId, "visitor", text);
  return respondToVisitor({ store, ai }, convId, text);
}

beforeEach(() => {
  store = new MemoryStore();
  store.addConversation("c1", BIZ_A);
  store.knowledge[BIZ_A] = [
    { chunk_id: 1, item_id: "k1", title: "Shipping", kind: "shipping_policy", content: "Alpha ships worldwide in 3–5 business days.", score: 1 },
  ];
  store.knowledge[BIZ_B] = [
    { chunk_id: 2, item_id: "k2", title: "Secret", kind: "info", content: "BETA-PRIVATE-DISCOUNT-CODE", score: 1 },
  ];
});

describe("AI answers", () => {
  it("replies using the conversation's own business knowledge", async () => {
    const ai = new FakeAI(answered);
    const out = await visitorSays("c1", "Do you ship internationally?", ai);

    expect(out).toHaveLength(1);
    expect(out[0].sender).toBe("ai");
    expect(out[0].content).toBe(answered.reply);
    expect(store.retrievedFor).toEqual([BIZ_A]);
    expect(ai.calls[0].knowledge).toContain("Alpha ships worldwide");
    expect(ai.calls[0].system).toContain("Alpha Shop");
    expect(store.conversations.get("c1")!.mode).toBe("ai");
  });

  it("never sends another business's knowledge to the AI", async () => {
    const ai = new FakeAI(answered);
    await visitorSays("c1", "any discount codes?", ai);
    const sent = JSON.stringify(ai.calls);
    expect(sent).not.toContain("BETA-PRIVATE-DISCOUNT-CODE");
    expect(sent).not.toContain("Beta Store");
  });

  it("passes conversation history with the customer's message last", async () => {
    const ai = new FakeAI(answered);
    await visitorSays("c1", "hello", ai);
    await visitorSays("c1", "do you ship to Japan?", ai);
    const turns = ai.calls[1].history;
    expect(turns[0]).toEqual({ role: "user", content: "hello" });
    expect(turns.at(-1)).toEqual({ role: "user", content: "do you ship to Japan?" });
  });
});

describe("handoff", () => {
  it("hands off immediately when the customer asks for a person, without calling the AI", async () => {
    const ai = new FakeAI(answered);
    const out = await visitorSays("c1", "I want to talk to a human", ai);

    expect(ai.calls).toHaveLength(0);
    expect(out[0].content).toMatch(/connecting you/i);
    const c = store.conversations.get("c1")!;
    expect(c.mode).toBe("waiting");
    expect(c.handoff_reason).toBe("customer_requested");
    expect(c.handoff_at).not.toBeNull();
  });

  it("hands off refund requests without calling the AI", async () => {
    const ai = new FakeAI(answered);
    await visitorSays("c1", "I want a refund for order 123", ai);
    expect(ai.calls).toHaveLength(0);
    expect(store.conversations.get("c1")!.handoff_reason).toBe("refund_or_exception");
  });

  it("hands off when the knowledge base doesn't cover the question", async () => {
    const ai = new FakeAI({ reply: "I'm not sure.", needs_human: true, reason: "not_in_knowledge", confidence: "low" });
    const out = await visitorSays("c1", "Do you sell gift cards?", ai);
    expect(out[0].content).toMatch(/member of our team/i);
    expect(store.conversations.get("c1")!.handoff_reason).toBe("no_knowledge");
  });

  it("hands off on low confidence even if the AI didn't ask for it", async () => {
    const ai = new FakeAI({ reply: "Maybe 2 days?", needs_human: false, reason: "answered", confidence: "low" });
    await visitorSays("c1", "how fast is express?", ai);
    expect(store.conversations.get("c1")!.mode).toBe("waiting");
    expect(store.messages.some((m) => m.content === "Maybe 2 days?")).toBe(false);
  });

  it("hands off when the AI call fails", async () => {
    const ai = new FakeAI(async () => {
      throw new Error("network down");
    });
    const out = await respondToVisitor({ store, ai, log: vi.fn() }, "c1", "hello?");
    expect(out[0].sender).toBe("ai");
    expect(store.conversations.get("c1")!.handoff_reason).toBe("ai_error");
  });

  it("hands off after repeated unhelpful feedback", async () => {
    const ai = new FakeAI(answered);
    await visitorSays("c1", "that didn't help", ai);
    expect(store.conversations.get("c1")!.mode).toBe("ai");
    expect(store.conversations.get("c1")!.unhelpful_count).toBe(1);
    await visitorSays("c1", "still not helpful", ai);
    expect(store.conversations.get("c1")!.handoff_reason).toBe("repeated_unhelpful");
  });

  it("the Talk to a person button hands off deterministically", async () => {
    const out = await requestHuman({ store }, "c1");
    expect(out).toHaveLength(1);
    expect(store.conversations.get("c1")!.mode).toBe("waiting");
  });

  it("does not hand off twice", async () => {
    await requestHuman({ store }, "c1");
    const again = await requestHuman({ store }, "c1");
    expect(again).toHaveLength(0);
  });
});

describe("AI pauses while a human is involved", () => {
  it.each(["waiting", "human"] as const)("stays silent in %s mode", async (mode) => {
    store.addConversation("c2", BIZ_A, { mode });
    const ai = new FakeAI(answered);
    const out = await visitorSays("c2", "hello? anyone there?", ai);
    expect(out).toEqual([]);
    expect(ai.calls).toHaveLength(0);
    expect(store.messages.filter((m) => m.conversation_id === "c2" && m.sender === "ai")).toHaveLength(0);
  });

  it("drops the AI reply if an agent takes over while the AI is thinking", async () => {
    const ai = new FakeAI(async () => {
      await store.updateConversation("c1", { mode: "human", assigned_agent_id: "agent-1" });
      return answered;
    });
    const out = await visitorSays("c1", "what's your return window?", ai);
    expect(out).toEqual([]);
    expect(store.messages.some((m) => m.sender === "ai")).toBe(false);
  });

  it("does nothing for closed conversations", async () => {
    store.addConversation("c3", BIZ_A, { status: "closed" });
    const ai = new FakeAI(answered);
    expect(await visitorSays("c3", "hi", ai)).toEqual([]);
    expect(ai.calls).toHaveLength(0);
  });
});
