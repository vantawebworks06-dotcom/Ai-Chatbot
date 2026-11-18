"use client";

import { Check, Copy } from "lucide-react";
import { useActionState, useState } from "react";
import { Button, Notice, Textarea } from "@/components/ui/primitives";
import { updateAllowedDomains, type ActionState } from "../actions";

export function CopySnippet({ snippet }: { snippet: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative rounded-lg border border-line bg-ink">
      <pre className="overflow-x-auto p-4 pr-24 font-mono text-[12.5px] leading-relaxed text-slate-100">
        <code>{snippet}</code>
      </pre>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(snippet);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="absolute top-2.5 right-2.5 inline-flex h-8 items-center gap-1.5 rounded-md bg-white/10 px-3 text-xs font-medium text-white hover:bg-white/20"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export function DomainsForm({ initial }: { initial: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateAllowedDomains, {});
  return (
    <form action={action} className="space-y-3">
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.ok ? <Notice tone="success">{state.message}</Notice> : null}
      <Textarea
        name="allowed_domains"
        rows={3}
        defaultValue={initial}
        placeholder={"example.com\nshop.example.com"}
        className="font-mono text-[13px]"
      />
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted">One per line. Subdomains are included. Leave empty to allow any site.</p>
        <Button type="submit" size="sm" variant="secondary" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
