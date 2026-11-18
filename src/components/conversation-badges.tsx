import { Badge } from "@/components/ui/primitives";
import { HANDOFF_REASON_LABELS, type HandoffReason } from "@/lib/support/handoff-rules";
import type { Conversation } from "@/lib/types";

export function ModeBadge({ conversation }: { conversation: Pick<Conversation, "mode" | "status"> }) {
  if (conversation.status === "closed") return <Badge tone="neutral">Closed</Badge>;
  if (conversation.mode === "waiting") return <Badge tone="warning">Waiting for agent</Badge>;
  if (conversation.mode === "human") return <Badge tone="brand">Agent handling</Badge>;
  return <Badge tone="ai">AI handling</Badge>;
}

export function handoffLabel(reason: string | null): string | null {
  if (!reason) return null;
  return HANDOFF_REASON_LABELS[reason as HandoffReason] ?? reason;
}
