import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Conversation, Message, Visitor } from "@/lib/types";
import {
  bearerToken,
  hashVisitorToken,
  isOriginAllowed,
  isUuid,
  isWellFormedToken,
} from "./security";

// Server helpers shared by the /api/widget/* routes.

export class WidgetError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function corsHeaders(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function json(request: Request, body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { ...corsHeaders(request.headers.get("origin")), "Cache-Control": "no-store" },
  });
}

export function preflight(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) });
}

export function handleError(request: Request, error: unknown): Response {
  if (error instanceof WidgetError) {
    return json(request, { error: error.message }, error.status);
  }
  console.error("[widget]", error);
  return json(request, { error: "Something went wrong. Please try again." }, 500);
}

export interface WidgetBusiness {
  id: string;
  name: string;
  enabled: boolean;
  bot_name: string;
  welcome_message: string;
  primary_color: string;
  position: "right" | "left";
  allowed_domains: string[];
}

/** Loads public widget config for a client id and checks the calling site. */
export async function loadWidgetBusiness(
  db: SupabaseClient,
  request: Request,
  clientId: unknown,
): Promise<WidgetBusiness> {
  if (!isUuid(clientId)) throw new WidgetError(400, "Invalid client id");

  const { data, error } = await db
    .from("chatbot_settings")
    .select(
      "business_id, enabled, bot_name, welcome_message, primary_color, position, allowed_domains, businesses!inner(name)",
    )
    .eq("business_id", clientId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new WidgetError(404, "Chatbot not found");

  const row = data as unknown as Omit<WidgetBusiness, "id" | "name"> & {
    business_id: string;
    businesses: { name: string };
  };

  if (!isOriginAllowed(request.headers.get("origin"), row.allowed_domains)) {
    throw new WidgetError(403, "This website is not allowed to use this chatbot");
  }

  return {
    id: row.business_id,
    name: row.businesses.name,
    enabled: row.enabled,
    bot_name: row.bot_name,
    welcome_message: row.welcome_message,
    primary_color: row.primary_color,
    position: row.position,
    allowed_domains: row.allowed_domains,
  };
}

/** Finds the visitor for the request's bearer token, within one business. */
export async function authenticateVisitor(
  db: SupabaseClient,
  request: Request,
  businessId: string,
): Promise<Visitor> {
  const token = bearerToken(request.headers.get("authorization"));
  if (!isWellFormedToken(token)) throw new WidgetError(401, "Missing visitor session");

  const { data, error } = await db
    .from("visitors")
    .select("id, business_id, name, email, created_at, last_seen_at")
    .eq("token_hash", hashVisitorToken(token))
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new WidgetError(401, "Visitor session not found");
  return data as Visitor;
}

/** Loads a conversation and confirms it belongs to this visitor and business. */
export async function loadVisitorConversation(
  db: SupabaseClient,
  conversationId: unknown,
  visitor: Visitor,
): Promise<Conversation> {
  if (!isUuid(conversationId)) throw new WidgetError(400, "Invalid conversation id");
  const { data, error } = await db
    .from("conversations")
    .select("*")
    .eq("id", conversationId)
    .eq("visitor_id", visitor.id)
    .eq("business_id", visitor.business_id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new WidgetError(404, "Conversation not found");
  return data as Conversation;
}

export interface PublicMessage {
  id: number;
  sender: Message["sender"];
  content: string;
  created_at: string;
}

export function toPublicMessage(m: Message): PublicMessage {
  return { id: m.id, sender: m.sender, content: m.content, created_at: m.created_at };
}

export function toPublicConversation(c: Conversation) {
  const typingFresh =
    c.agent_typing_at && Date.now() - new Date(c.agent_typing_at).getTime() < 6000;
  return {
    id: c.id,
    status: c.status,
    mode: c.mode,
    agent_typing: Boolean(c.mode === "human" && typingFresh),
  };
}

export async function listMessagesAfter(
  db: SupabaseClient,
  conversationId: string,
  afterId: number,
): Promise<Message[]> {
  const { data, error } = await db
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .gt("id", afterId)
    .order("id", { ascending: true })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as Message[];
}

/** Basic abuse protection: at most N customer messages per minute per conversation. */
export async function enforceRateLimit(
  db: SupabaseClient,
  conversationId: string,
  limitPerMinute = 12,
): Promise<void> {
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count, error } = await db
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId)
    .eq("sender", "visitor")
    .gte("created_at", since);
  if (error) throw error;
  if ((count ?? 0) >= limitPerMinute) {
    throw new WidgetError(429, "You're sending messages too quickly. Please wait a moment.");
  }
}
