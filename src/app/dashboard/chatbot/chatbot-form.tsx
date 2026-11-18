"use client";

import { ArrowRight, ChevronDown, MessageCircle, User } from "lucide-react";
import { useActionState, useState } from "react";
import { Button, Card, Field, Input, Notice, Textarea } from "@/components/ui/primitives";
import type { ChatbotSettings } from "@/lib/types";
import { cn } from "@/lib/utils";
import { updateChatbot, type ActionState } from "../actions";

const SWATCHES = ["#2563eb", "#7c3aed", "#0f172a", "#0d9488", "#16a34a", "#e11d48", "#ea580c", "#0891b2"];

function textOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 170 ? "#0f172a" : "#ffffff";
}

export function ChatbotForm({ settings, businessName }: { settings: ChatbotSettings; businessName: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateChatbot, {});
  const [botName, setBotName] = useState(settings.bot_name);
  const [welcome, setWelcome] = useState(settings.welcome_message);
  const [color, setColor] = useState(settings.primary_color);
  const [position, setPosition] = useState(settings.position);
  const [enabled, setEnabled] = useState(settings.enabled);
  const valid = /^#[0-9a-f]{6}$/i.test(color);
  const c = valid ? color : "#2563eb";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
      <Card>
        <form action={action}>
          <div className="space-y-5 p-5 sm:p-6">
            {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
            {state.ok ? <Notice tone="success">{state.message}</Notice> : null}

            <label className="flex items-center justify-between gap-4 rounded-lg border border-line px-4 py-3">
              <span>
                <span className="block text-sm font-medium text-ink">Chatbot enabled</span>
                <span className="block text-[13px] text-muted">When off, the widget is hidden on your website.</span>
              </span>
              <input
                type="checkbox"
                name="enabled"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="peer sr-only"
              />
              <span
                aria-hidden
                className={cn(
                  "relative h-5 w-9 flex-none rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-brand-ring",
                  enabled ? "bg-brand" : "bg-line-strong",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
                    enabled && "translate-x-4",
                  )}
                />
              </span>
            </label>

            <Field label="Assistant name" htmlFor="bot_name" hint="Shown above AI replies.">
              <Input id="bot_name" name="bot_name" maxLength={60} required value={botName} onChange={(e) => setBotName(e.target.value)} />
            </Field>

            <Field label="Welcome message" htmlFor="welcome_message">
              <Textarea
                id="welcome_message"
                name="welcome_message"
                rows={3}
                maxLength={500}
                value={welcome}
                onChange={(e) => setWelcome(e.target.value)}
              />
            </Field>

            <div>
              <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Brand color</span>
              <div className="flex flex-wrap items-center gap-2">
                {SWATCHES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setColor(s)}
                    aria-label={`Use ${s}`}
                    className={cn(
                      "h-7 w-7 rounded-full ring-offset-2 transition",
                      color.toLowerCase() === s && "ring-2 ring-ink/40",
                    )}
                    style={{ background: s }}
                  />
                ))}
                <div className="flex items-center gap-2 pl-1">
                  <input
                    type="color"
                    value={c}
                    onChange={(e) => setColor(e.target.value)}
                    className="h-8 w-8 cursor-pointer rounded border border-line bg-surface p-0.5"
                    aria-label="Custom color"
                  />
                  <Input name="primary_color" value={color} onChange={(e) => setColor(e.target.value)} className="w-28 font-mono" />
                </div>
              </div>
            </div>

            <div>
              <span className="mb-1.5 block text-[13px] font-medium text-ink-2">Position on page</span>
              <div className="inline-flex rounded-lg border border-line p-0.5">
                {(["left", "right"] as const).map((p) => (
                  <label
                    key={p}
                    className={cn(
                      "cursor-pointer rounded-md px-3 py-1.5 text-[13px] font-medium capitalize",
                      position === p ? "bg-subtle text-ink" : "text-muted",
                    )}
                  >
                    <input
                      type="radio"
                      name="position"
                      value={p}
                      checked={position === p}
                      onChange={() => setPosition(p)}
                      className="sr-only"
                    />
                    Bottom {p}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-end border-t border-line bg-canvas px-5 py-3 sm:px-6">
            <Button type="submit" disabled={pending || !valid}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </Card>

      {/* Live preview mirrors public/widget.js styling */}
      <div className="lg:sticky lg:top-8 lg:h-fit">
        <p className="mb-2 text-xs font-medium tracking-wide text-muted uppercase">Preview</p>
        <div className="relative h-[540px] overflow-hidden rounded-xl border border-line bg-[repeating-linear-gradient(45deg,#f7f8fa,#f7f8fa_10px,#f1f3f6_10px,#f1f3f6_20px)]">
          <div
            className={cn(
              "absolute bottom-4 flex flex-col gap-3",
              position === "left" ? "left-4 items-start" : "right-4 items-end",
            )}
          >
            <div className="flex h-[440px] w-[320px] max-w-[calc(100vw-4rem)] flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-[var(--shadow-pop)]">
              <div className="flex items-center gap-3 px-4 py-3.5" style={{ background: c, color: textOn(c) }}>
                <div className="grid h-9 w-9 place-items-center rounded-[10px] bg-white/20 text-[15px] font-semibold">
                  {businessName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold">{businessName}</p>
                  <p className="flex items-center gap-1.5 text-xs opacity-85">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                    {botName || "Assistant"} · AI assistant
                  </p>
                </div>
                <ChevronDown className="h-4 w-4 opacity-80" />
              </div>
              <div className="flex flex-1 flex-col gap-2 bg-[#f8fafc] p-4">
                <span className="px-1 text-[11px] font-medium text-muted">{botName || "Assistant"}</span>
                <div className="max-w-[85%] rounded-2xl rounded-tl-md border border-line bg-white px-3 py-2 text-sm whitespace-pre-wrap text-ink">
                  {welcome || "Hi there! How can we help you today?"}
                </div>
                <div className="max-w-[80%] self-end rounded-2xl rounded-tr-md px-3 py-2 text-sm" style={{ background: c, color: textOn(c) }}>
                  What are your opening hours?
                </div>
              </div>
              <div className="flex justify-center bg-white pt-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs text-ink-2">
                  <User className="h-3.5 w-3.5" /> Talk to a person
                </span>
              </div>
              <div className="bg-white p-3">
                <div className="flex items-center gap-2 rounded-xl border border-line py-1.5 pr-1.5 pl-3">
                  <span className="flex-1 text-sm text-faint">Write a message…</span>
                  <span className="grid h-8 w-8 place-items-center rounded-lg" style={{ background: c, color: textOn(c) }}>
                    <ArrowRight className="h-4 w-4" />
                  </span>
                </div>
                <p className="mt-2 text-center text-[11px] text-faint">Powered by Velora</p>
              </div>
            </div>
            <div className="grid h-14 w-14 place-items-center rounded-full shadow-lg" style={{ background: c, color: textOn(c) }}>
              <MessageCircle className="h-6 w-6" />
            </div>
          </div>
          {!enabled ? (
            <div className="absolute inset-0 grid place-items-center bg-white/70 backdrop-blur-[1px]">
              <span className="rounded-full bg-ink px-3 py-1 text-xs font-medium text-white">Chatbot is off</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
