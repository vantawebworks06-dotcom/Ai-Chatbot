import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { handoffLabel, ModeBadge } from "@/components/conversation-badges";
import { Transcript } from "@/components/transcript";
import { Card } from "@/components/ui/primitives";
import { requireBusiness } from "@/lib/auth";
import type { Conversation, Message } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";
import { isUuid } from "@/lib/widget/security";

export const metadata = { title: "Conversation" };

export default function ConversationPage({ params }: PageProps<"/dashboard/conversations/[id]">) {
  return (
    <>
      <Link
        href="/dashboard/conversations"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> Conversations
      </Link>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-subtle" />}>
        <Detail params={params} />
      </Suspense>
    </>
  );
}

async function Detail({ params }: { params: PageProps<"/dashboard/conversations/[id]">["params"] }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { supabase, business } = await requireBusiness();

  // RLS also enforces this, but scope explicitly to the active business.
  const { data: conv } = await supabase
    .from("conversations")
    .select("*, visitors(name, email)")
    .eq("id", id)
    .eq("business_id", business.id)
    .maybeSingle();
  if (!conv) notFound();

  const [{ data: messages }, { data: settings }] = await Promise.all([
    supabase.from("messages").select("*").eq("conversation_id", id).order("id").limit(1000),
    supabase.from("chatbot_settings").select("bot_name").eq("business_id", business.id).single(),
  ]);

  const c = conv as Conversation & { visitors: { name: string | null; email: string | null } | null };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <Card className="p-4 sm:p-6">
        <Transcript messages={(messages ?? []) as Message[]} botName={settings?.bot_name ?? "Assistant"} />
      </Card>
      <Card className="h-fit p-5">
        <dl className="space-y-4 text-sm">
          <Meta label="Customer">{c.visitors?.name || "Website visitor"}</Meta>
          {c.visitors?.email ? <Meta label="Email">{c.visitors.email}</Meta> : null}
          <Meta label="Status">
            <ModeBadge conversation={c} />
          </Meta>
          {c.handoff_at ? (
            <Meta label="Transferred">
              {handoffLabel(c.handoff_reason)}
              <span className="block text-xs text-muted">{formatDateTime(c.handoff_at)}</span>
            </Meta>
          ) : (
            <Meta label="Handled by">AI assistant only</Meta>
          )}
          <Meta label="Started">{formatDateTime(c.created_at)}</Meta>
          {c.page_url ? (
            <Meta label="Page">
              <span className="break-all text-muted">{c.page_url}</span>
            </Meta>
          ) : null}
        </dl>
      </Card>
    </div>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-1 text-ink">{children}</dd>
    </div>
  );
}
