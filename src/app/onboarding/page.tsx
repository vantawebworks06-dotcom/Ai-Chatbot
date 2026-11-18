import { redirect } from "next/navigation";
import { Suspense } from "react";
import { VeloraLogo } from "@/components/brand/logo";
import { Card } from "@/components/ui/primitives";
import { getAuthContext } from "@/lib/auth";
import { timezones } from "@/lib/locale-options";
import { OnboardingForm } from "./onboarding-form";

export const metadata = { title: "Set up your business" };

export default function OnboardingPage() {
  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-10">
      <VeloraLogo />
      <Card className="mt-10 w-full max-w-lg p-6 sm:p-8">
        <h1 className="text-xl font-semibold tracking-tight">Set up your business</h1>
        <p className="mt-1 text-sm text-muted">
          This creates your workspace and your chatbot. You can change everything later.
        </p>
        <div className="mt-6">
          <Suspense>
            <Gate />
          </Suspense>
        </div>
      </Card>
    </div>
  );
}

async function Gate() {
  const ctx = await getAuthContext();
  if (!ctx.user) redirect("/login");
  return <OnboardingForm timezones={timezones()} />;
}
