import Link from "next/link";
import type { ReactNode } from "react";
import { VeloraLogo } from "@/components/brand/logo";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_480px] xl:grid-cols-[1fr_560px]">
      <main className="flex flex-col px-4 py-8 sm:px-8">
        <Link href="/" className="w-fit">
          <VeloraLogo />
        </Link>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1.5 text-sm text-muted">{subtitle}</p>
          <div className="mt-8">{children}</div>
          <p className="mt-6 text-center text-sm text-muted">{footer}</p>
        </div>
      </main>
      <aside className="relative hidden overflow-hidden border-l border-line bg-surface lg:flex lg:flex-col lg:justify-center lg:px-12">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgb(37_99_235/0.08),transparent_60%)]" />
        <div className="relative">
          <p className="text-xs font-medium uppercase tracking-wider text-brand">Velora</p>
          <p className="mt-3 text-2xl font-semibold leading-snug tracking-tight text-ink">
            Intelligent support.
            <br />
            Real human connection.
          </p>
          <div className="mt-8 space-y-3">
            <PreviewBubble who="Customer" text="Do you ship to Canada?" mine />
            <PreviewBubble who="AI assistant" text="Yes, we ship to Canada in 5–7 business days. Shipping is free on orders over $50." ai />
            <PreviewBubble who="Customer" text="My order arrived damaged." mine />
            <div className="flex justify-center">
              <span className="rounded-full bg-subtle px-3 py-1 text-xs text-muted">Handed to your team · just now</span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

function PreviewBubble({ who, text, mine, ai }: { who: string; text: string; mine?: boolean; ai?: boolean }) {
  return (
    <div className={mine ? "flex flex-col items-end" : "flex flex-col items-start"}>
      <span className={`mb-1 text-[11px] font-medium ${ai ? "text-ai" : "text-muted"}`}>{who}</span>
      <span
        className={
          mine
            ? "max-w-[85%] rounded-2xl rounded-tr-md bg-brand px-3.5 py-2 text-sm text-white"
            : "max-w-[85%] rounded-2xl rounded-tl-md border border-line bg-canvas px-3.5 py-2 text-sm text-ink"
        }
      >
        {text}
      </span>
    </div>
  );
}
