import { headers } from "next/headers";
import { Suspense } from "react";
import { Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { requireBusiness } from "@/lib/auth";
import { CopySnippet, DomainsForm } from "./install-client";

export const metadata = { title: "Install" };

export default function InstallPage() {
  return (
    <>
      <PageHeader title="Install on your website" description="Add Velora to any website with one line of code." />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-subtle" />}>
        <Install />
      </Suspense>
    </>
  );
}

async function Install() {
  const { supabase, business } = await requireBusiness();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || `${proto}://${host}`;

  const { data: settings } = await supabase
    .from("chatbot_settings")
    .select("allowed_domains, enabled")
    .eq("business_id", business.id)
    .single();

  const snippet = `<script src="${origin}/widget.js" data-client-id="${business.id}" defer></script>`;
  const testUrl = `${origin}/test-site.html?client_id=${business.id}`;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <Card>
          <CardHeader title="Your installation code" description="Paste this just before the closing </body> tag on every page." />
          <div className="p-5">
            <CopySnippet snippet={snippet} />
            <ol className="mt-5 space-y-3 text-sm text-ink-2">
              <Step n={1}>Copy the code above.</Step>
              <Step n={2}>
                Paste it into your site&apos;s HTML before <code className="rounded bg-subtle px-1 font-mono text-[12.5px]">&lt;/body&gt;</code>. On
                website builders, use the &quot;custom code&quot;, &quot;embed&quot; or &quot;footer scripts&quot; setting.
              </Step>
              <Step n={3}>Publish your site. A chat button appears in the bottom corner.</Step>
            </ol>
            {!settings?.enabled ? (
              <p className="mt-4 text-[13px] text-warning">Your chatbot is currently turned off. Turn it on under Chatbot.</p>
            ) : null}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Allowed websites"
            description="Optional. Limit the widget to your own domains so other sites can't embed it."
          />
          <div className="p-5">
            <DomainsForm initial={(settings?.allowed_domains as string[] | null)?.join("\n") ?? ""} />
          </div>
        </Card>
      </div>

      <Card className="h-fit p-5">
        <p className="text-[15px] font-semibold text-ink">Try it first</p>
        <p className="mt-1 text-[13px] text-muted">
          Open a test page with your widget installed and chat as a customer would.
        </p>
        <a
          href={testUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex h-9 items-center rounded-lg border border-line bg-surface px-4 text-sm font-medium text-ink hover:bg-subtle"
        >
          Open test page
        </a>
        <div className="mt-5 border-t border-line pt-4 text-[13px] text-muted">
          <p className="font-medium text-ink">Your client ID</p>
          <p className="mt-1 font-mono text-xs break-all">{business.id}</p>
          <p className="mt-2">It&apos;s public and safe to share. It contains no secret keys.</p>
        </div>
      </Card>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid h-5 w-5 flex-none place-items-center rounded-full bg-brand-soft text-[11px] font-semibold text-brand">
        {n}
      </span>
      <span>{children}</span>
    </li>
  );
}
