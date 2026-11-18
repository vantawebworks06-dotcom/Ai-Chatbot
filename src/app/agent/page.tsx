import { Suspense } from "react";
import { requireAgent } from "@/lib/auth";
import { AgentInbox } from "./inbox";

export const metadata = { title: "Agent inbox" };

export default function AgentPage() {
  return (
    <Suspense fallback={<div className="h-screen animate-pulse bg-canvas" />}>
      <Loader />
    </Suspense>
  );
}

async function Loader() {
  const { user, supabase, businessIds } = await requireAgent();
  const { data: agents } = await supabase.from("platform_agents").select("user_id, display_name");
  const agentNames = Object.fromEntries(
    (agents ?? []).map((a) => [a.user_id as string, (a.display_name as string | null) || "Agent"]),
  );
  return (
    <AgentInbox
      userId={user.id}
      email={user.email ?? ""}
      agentNames={agentNames}
      hasBusiness={businessIds.length > 0}
    />
  );
}
