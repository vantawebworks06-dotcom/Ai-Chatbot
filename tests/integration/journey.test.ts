import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, cleanup, createBusinessFor, createUser, enabled, makeAgent, type TestUser } from "./helpers";

// End-to-end customer journey through the real HTTP API of a running app
// (npm run dev or a deployed URL), with the real AI provider.
// Requires RUN_INTEGRATION=1 and VELORA_TEST_URL (not BASE_URL, which Vite reserves), e.g. VELORA_TEST_URL=http://localhost:3000

const BASE_URL = process.env.VELORA_TEST_URL?.replace(/\/$/, "");

describe.skipIf(!enabled || !BASE_URL)("customer journey via the widget API (live app + AI)", () => {
  let owner: TestUser;
  let agent: TestUser;
  let businessId: string;
  let token: string;
  let conversationId: string;
  let lastId = 0;

  async function widget(method: "GET" | "POST", path: string, body?: Record<string, unknown>) {
    const res = await fetch(`${BASE_URL}/api/widget${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Origin: "https://test-shop.example",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify({ client_id: businessId, ...body }) : undefined,
    });
    const json = await res.json();
    return { status: res.status, json };
  }

  async function poll() {
    const { json } = await widget(
      "GET",
      `/messages?client_id=${businessId}&conversation_id=${conversationId}&after=${lastId}`,
    );
    for (const m of json.messages) lastId = Math.max(lastId, m.id);
    return json as { conversation: { mode: string; status: string }; messages: { sender: string; content: string }[] };
  }

  beforeAll(async () => {
    owner = await createUser("journey-owner");
    agent = await createUser("journey-agent");
    await makeAgent(agent);

    // 1. A business creates an account and configures its chatbot.
    businessId = await createBusinessFor(owner, "Northwind Coffee (test)");
    await owner.client
      .from("chatbot_settings")
      .update({ bot_name: "Nora", welcome_message: "Hi! Ask me anything about Northwind." })
      .eq("business_id", businessId);
    await owner.client
      .from("businesses")
      .update({ business_hours: "Mon–Sat 07:00–19:00, closed Sundays" })
      .eq("id", businessId);

    // 2. It adds knowledge (indexed the same way the dashboard does).
    const { data: item } = await owner.client
      .from("knowledge_items")
      .insert({
        business_id: businessId,
        kind: "shipping_policy",
        title: "Shipping",
        content: "We ship coffee beans across Europe. Delivery takes 2–4 business days and costs 4.90 EUR. Free shipping over 40 EUR.",
      })
      .select("id")
      .single();
    await admin().from("knowledge_chunks").insert({
      business_id: businessId,
      item_id: item!.id,
      chunk_index: 0,
      content:
        "Shipping\n\nWe ship coffee beans across Europe. Delivery takes 2–4 business days and costs 4.90 EUR. Free shipping over 40 EUR.",
    });
  });

  afterAll(cleanup);

  it("3. the widget starts a session with the business's branding", async () => {
    const { status, json } = await widget("POST", "/session", {});
    expect(status).toBe(200);
    expect(json.enabled).toBe(true);
    expect(json.config.bot_name).toBe("Nora");
    expect(json.config.business_name).toBe("Northwind Coffee (test)");
    token = json.visitor_token;
    expect(token).toMatch(/^vt_/);
  });

  it("rejects requests without a valid visitor token", async () => {
    const saved = token;
    token = "";
    const { status } = await widget("POST", "/messages", { content: "hi" });
    token = saved;
    expect(status).toBe(401);
  });

  it("4. the AI answers from the knowledge base", async () => {
    const { status, json } = await widget("POST", "/messages", {
      content: "How long does delivery take and how much is shipping?",
      page_url: "https://test-shop.example/products",
    });
    expect(status).toBe(200);
    conversationId = json.conversation.id;
    for (const m of json.messages) lastId = Math.max(lastId, m.id);

    const reply = json.messages.find((m: { sender: string }) => m.sender === "ai");
    expect(reply).toBeTruthy();
    expect(json.conversation.mode).toBe("ai");
    expect(reply.content).toMatch(/2.?4|4[.,]90/);
  });

  it("5. an unanswerable question is transferred to a human", async () => {
    const { json } = await widget("POST", "/messages", {
      conversation_id: conversationId,
      content: "What's the name of your head roaster's dog?",
    });
    for (const m of json.messages) lastId = Math.max(lastId, m.id);
    expect(json.conversation.mode).toBe("waiting");

    const { data } = await admin().from("conversations").select("mode, handoff_reason").eq("id", conversationId).single();
    expect(data!.mode).toBe("waiting");
    expect(["no_knowledge", "low_confidence"]).toContain(data!.handoff_reason);
  });

  it("6. it appears in the agent's queue", async () => {
    const { data } = await agent.client
      .from("conversations")
      .select("id, mode, businesses(name)")
      .eq("status", "open")
      .eq("mode", "waiting");
    expect(data!.some((c) => c.id === conversationId)).toBe(true);
  });

  it("7. the agent replies and the customer receives it in the same chat", async () => {
    const { error } = await agent.client.rpc("agent_send_message", {
      p_conversation_id: conversationId,
      p_content: "Hi, I'm from the Northwind team. Happy to help!",
    });
    expect(error).toBeNull();

    const update = await poll();
    expect(update.conversation.mode).toBe("human");
    expect(update.messages.some((m) => m.sender === "agent" && m.content.includes("Northwind team"))).toBe(true);
  });

  it("8. the AI stays paused while the agent is in control", async () => {
    const { json } = await widget("POST", "/messages", {
      conversation_id: conversationId,
      content: "How long does delivery take?",
    });
    expect(json.messages.map((m: { sender: string }) => m.sender)).toEqual(["visitor"]);
    for (const m of json.messages) lastId = Math.max(lastId, m.id);
  });

  it("9. the agent returns it to AI mode, and the AI answers again", async () => {
    await agent.client.rpc("agent_return_to_ai", { p_conversation_id: conversationId });
    const { json } = await widget("POST", "/messages", {
      conversation_id: conversationId,
      content: "Is shipping free if I spend 50 EUR?",
    });
    const { data: conv } = await admin()
      .from("conversations")
      .select("handoff_reason")
      .eq("id", conversationId)
      .single();
    expect(json.conversation.mode, `handed off: ${conv?.handoff_reason}; ${JSON.stringify(json.messages)}`).toBe("ai");
    expect(json.messages.some((m: { sender: string }) => m.sender === "ai")).toBe(true);
  });

  it("10. the Talk to a person button hands off deterministically", async () => {
    const { json } = await widget("POST", "/handoff", { conversation_id: conversationId, name: "Test Customer" });
    expect(json.conversation.mode).toBe("waiting");
  });

  it("11. the agent closes the conversation; the next message starts a new one", async () => {
    await agent.client.rpc("agent_close_conversation", { p_conversation_id: conversationId });
    const update = await poll();
    expect(update.conversation.status).toBe("closed");

    const { json } = await widget("POST", "/messages", { conversation_id: conversationId, content: "Hello again" });
    expect(json.conversation.id).not.toBe(conversationId);
  });

  it("a visitor cannot read another visitor's conversation", async () => {
    const other = await fetch(`${BASE_URL}/api/widget/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: businessId }),
    }).then((r) => r.json());
    const res = await fetch(
      `${BASE_URL}/api/widget/messages?client_id=${businessId}&conversation_id=${conversationId}&after=0`,
      { headers: { Authorization: `Bearer ${other.visitor_token}` } },
    );
    expect(res.status).toBe(404);
  });
});
