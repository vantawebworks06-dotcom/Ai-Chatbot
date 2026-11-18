import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  admin,
  anon,
  cleanup,
  createBusinessFor,
  createUser,
  enabled,
  makeAgent,
  type TestUser,
} from "./helpers";

// Tenant isolation, authentication and authorization, enforced by the
// database (row-level security and security-definer functions).

describe.skipIf(!enabled)("tenant isolation & authorization (live database)", () => {
  let ownerA: TestUser;
  let ownerB: TestUser;
  let agent: TestUser;
  let bizA: string;
  let bizB: string;
  let convB: string;

  beforeAll(async () => {
    [ownerA, ownerB, agent] = await Promise.all([createUser("a"), createUser("b"), createUser("agent")]);
    bizA = await createBusinessFor(ownerA, "Test Business A");
    bizB = await createBusinessFor(ownerB, "Test Business B");
    await makeAgent(agent);

    const db = admin();
    // Knowledge + a conversation for B, written by the server (service role).
    const { data: item } = await db
      .from("knowledge_items")
      .insert({ business_id: bizB, kind: "info", title: "B secret", content: "B-ONLY-SECRET-PHRASE" })
      .select("id")
      .single();
    await db.from("knowledge_chunks").insert({
      business_id: bizB,
      item_id: item!.id,
      chunk_index: 0,
      content: "B secret\n\nB-ONLY-SECRET-PHRASE refund window is 14 days",
    });
    const { data: itemA } = await db
      .from("knowledge_items")
      .insert({ business_id: bizA, kind: "info", title: "A info", content: "A refund window is 30 days" })
      .select("id")
      .single();
    await db.from("knowledge_chunks").insert({
      business_id: bizA,
      item_id: itemA!.id,
      chunk_index: 0,
      content: "A info\n\nA refund window is 30 days",
    });

    const { data: visitor } = await db
      .from("visitors")
      .insert({ business_id: bizB, token_hash: `test-${crypto.randomUUID()}` })
      .select("id")
      .single();
    const { data: conv } = await db
      .from("conversations")
      .insert({ business_id: bizB, visitor_id: visitor!.id })
      .select("id")
      .single();
    convB = conv!.id;
    await db.from("messages").insert({
      conversation_id: convB,
      business_id: bizB,
      sender: "visitor",
      content: "B customer message",
    });
  });

  afterAll(cleanup);

  it("creating a business makes the caller its owner with default chatbot settings", async () => {
    const { data } = await ownerA.client.from("chatbot_settings").select("business_id, enabled").eq("business_id", bizA);
    expect(data).toEqual([{ business_id: bizA, enabled: true }]);
  });

  it("an owner cannot see another business", async () => {
    const { data } = await ownerA.client.from("businesses").select("id");
    expect(data!.map((b) => b.id)).toEqual([bizA]);
  });

  it("an owner cannot read another business's knowledge, chunks, conversations or messages", async () => {
    for (const table of ["knowledge_items", "knowledge_chunks", "conversations", "messages", "visitors"]) {
      const { data, error } = await ownerA.client.from(table).select("business_id").eq("business_id", bizB);
      expect(error, table).toBeNull();
      expect(data, table).toEqual([]);
    }
  });

  it("an owner cannot write into another business", async () => {
    const insert = await ownerA.client
      .from("knowledge_items")
      .insert({ business_id: bizB, kind: "faq", title: "x", content: "y" });
    expect(insert.error).not.toBeNull();

    const update = await ownerA.client
      .from("chatbot_settings")
      .update({ bot_name: "Hijacked" })
      .eq("business_id", bizB)
      .select();
    expect(update.data).toEqual([]);
    const { data } = await admin().from("chatbot_settings").select("bot_name").eq("business_id", bizB).single();
    expect(data!.bot_name).not.toBe("Hijacked");
  });

  it("an owner cannot upload documents into another business's storage folder", async () => {
    const { error } = await ownerA.client.storage
      .from("knowledge-docs")
      .upload(`${bizB}/intrusion.txt`, new Blob(["x"], { type: "text/plain" }));
    expect(error).not.toBeNull();
  });

  it("knowledge retrieval only returns the requested business's chunks", async () => {
    const { data, error } = await admin().rpc("match_knowledge", {
      p_business_id: bizA,
      p_query: "refund window secret phrase",
      p_embedding: null,
      p_limit: 10,
    });
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThan(0);
    expect(JSON.stringify(data)).not.toContain("B-ONLY-SECRET-PHRASE");
  });

  it("clients cannot call the server-only retrieval function", async () => {
    const asOwner = await ownerA.client.rpc("match_knowledge", { p_business_id: bizB, p_query: "secret" });
    expect(asOwner.error).not.toBeNull();
    const asAnon = await anon().rpc("match_knowledge", { p_business_id: bizB, p_query: "secret" });
    expect(asAnon.error).not.toBeNull();
  });

  it("anonymous users can't read any tenant data", async () => {
    const client = anon();
    for (const table of ["businesses", "knowledge_items", "conversations", "messages", "visitors"]) {
      const { data } = await client.from(table).select("*").limit(1);
      expect(data ?? [], table).toEqual([]);
    }
  });

  it("business owners cannot act as agents", async () => {
    const send = await ownerB.client.rpc("agent_send_message", { p_conversation_id: convB, p_content: "hi" });
    expect(send.error?.message).toMatch(/platform agents/i);
    const claim = await ownerB.client.rpc("agent_claim_conversation", { p_conversation_id: convB });
    expect(claim.error).not.toBeNull();
  });

  it("owners can't change conversations directly", async () => {
    const { data, error } = await ownerB.client
      .from("conversations")
      .update({ mode: "human" })
      .eq("id", convB)
      .select();
    // Either refused outright (no UPDATE privilege) or no rows matched.
    expect(error !== null || (data ?? []).length === 0).toBe(true);
    const { data: row } = await admin().from("conversations").select("mode").eq("id", convB).single();
    expect(row!.mode).toBe("ai");
  });

  it("the platform agent sees conversations across all businesses", async () => {
    const { data } = await agent.client.from("conversations").select("id, business_id").eq("id", convB);
    expect(data).toEqual([{ id: convB, business_id: bizB }]);
  });

  it("agent actions: claim, reply, return to AI, close", async () => {
    const db = admin();

    const send = await agent.client.rpc("agent_send_message", { p_conversation_id: convB, p_content: "Hello from the team" });
    expect(send.error).toBeNull();
    let { data: c } = await db.from("conversations").select("*").eq("id", convB).single();
    expect(c.mode).toBe("human");
    expect(c.assigned_agent_id).toBe(agent.id);
    expect(c.agent_unread).toBe(0);

    const { data: msgs } = await db.from("messages").select("sender, content, business_id").eq("conversation_id", convB).order("id");
    expect(msgs!.at(-1)).toEqual({ sender: "agent", content: "Hello from the team", business_id: bizB });
    expect(msgs!.some((m) => m.sender === "system" && /joined/.test(m.content))).toBe(true);

    expect((await agent.client.rpc("agent_return_to_ai", { p_conversation_id: convB })).error).toBeNull();
    ({ data: c } = await db.from("conversations").select("*").eq("id", convB).single());
    expect(c.mode).toBe("ai");
    expect(c.assigned_agent_id).toBeNull();

    expect((await agent.client.rpc("agent_close_conversation", { p_conversation_id: convB })).error).toBeNull();
    ({ data: c } = await db.from("conversations").select("*").eq("id", convB).single());
    expect(c.status).toBe("closed");
  });

  it("message business_id always follows the conversation (cannot be spoofed)", async () => {
    const { data } = await admin()
      .from("messages")
      .insert({ conversation_id: convB, business_id: bizA, sender: "visitor", content: "spoof attempt" })
      .select("business_id")
      .single();
    expect(data!.business_id).toBe(bizB);
  });
});
