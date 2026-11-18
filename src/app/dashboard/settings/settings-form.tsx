"use client";

import { useActionState, type ReactNode } from "react";
import { Button, Card, Field, Input, Notice, Select, Textarea } from "@/components/ui/primitives";
import { CURRENCIES } from "@/lib/locale-options";
import type { Business } from "@/lib/types";
import { updateBusiness, type ActionState } from "../actions";

export function SettingsForm({ business, timezones }: { business: Business; timezones: string[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateBusiness, {});
  const currencies = CURRENCIES.includes(business.currency as (typeof CURRENCIES)[number])
    ? CURRENCIES
    : [business.currency, ...CURRENCIES];

  return (
    <form action={action} className="space-y-6">
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.ok ? <Notice tone="success">{state.message}</Notice> : null}

      <Section title="Business profile" description="The basics customers ask about.">
        <Field label="Business name" htmlFor="name">
          <Input id="name" name="name" required maxLength={120} defaultValue={business.name} />
        </Field>
        <Field label="Website" htmlFor="website_url">
          <Input id="website_url" name="website_url" type="url" defaultValue={business.website_url ?? ""} placeholder="https://" />
        </Field>
        <Field label="Industry" htmlFor="industry">
          <Input id="industry" name="industry" defaultValue={business.industry ?? ""} placeholder="e.g. Online retail" />
        </Field>
        <Field label="About the business" htmlFor="description" className="sm:col-span-2">
          <Textarea id="description" name="description" rows={3} defaultValue={business.description ?? ""} placeholder="A short description your assistant can share." />
        </Field>
      </Section>

      <Section title="Contact & hours">
        <Field label="Support email" htmlFor="support_email">
          <Input id="support_email" name="support_email" type="email" defaultValue={business.support_email ?? ""} />
        </Field>
        <Field label="Phone" htmlFor="phone" hint="Include the country code, e.g. +1 555 0100.">
          <Input id="phone" name="phone" type="tel" defaultValue={business.phone ?? ""} />
        </Field>
        <Field label="Address" htmlFor="address" className="sm:col-span-2">
          <Input id="address" name="address" defaultValue={business.address ?? ""} />
        </Field>
        <Field label="Business hours" htmlFor="business_hours" className="sm:col-span-2" hint="Write them as you'd tell a customer, including holidays.">
          <Textarea
            id="business_hours"
            name="business_hours"
            rows={4}
            defaultValue={business.business_hours ?? ""}
            placeholder={"Mon–Fri 9:00–17:00\nSat 10:00–14:00\nClosed Sundays and public holidays"}
          />
        </Field>
      </Section>

      <Section title="Localization">
        <Field label="Country" htmlFor="country">
          <Input id="country" name="country" defaultValue={business.country ?? ""} />
        </Field>
        <Field label="Currency" htmlFor="currency">
          <Select id="currency" name="currency" defaultValue={business.currency}>
            {currencies.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Time zone" htmlFor="timezone" className="sm:col-span-2">
          <Select id="timezone" name="timezone" defaultValue={business.timezone}>
            {(timezones.includes(business.timezone) ? timezones : [business.timezone, ...timezones]).map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </Field>
      </Section>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </form>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[220px_1fr]">
      <div>
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {description ? <p className="mt-1 text-[13px] text-muted">{description}</p> : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </Card>
  );
}
