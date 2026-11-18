// Row shapes for the tables in supabase/migrations. Kept by hand so the app
// does not depend on generated types.

export type ConversationMode = "ai" | "waiting" | "human";
export type ConversationStatus = "open" | "closed";
export type MessageSender = "visitor" | "ai" | "agent" | "system";

export type KnowledgeKind =
  | "faq"
  | "product"
  | "shipping_policy"
  | "return_policy"
  | "info"
  | "document";

export interface Business {
  id: string;
  name: string;
  website_url: string | null;
  description: string | null;
  industry: string | null;
  country: string | null;
  timezone: string;
  currency: string;
  phone: string | null;
  support_email: string | null;
  address: string | null;
  business_hours: string | null;
  created_at: string;
}

export interface ChatbotSettings {
  business_id: string;
  enabled: boolean;
  bot_name: string;
  welcome_message: string;
  primary_color: string;
  position: "right" | "left";
  allowed_domains: string[];
}

export interface KnowledgeItem {
  id: string;
  business_id: string;
  kind: KnowledgeKind;
  title: string;
  content: string;
  file_path: string | null;
  file_name: string | null;
  status: "processing" | "ready" | "error";
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface Visitor {
  id: string;
  business_id: string;
  name: string | null;
  email: string | null;
  created_at: string;
  last_seen_at: string;
}

export interface Conversation {
  id: string;
  business_id: string;
  visitor_id: string;
  status: ConversationStatus;
  mode: ConversationMode;
  assigned_agent_id: string | null;
  handoff_reason: string | null;
  handoff_at: string | null;
  unhelpful_count: number;
  agent_unread: number;
  last_message_at: string | null;
  last_message_preview: string | null;
  visitor_typing_at: string | null;
  agent_typing_at: string | null;
  page_url: string | null;
  created_at: string;
  closed_at: string | null;
}

export interface Message {
  id: number;
  conversation_id: string;
  business_id: string;
  sender: MessageSender;
  agent_id: string | null;
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface KnowledgeMatch {
  chunk_id: number;
  item_id: string;
  title: string;
  kind: KnowledgeKind;
  content: string;
  score: number;
}

export const KNOWLEDGE_KIND_LABELS: Record<KnowledgeKind, string> = {
  faq: "FAQ",
  product: "Product",
  shipping_policy: "Shipping & delivery",
  return_policy: "Returns & refunds",
  info: "General info",
  document: "Document",
};
