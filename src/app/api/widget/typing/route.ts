import { createAdminClient } from "@/lib/supabase/admin";
import {
  authenticateVisitor,
  handleError,
  json,
  loadVisitorConversation,
  loadWidgetBusiness,
  preflight,
} from "@/lib/widget/server";

export const OPTIONS = preflight;

// POST { client_id, conversation_id } - the customer is typing.
// Only recorded while a human agent is involved, so agents see it live.
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      client_id?: unknown;
      conversation_id?: unknown;
    };
    const db = createAdminClient();
    const business = await loadWidgetBusiness(db, request, body.client_id);
    const visitor = await authenticateVisitor(db, request, business.id);
    const conversation = await loadVisitorConversation(db, body.conversation_id, visitor);

    if (conversation.mode !== "ai" && conversation.status === "open") {
      await db
        .from("conversations")
        .update({ visitor_typing_at: new Date().toISOString() })
        .eq("id", conversation.id);
    }
    return json(request, { ok: true });
  } catch (error) {
    return handleError(request, error);
  }
}
