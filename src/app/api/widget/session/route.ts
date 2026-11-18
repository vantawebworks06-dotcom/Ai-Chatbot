import { createAdminClient } from "@/lib/supabase/admin";
import type { Conversation, Message } from "@/lib/types";
import { generateVisitorToken, hashVisitorToken, isWellFormedToken } from "@/lib/widget/security";
import {
  handleError,
  json,
  loadWidgetBusiness,
  preflight,
  toPublicConversation,
  toPublicMessage,
} from "@/lib/widget/server";

export const OPTIONS = preflight;

// Starts or resumes a widget session.
// Body: { client_id, visitor_token? }
// Returns the chatbot's public config, a visitor token, and the visitor's
// most recent conversation (if it was active in the last 24 hours).
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      client_id?: unknown;
      visitor_token?: unknown;
    };
    const db = createAdminClient();
    const business = await loadWidgetBusiness(db, request, body.client_id);

    const config = {
      business_name: business.name,
      bot_name: business.bot_name,
      welcome_message: business.welcome_message,
      primary_color: business.primary_color,
      position: business.position,
    };
    if (!business.enabled) return json(request, { enabled: false });

    let token = isWellFormedToken(body.visitor_token) ? body.visitor_token : null;
    let visitorId: string | null = null;

    if (token) {
      const { data } = await db
        .from("visitors")
        .select("id")
        .eq("token_hash", hashVisitorToken(token))
        .eq("business_id", business.id)
        .maybeSingle();
      visitorId = data?.id ?? null;
    }

    if (!visitorId) {
      token = generateVisitorToken();
      const { data, error } = await db
        .from("visitors")
        .insert({ business_id: business.id, token_hash: hashVisitorToken(token) })
        .select("id")
        .single();
      if (error) throw error;
      visitorId = data.id as string;
    } else {
      await db.from("visitors").update({ last_seen_at: new Date().toISOString() }).eq("id", visitorId);
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: conv } = await db
      .from("conversations")
      .select("*")
      .eq("visitor_id", visitorId)
      .eq("business_id", business.id)
      .gte("last_message_at", since)
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let messages: Message[] = [];
    if (conv) {
      const { data } = await db
        .from("messages")
        .select("*")
        .eq("conversation_id", conv.id)
        .order("id", { ascending: true })
        .limit(200);
      messages = (data ?? []) as Message[];
    }

    return json(request, {
      enabled: true,
      config,
      visitor_token: token,
      conversation: conv ? toPublicConversation(conv as Conversation) : null,
      messages: messages.map(toPublicMessage),
    });
  } catch (error) {
    return handleError(request, error);
  }
}
