import { Suspense } from "react";
import { PageHeader } from "@/components/ui/primitives";
import { requireBusiness } from "@/lib/auth";
import type { ChatbotSettings } from "@/lib/types";
import { ChatbotForm } from "./chatbot-form";

export const metadata = { title: "Chatbot" };

export default function ChatbotPage() {
  return (
    <>
      <PageHeader title="Chatbot" description="How your assistant looks and greets customers." />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-subtle" />}>
        <Loader />
      </Suspense>
    </>
  );
}

async function Loader() {
  const { supabase, business } = await requireBusiness();
  const { data } = await supabase.from("chatbot_settings").select("*").eq("business_id", business.id).single();
  return <ChatbotForm settings={data as ChatbotSettings} businessName={business.name} />;
}
