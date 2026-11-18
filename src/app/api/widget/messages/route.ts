import { getSupportAI } from "@/lib/ai";
import { respondToVisitor } from "@/lib/support/engine";
import { createSupabaseStore } from "@/lib/support/store";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Conversation } from "@/lib/types";
import { sanitizeMessage } from "@/lib/widget/security";
import {
  authenticateVisitor,
  enforceRateLimit,
  handleError,
  json,
  listMessagesAfter,
  loadVisitorConversation,
  loadWidgetBusiness,
  preflight,
  toPublicConversation,
  toPublicMessage,
  WidgetError,
} from "@/lib/widget/server";

export const OPTIONS = preflight;
export const maxDuration = 60;

// GET ?client_id=&conversation_id=&after=<message id>
// Polled by the widget for new messages, mode changes and agent typing.
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const db = createAdminClient();
    const business = await loadWidgetBusiness(db, request, url.searchParams.get("client_id"));
    const visitor = await authenticateVisitor(db, request, business.id);
    const conversation = await loadVisitorConversation(
      db,
      url.searchParams.get("conversation_id"),
      visitor,
    );
    const after = Number(url.searchParams.get("after") ?? 0) || 0;
    const messages = await listMessagesAfter(db, conversation.id, after);

    return json(request, {
      conversation: toPublicConversation(conversation),
      messages: messages.map(toPublicMessage),
    });
  } catch (error) {
    return handleError(request, error);
  }
}

// POST { client_id, conversation_id?, content, page_url? }
// Saves the customer's message, then lets the support engine reply (or not,
// if a human is in control). Starts a new conversation when needed.
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      client_id?: unknown;
      conversation_id?: unknown;
      content?: unknown;
      page_url?: unknown;
    };
    const content = sanitizeMessage(body.content);
    if (!content) throw new WidgetError(400, "Message is empty");

    const db = createAdminClient();
    const business = await loadWidgetBusiness(db, request, body.client_id);
    if (!business.enabled) throw new WidgetError(403, "This chatbot is currently turned off");
    const visitor = await authenticateVisitor(db, request, business.id);

    let conversation: Conversation | null = null;
    if (body.conversation_id) {
      conversation = await loadVisitorConversation(db, body.conversation_id, visitor);
      if (conversation.status === "closed") conversation = null;
    }
    if (!conversation) {
      const pageUrl =
        typeof body.page_url === "string" ? body.page_url.slice(0, 500) : null;
      const { data, error } = await db
        .from("conversations")
        .insert({ business_id: business.id, visitor_id: visitor.id, page_url: pageUrl })
        .select("*")
        .single();
      if (error) throw error;
      conversation = data as Conversation;
    }

    await enforceRateLimit(db, conversation.id);

    const store = createSupabaseStore(db);
    const visitorMessage = await store.insertMessage(conversation.id, "visitor", content);

    // Visitors can't stop the AI from replying, but the engine checks the
    // conversation mode and stays silent when a human is in control.
    let replies: Awaited<ReturnType<typeof respondToVisitor>> = [];
    if (conversation.mode === "ai") {
      replies = await respondToVisitor(
        { store, ai: getSupportAI(), log: (m, e) => console.error(`[engine] ${m}`, e) },
        conversation.id,
        content,
      );
    }

    const latest = (await store.getConversation(conversation.id)) ?? conversation;
    return json(request, {
      conversation: toPublicConversation(latest),
      messages: [visitorMessage, ...replies].map(toPublicMessage),
    });
  } catch (error) {
    return handleError(request, error);
  }
}
