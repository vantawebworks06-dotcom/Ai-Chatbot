import { requestHuman } from "@/lib/support/engine";
import { createSupabaseStore } from "@/lib/support/store";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeMessage } from "@/lib/widget/security";
import {
  authenticateVisitor,
  handleError,
  json,
  loadVisitorConversation,
  loadWidgetBusiness,
  preflight,
  toPublicConversation,
  toPublicMessage,
} from "@/lib/widget/server";

export const OPTIONS = preflight;

// POST { client_id, conversation_id, name?, email? }
// The customer pressed "Talk to a person". Deterministic: no AI involved.
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      client_id?: unknown;
      conversation_id?: unknown;
      name?: unknown;
      email?: unknown;
    };
    const db = createAdminClient();
    const business = await loadWidgetBusiness(db, request, body.client_id);
    const visitor = await authenticateVisitor(db, request, business.id);
    const conversation = await loadVisitorConversation(db, body.conversation_id, visitor);

    const name = sanitizeMessage(body.name, 120);
    const email = sanitizeMessage(body.email, 254);
    if (name || email) {
      await db
        .from("visitors")
        .update({
          ...(name ? { name } : {}),
          ...(email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? { email } : {}),
        })
        .eq("id", visitor.id);
    }

    const store = createSupabaseStore(db);
    const messages = await requestHuman({ store }, conversation.id);
    const latest = (await store.getConversation(conversation.id)) ?? conversation;

    return json(request, {
      conversation: toPublicConversation(latest),
      messages: messages.map(toPublicMessage),
    });
  } catch (error) {
    return handleError(request, error);
  }
}
