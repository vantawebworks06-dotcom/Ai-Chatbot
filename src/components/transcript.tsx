import { Sparkles } from "lucide-react";
import type { Message } from "@/lib/types";
import { cn, formatDateTime } from "@/lib/utils";

// Shared conversation transcript (business dashboard and agent workspace).
// From the support team's perspective: customer on the left, AI/agent on the right.

export function Transcript({
  messages,
  botName,
  agentNames = {},
}: {
  messages: Pick<Message, "id" | "sender" | "content" | "created_at" | "agent_id" | "metadata">[];
  botName: string;
  agentNames?: Record<string, string>;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {messages.map((m, i) => {
        if (m.sender === "system") {
          return (
            <div key={m.id} className="my-2 flex justify-center">
              <span className="rounded-full bg-subtle px-3 py-1 text-xs text-muted">
                {m.content} · {formatDateTime(m.created_at)}
              </span>
            </div>
          );
        }
        const customer = m.sender === "visitor";
        const showLabel = i === 0 || messages[i - 1].sender !== m.sender;
        const label =
          m.sender === "visitor"
            ? "Customer"
            : m.sender === "ai"
              ? botName
              : (m.agent_id && agentNames[m.agent_id]) || "Agent";
        const handoff = m.sender === "ai" && typeof m.metadata?.handoff === "string";

        return (
          <div key={m.id} className={cn("flex flex-col", customer ? "items-start" : "items-end", showLabel && "mt-2")}>
            {showLabel ? (
              <span
                className={cn(
                  "mb-1 flex items-center gap-1 px-1 text-[11.5px] font-medium",
                  m.sender === "ai" ? "text-ai" : "text-muted",
                )}
              >
                {m.sender === "ai" ? <Sparkles className="h-3 w-3" /> : null}
                {label}
                <span className="font-normal text-faint">· {formatDateTime(m.created_at)}</span>
              </span>
            ) : null}
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed break-words whitespace-pre-wrap sm:max-w-[75%]",
                customer && "rounded-tl-md border border-line bg-surface text-ink",
                m.sender === "ai" && "rounded-tr-md border border-ai/15 bg-ai-soft text-ink",
                m.sender === "agent" && "rounded-tr-md bg-brand text-white",
                handoff && "border-warning/30 bg-warning-soft",
              )}
            >
              {m.content}
            </div>
          </div>
        );
      })}
    </div>
  );
}
