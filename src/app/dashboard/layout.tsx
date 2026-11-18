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
  const { business, user, isAgent } = await requireBusiness();
  return (
    <AppShell businessName={business.name} email={user.email ?? ""} isAgent={isAgent}>
      {children}
    </AppShell>
  );
}
