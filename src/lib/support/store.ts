import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { embed, toPgVector } from "@/lib/ai/embeddings";
import type {
  Business,
  ChatbotSettings,
  Conversation,
  KnowledgeMatch,
  Message,
  MessageSender,
} from "@/lib/types";
import type { SupportStore } from "./engine";

/** When a business has at most this many chunks, send them all to the AI. */
const SMALL_KNOWLEDGE_BASE = 16;
const MAX_MATCHES = 8;

/**
 * Supabase-backed store used by the support engine. Uses the service-role
 * client, so every query below is explicitly scoped by id/business_id.
 */
export function createSupabaseStore(db: SupabaseClient): SupportStore {
  return {
    async getConversation(id) {
      const { data, error } = await db.from("conversations").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return (data as Conversation | null) ?? null;
    },

    async getRecentMessages(conversationId, limit) {
      const { data, error } = await db
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("id", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return ((data ?? []) as Message[]).reverse();
    },

    async insertMessage(conversationId, sender: MessageSender, content, metadata = {}) {
      const { data, error } = await db
        .from("messages")
        .insert({
          conversation_id: conversationId,
          // Placeholder: a database trigger sets the real business_id from the conversation.
          business_id: "00000000-0000-0000-0000-000000000000",
          sender,
          content: content.slice(0, 8000),
          metadata,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as Message;
    },

    async updateConversation(id, patch) {
      const { error } = await db.from("conversations").update(patch).eq("id", id);
      if (error) throw error;
    },

    async getBotContext(businessId) {
      const [biz, settings] = await Promise.all([
        db.from("businesses").select("*").eq("id", businessId).single(),
        db.from("chatbot_settings").select("*").eq("business_id", businessId).single(),
      ]);
      if (biz.error) throw biz.error;
      if (settings.error) throw settings.error;
      return { business: biz.data as Business, settings: settings.data as ChatbotSettings };
    },

    async retrieveKnowledge(businessId, query) {
      return retrieveKnowledge(db, businessId, query);
    },
  };
}

export async function retrieveKnowledge(
  db: SupabaseClient,
  businessId: string,
  query: string,
): Promise<KnowledgeMatch[]> {
  const { count, error: countError } = await db
    .from("knowledge_chunks")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId);
  if (countError) throw countError;
  if (!count) return [];

  // Small knowledge bases: give the AI everything (still one business only).
  if (count <= SMALL_KNOWLEDGE_BASE) {
    const { data, error } = await db
      .from("knowledge_chunks")
      .select("id, item_id, content, knowledge_items!inner(title, kind)")
      .eq("business_id", businessId)
      .order("id")
      .limit(SMALL_KNOWLEDGE_BASE);
    if (error) throw error;
    type Row = {
      id: number;
      item_id: string;
      content: string;
      knowledge_items: { title: string; kind: KnowledgeMatch["kind"] };
    };
    return ((data ?? []) as unknown as Row[]).map((row) => ({
      chunk_id: row.id,
      item_id: row.item_id,
      title: row.knowledge_items.title,
      kind: row.knowledge_items.kind,
      content: row.content,
      score: 1,
    }));
  }

  let embedding: string | null = null;
  try {
    const vectors = await embed([query], "query");
    if (vectors) embedding = toPgVector(vectors[0]);
  } catch {
    // Fall back to full-text search only.
  }

  const { data, error } = await db.rpc("match_knowledge", {
    p_business_id: businessId,
    p_query: query,
    p_embedding: embedding,
    p_limit: MAX_MATCHES,
  });
  if (error) throw error;
  return (data ?? []) as KnowledgeMatch[];
}
