import { Suspense, type ReactNode } from "react";
import { AppShell, ShellSkeleton } from "@/components/app-shell";
import { requireBusiness } from "@/lib/auth";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}

async function Shell({ children }: { children: ReactNode }) {
  const { business, user, isAgent, supabase, businessIds } = await requireBusiness();
  const { data: businesses } = await supabase
    .from("businesses")
    .select("id, name")
    .in("id", businessIds)
    .order("name");
  return (
    <AppShell
      business={{ id: business.id, name: business.name }}
      businesses={(businesses ?? []) as { id: string; name: string }[]}
      email={user.email ?? ""}
      isAgent={isAgent}
    >
      {children}
    </AppShell>
  );
}
