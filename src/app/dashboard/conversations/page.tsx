import { MessagesSquare, Search } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { handoffLabel, ModeBadge } from "@/components/conversation-badges";
import { Card, EmptyState, Input, PageHeader } from "@/components/ui/primitives";
import { requireBusiness } from "@/lib/auth";
import type { Conversation } from "@/lib/types";
import { cn, formatRelative } from "@/lib/utils";

export const metadata = { title: "Conversations" };

const FILTERS = [
  { key: "all", label: "All" },
  { key: "ai", label: "Handled by AI" },
  { key: "handoff", label: "Transferred to a person" },
  { key: "open", label: "Open" },
] as const;

export default function ConversationsPage({ searchParams }: PageProps<"/dashboard/conversations">) {
  return (
    <>
      <PageHeader title="Conversations" description="Every chat from your website, with its full history." />
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-subtle" />}>
        <List searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function List({ searchParams }: { searchParams: PageProps<"/dashboard/conversations">["searchParams"] }) {
  const sp = await searchParams;
  const filter = typeof sp.filter === "string" ? sp.filter : "all";
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const { supabase, business } = await requireBusiness();

  let ids: string[] | null = null;
  if (q) {
    const { data: hits } = await supabase
      .from("messages")
      .select("conversation_id")
      .eq("business_id", business.id)
      .ilike("content", `%${q.replace(/[%_]/g, "")}%`)
      .limit(500);
    ids = [...new Set((hits ?? []).map((h) => h.conversation_id as string))];
  }

  let query = supabase
    .from("conversations")
    .select(
      "id, mode, status, handoff_reason, handoff_at, last_message_at, last_message_preview, created_at, visitors(name, email)",
    )
    .eq("business_id", business.id)
    .not("last_message_at", "is", null);
  if (filter === "ai") query = query.filter("handoff_at", "is", null);
  if (filter === "handoff") query = query.filter("handoff_at", "not.is", null);
  if (filter === "open") query = query.filter("status", "eq", "open");
  if (ids) query = query.in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);

  const { data } = await query.order("last_message_at", { ascending: false }).limit(100);
  type Row = Pick<
    Conversation,
    "id" | "mode" | "status" | "handoff_reason" | "handoff_at" | "last_message_at" | "last_message_preview" | "created_at"
  > & { visitors: { name: string | null; email: string | null } | null };
  const rows = (data ?? []) as unknown as Row[];

  return (
    <Card>
      <div className="flex flex-col gap-3 border-b border-line p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 overflow-x-auto">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={{ query: { ...(q ? { q } : {}), filter: f.key } }}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-[13px] font-medium whitespace-nowrap",
                filter === f.key ? "bg-subtle text-ink" : "text-muted hover:text-ink",
              )}
            >
              {f.label}
            </Link>
          ))}
        </div>
        <form className="relative sm:w-64">
          <input type="hidden" name="filter" value={filter} />
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-faint" />
          <Input name="q" defaultValue={q} placeholder="Search messages" className="pl-8" />
        </form>
      </div>

      {rows.length ? (
        <ul className="divide-y divide-line">
          {rows.map((c) => (
            <li key={c.id}>
              <Link href={`/dashboard/conversations/${c.id}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-canvas">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-ink">
                      {c.visitors?.name || c.visitors?.email || "Website visitor"}
                    </p>
                    {c.handoff_at ? (
                      <span className="hidden text-xs text-muted sm:inline">· {handoffLabel(c.handoff_reason)}</span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate text-[13px] text-muted">{c.last_message_preview}</p>
                </div>
                <ModeBadge conversation={c} />
                <span className="hidden w-12 text-right text-xs text-faint sm:block">
                  {formatRelative(c.last_message_at)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<MessagesSquare className="h-5 w-5" />}
          title={q ? "No matching conversations" : "No conversations yet"}
          description={q ? "Try a different search." : "Chats from your website will show up here."}
        />
      )}
    </Card>
  );
}
