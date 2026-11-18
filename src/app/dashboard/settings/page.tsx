import { Suspense } from "react";
import { PageHeader } from "@/components/ui/primitives";
import { requireBusiness } from "@/lib/auth";
import { timezones } from "@/lib/locale-options";
import { SettingsForm } from "./settings-form";

export const metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Business details. Your assistant uses these to answer questions about hours and contact information."
      />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-subtle" />}>
        <Loader />
      </Suspense>
    </>
  );
}

async function Loader() {
  const { business } = await requireBusiness();
  return <SettingsForm business={business} timezones={timezones()} />;
}
