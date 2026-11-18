import { Suspense } from "react";
import { PageHeader } from "@/components/ui/primitives";
import { requireBusiness } from "@/lib/auth";
import type { KnowledgeItem } from "@/lib/types";
import { KnowledgeManager } from "./knowledge-manager";

export const metadata = { title: "Knowledge base" };

export default function KnowledgePage() {
  return (
    <>
      <PageHeader
        title="Knowledge base"
        description="Everything your assistant knows. It answers only from this, plus the business details in Settings."
      />
      <Suspense fallback={<div className="h-80 animate-pulse rounded-xl bg-subtle" />}>
        <Loader />
      </Suspense>
    </>
  );
}

async function Loader() {
  const { supabase, business } = await requireBusiness();
  const { data } = await supabase
    .from("knowledge_items")
    .select("id, business_id, kind, title, content, file_path, file_name, status, error, created_at, updated_at")
    .eq("business_id", business.id)
    .order("updated_at", { ascending: false })
    .limit(1000);
  const items = ((data ?? []) as KnowledgeItem[]).map((i) => ({
    ...i,
    // Documents can be long; the list only needs a preview.
    content: i.kind === "document" ? i.content.slice(0, 400) : i.content,
  }));
  return <KnowledgeManager businessId={business.id} items={items} />;
}
