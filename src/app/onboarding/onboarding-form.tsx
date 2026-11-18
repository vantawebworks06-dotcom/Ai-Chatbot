"use client";

import { useActionState, useEffect, useState } from "react";
import { Button, Field, Input, Notice, Select } from "@/components/ui/primitives";
import { CURRENCIES } from "@/lib/locale-options";
import { createBusiness, type OnboardingState } from "./actions";

export function OnboardingForm({ timezones }: { timezones: string[] }) {
  const [state, action, pending] = useActionState<OnboardingState, FormData>(createBusiness, {});
  const [tz, setTz] = useState("UTC");

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only default
      setTz(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
    } catch {
      /* keep UTC */
    }
  }, []);

  return (
    <form action={action} className="space-y-4">
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      <Field label="Business name" htmlFor="name">
        <Input id="name" name="name" required maxLength={120} placeholder="Acme Outfitters" />
      </Field>
      <Field label="Website" htmlFor="website_url" hint="Optional. Where you'll install the chat widget.">
        <Input id="website_url" name="website_url" type="url" placeholder="https://example.com" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Country" htmlFor="country">
          <Input id="country" name="country" placeholder="e.g. United States" />
        </Field>
        <Field label="Currency" htmlFor="currency">
          <Select id="currency" name="currency" defaultValue="USD">
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Time zone" htmlFor="timezone">
        <Select id="timezone" name="timezone" value={tz} onChange={(e) => setTz(e.target.value)}>
          {timezones.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </Select>
      </Field>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creating…" : "Create workspace"}
      </Button>
    </form>
  );
}
