import { ArrowRight, BookOpen, Bot, CheckCircle2, Circle, Code2 } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { ModeBadge } from "@/components/conversation-badges";
import { Card, CardHeader, EmptyState, PageHeader, buttonClass } from "@/components/ui/primitives";
import { requireBusiness } from "@/lib/auth";
import type { Conversation } from "@/lib/types";
import { daysAgoIso, formatRelative } from "@/lib/utils";

export const metadata = { title: "Overview" };

export default function OverviewPage() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-subtle" />}>
      <Overview />
    </Suspense>
  );
}

async function Overview() {
  const { supabase, business } = await requireBusiness();
  const since = daysAgoIso(30);

  const [convs, knowledge, settings, recent] = await Promise.all([
    supabase
      .from("conversations")
      .select("id, mode, status, handoff_at")
      .eq("business_id", business.id)
      .gte("created_at", since)
      .not("last_message_at", "is", null)
      .limit(5000),
    supabase
      .from("knowledge_items")
      .select("id", { count: "exact", head: true })
      .eq("business_id", business.id),
    supabase.from("chatbot_settings").select("enabled, bot_name").eq("business_id", business.id).single(),
    supabase
      .from("conversations")
      .select("id, mode, status, last_message_at, last_message_preview, visitors(name, email)")
      .eq("business_id", business.id)
      .not("last_message_at", "is", null)
      .order("last_message_at", { ascending: false })
      .limit(6),
  ]);

  const rows = (convs.data ?? []) as Pick<Conversation, "id" | "mode" | "status" | "handoff_at">[];
  const total = rows.length;
  const handedOff = rows.filter((c) => c.handoff_at).length;
  const aiResolved = total - handedOff;
  const waiting = rows.filter((c) => c.status === "open" && c.mode === "waiting").length;
  const aiRate = total ? Math.round((aiResolved / total) * 100) : 0;

  const knowledgeCount = knowledge.count ?? 0;
  const hasConversations = (recent.data ?? []).length > 0;
  const steps = [
    { done: knowledgeCount > 0, label: "Add knowledge your assistant can use", href: "/dashboard/knowledge", icon: BookOpen },
    { done: settings.data?.bot_name !== `${business.name.slice(0, 48)} Support`, label: "Customize your chatbot", href: "/dashboard/chatbot", icon: Bot },
    { done: hasConversations, label: "Install the widget on your website", href: "/dashboard/install", icon: Code2 },
  ];
  const setupDone = steps.every((s) => s.done);

  type RecentRow = Pick<Conversation, "id" | "mode" | "status" | "last_message_at" | "last_message_preview"> & {
    visitors: { name: string | null; email: string | null } | null;
  };

  return (
    <>
      <PageHeader
        title="Overview"
        description={`Last 30 days for ${business.name}`}
        actions={
          <Link href="/dashboard/install" className={buttonClass("secondary", "sm")}>
            <Code2 className="h-4 w-4" /> Install widget
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Conversations" value={total} />
        <Stat label="Resolved by AI" value={`${aiRate}%`} hint={`${aiResolved} of ${total}`} accent="ai" />
        <Stat label="Handed to a person" value={handedOff} />
        <Stat label="Waiting now" value={waiting} accent={waiting ? "warning" : undefined} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card>
          <CardHeader
            title="Recent conversations"
            action={
              <Link href="/dashboard/conversations" className="text-[13px] font-medium text-brand hover:underline">
                View all
              </Link>
            }
          />
          {hasConversations ? (
            <ul className="divide-y divide-line">
              {((recent.data ?? []) as unknown as RecentRow[]).map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/dashboard/conversations/${c.id}`}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-canvas"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">
                        {c.visitors?.name || c.visitors?.email || "Website visitor"}
                      </p>
                      <p className="truncate text-[13px] text-muted">{c.last_message_preview}</p>
                    </div>
                    <ModeBadge conversation={c} />
                    <span className="w-10 text-right text-xs text-faint">{formatRelative(c.last_message_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="No conversations yet"
              description="Once the widget is on your website, customer chats will appear here."
            />
          )}
        </Card>

        <Card className="h-fit">
          <CardHeader
            title={setupDone ? "You're all set" : "Get started"}
            description={setupDone ? "Your assistant is live." : "Three steps to go live."}
          />
          <ul className="p-2">
            {steps.map((s) => (
              <li key={s.href}>
                <Link href={s.href} className="group flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-canvas">
                  {s.done ? (
                    <CheckCircle2 className="h-[18px] w-[18px] text-success" />
                  ) : (
                    <Circle className="h-[18px] w-[18px] text-line-strong" />
                  )}
                  <span className={s.done ? "flex-1 text-sm text-muted line-through" : "flex-1 text-sm text-ink"}>
                    {s.label}
                  </span>
                  <ArrowRight className="h-4 w-4 text-faint opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
              </li>
            ))}
          </ul>
          <div className="border-t border-line px-5 py-3 text-[13px] text-muted">
            Chatbot is{" "}
            <span className={settings.data?.enabled ? "font-medium text-success" : "font-medium text-danger"}>
              {settings.data?.enabled ? "on" : "off"}
            </span>
            {" · "}
            {knowledgeCount} knowledge {knowledgeCount === 1 ? "entry" : "entries"}
          </div>
        </Card>
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: "ai" | "warning";
}) {
  return (
    <Card className="px-4 py-3.5">
      <p className="text-[13px] text-muted">{label}</p>
      <p
        className={
          accent === "ai"
            ? "mt-1 text-2xl font-semibold tracking-tight text-ai"
            : accent === "warning"
              ? "mt-1 text-2xl font-semibold tracking-tight text-warning"
              : "mt-1 text-2xl font-semibold tracking-tight text-ink"
        }
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-faint">{hint}</p> : null}
    </Card>
  );
}
