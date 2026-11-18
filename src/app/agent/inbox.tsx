"use client";

import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  Clock,
  Hand,
  Inbox,
  LayoutDashboard,
  LogOut,
  MessagesSquare,
  Search,
  Send,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { VeloraLogo } from "@/components/brand/logo";
import { handoffLabel, ModeBadge } from "@/components/conversation-badges";
import { Transcript } from "@/components/transcript";
import { Badge, Button, EmptyState } from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/client";
import type { Conversation, Message } from "@/lib/types";
import { cn, formatDateTime, formatRelative } from "@/lib/utils";

type Row = Conversation & {
  businesses: { name: string } | null;
  visitors: { name: string | null; email: string | null } | null;
};

type Queue = "waiting" | "mine" | "open" | "closed";

const QUEUES: { key: Queue; label: string; icon: typeof Inbox }[] = [
  { key: "waiting", label: "Waiting for agent", icon: Clock },
  { key: "mine", label: "Assigned to me", icon: UserRound },
  { key: "open", label: "All open", icon: Inbox },
  { key: "closed", label: "Closed", icon: CheckCircle2 },
];

const SELECT = "*, businesses(name), visitors(name, email)";
const TYPING_FRESH_MS = 6000;

function inQueue(c: Row, q: Queue, me: string): boolean {
  if (q === "closed") return c.status === "closed";
  if (c.status !== "open") return false;
  if (q === "waiting") return c.mode === "waiting";
  if (q === "mine") return c.mode === "human" && c.assigned_agent_id === me;
  return true;
}

export function AgentInbox({
  userId,
  email,
  agentNames,
  hasBusiness,
}: {
  userId: string;
  email: string;
  agentNames: Record<string, string>;
  hasBusiness: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [queue, setQueue] = useState<Queue>("waiting");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [search, setSearch] = useState("");
  const [searchHits, setSearchHits] = useState<string[] | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const selectedRef = useRef<string | null>(null);
  const rowsRef = useRef(rows);
  useEffect(() => {
    selectedRef.current = selectedId;
    rowsRef.current = rows;
  }, [selectedId, rows]);

  // ---- data loading ----
  const loadList = useCallback(async () => {
    const [open, closed] = await Promise.all([
      supabase
        .from("conversations")
        .select(SELECT)
        .eq("status", "open")
        .not("last_message_at", "is", null)
        .order("last_message_at", { ascending: false })
        .limit(300),
      supabase
        .from("conversations")
        .select(SELECT)
        .eq("status", "closed")
        .order("last_message_at", { ascending: false })
        .limit(100),
    ]);
    if (open.error || closed.error) {
      setError((open.error ?? closed.error)!.message);
      return;
    }
    const next: Record<string, Row> = {};
    for (const r of [...(open.data ?? []), ...(closed.data ?? [])] as Row[]) next[r.id] = r;
    setRows(next);
  }, [supabase]);

  const fetchRow = useCallback(
    async (id: string) => {
      const { data } = await supabase.from("conversations").select(SELECT).eq("id", id).maybeSingle();
      if (data) setRows((prev) => ({ ...prev, [id]: data as Row }));
    },
    [supabase],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount
    void loadList();
  }, [loadList]);

  // ---- realtime ----
  useEffect(() => {
    const channel = supabase
      .channel("agent-inbox")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        (payload: RealtimePostgresChangesPayload<Conversation>) => {
          if (payload.eventType === "DELETE") return;
          const c = payload.new as Conversation;
          setRows((prev) => {
            const existing = prev[c.id];
            if (!existing) {
              void fetchRow(c.id); // need business/visitor names
              return prev;
            }
            return { ...prev, [c.id]: { ...existing, ...c } };
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload: RealtimePostgresChangesPayload<Message>) => {
          const m = payload.new as Message;
          if (m.conversation_id === selectedRef.current) {
            setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
          }
        },
      )
      .subscribe((status) => setConnected(status === "SUBSCRIBED"));

    // Catch up after reconnects or sleeping laptops.
    const onFocus = () => void loadList();
    window.addEventListener("focus", onFocus);
    const tick = setInterval(() => setNow(Date.now()), 2000);
    return () => {
      window.removeEventListener("focus", onFocus);
      clearInterval(tick);
      void supabase.removeChannel(channel);
    };
  }, [supabase, fetchRow, loadList]);

  // ---- selected conversation ----
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", selectedId)
        .order("id")
        .limit(1000);
      if (!cancelled) setMessages((data ?? []) as Message[]);
      await supabase.rpc("agent_mark_read", { p_conversation_id: selectedId });
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, supabase]);

  // Mark read when new customer messages arrive in the open conversation.
  const selected = selectedId ? rows[selectedId] : undefined;
  useEffect(() => {
    if (selected && selected.agent_unread > 0 && document.hasFocus()) {
      void supabase.rpc("agent_mark_read", { p_conversation_id: selected.id });
    }
  }, [selected, supabase]);

  // ---- search across all businesses ----
  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing results
      setSearchHits(null);
      return;
    }
    const t = setTimeout(async () => {
      const like = `%${q.replace(/[%_]/g, "")}%`;
      const { data } = await supabase.from("messages").select("conversation_id").ilike("content", like).limit(500);
      const ids = [...new Set((data ?? []).map((d) => d.conversation_id as string))];
      setSearchHits(ids);
      const missing = ids.filter((id) => !rowsRef.current[id]).slice(0, 50);
      if (missing.length) {
        const { data: extra } = await supabase.from("conversations").select(SELECT).in("id", missing);
        setRows((prev) => {
          const next = { ...prev };
          for (const r of (extra ?? []) as Row[]) next[r.id] = r;
          return next;
        });
      }
    }, 300);
    return () => clearTimeout(t);
  }, [search, supabase]);

  // ---- derived ----
  const all = Object.values(rows);
  const counts: Record<Queue, number> = {
    waiting: all.filter((c) => inQueue(c, "waiting", userId)).length,
    mine: all.filter((c) => inQueue(c, "mine", userId)).length,
    open: all.filter((c) => inQueue(c, "open", userId)).length,
    closed: all.filter((c) => inQueue(c, "closed", userId)).length,
  };
  const list = (searchHits ? all.filter((c) => searchHits.includes(c.id)) : all.filter((c) => inQueue(c, queue, userId)))
    .sort((a, b) => (b.last_message_at ?? "").localeCompare(a.last_message_at ?? ""));
  const totalUnread = all.reduce((n, c) => n + (c.status === "open" ? c.agent_unread : 0), 0);

  useEffect(() => {
    document.title = `${counts.waiting || totalUnread ? `(${counts.waiting || totalUnread}) ` : ""}Agent inbox · Velora`;
  }, [counts.waiting, totalUnread]);

  // ---- actions ----
  async function run(fn: string, args: Record<string, unknown>) {
    setError(null);
    const { error } = await supabase.rpc(fn, args);
    if (error) setError(error.message);
    else if (selectedId) void fetchRow(selectedId);
    return !error;
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas">
      {/* Queues */}
      <aside className="hidden w-60 flex-none flex-col border-r border-line bg-surface lg:flex">
        <div className="flex h-14 items-center justify-between px-5">
          <VeloraLogo size="sm" />
          <Badge tone="ai">Agent</Badge>
        </div>
        <nav className="flex-1 space-y-0.5 px-3 pt-2">
          {QUEUES.map((q) => {
            const Icon = q.icon;
            const active = queue === q.key && !searchHits;
            return (
              <button
                key={q.key}
                onClick={() => {
                  setQueue(q.key);
                  setSearch("");
                }}
                className={cn(
                  "flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] font-medium",
                  active ? "bg-subtle text-ink" : "text-ink-2 hover:bg-subtle/70",
                )}
              >
                <Icon className={cn("h-4 w-4", active ? "text-brand" : "text-faint")} />
                <span className="flex-1 text-left">{q.label}</span>
                {counts[q.key] ? (
                  <span
                    className={cn(
                      "min-w-5 rounded-full px-1.5 text-center text-[11px] leading-5 font-semibold",
                      q.key === "waiting" ? "bg-warning text-white" : "bg-subtle text-muted",
                    )}
                  >
                    {counts[q.key]}
                  </span>
                ) : null}
              </button>
            );
          })}
          {hasBusiness ? (
            <>
              <div className="mx-2.5 my-3 h-px bg-line" />
              <Link
                href="/dashboard"
                className="flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] font-medium text-ink-2 hover:bg-subtle/70"
              >
                <LayoutDashboard className="h-4 w-4 text-faint" /> Business dashboard
              </Link>
            </>
          ) : null}
        </nav>
        <div className="border-t border-line p-3">
          <div className="flex items-center gap-2 px-2 py-1">
            <span className={cn("h-2 w-2 rounded-full", connected ? "bg-success" : "bg-line-strong")} />
            <span className="flex-1 truncate text-xs text-muted">{connected ? "Live" : "Connecting…"} · {email}</span>
            <form action="/auth/signout" method="post">
              <button type="submit" aria-label="Sign out" title="Sign out" className="grid h-7 w-7 place-items-center rounded-md text-faint hover:bg-subtle hover:text-ink">
                <LogOut className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Conversation list */}
      <section
        className={cn(
          "flex w-full flex-none flex-col border-r border-line bg-surface md:w-[340px]",
          selectedId && "hidden md:flex",
        )}
      >
        <div className="border-b border-line p-3">
          <div className="mb-2 flex items-center justify-between lg:hidden">
            <VeloraLogo size="sm" />
            <span className={cn("h-2 w-2 rounded-full", connected ? "bg-success" : "bg-line-strong")} />
          </div>
          <div className="mb-2 flex gap-1 overflow-x-auto lg:hidden">
            {QUEUES.map((q) => (
              <button
                key={q.key}
                onClick={() => setQueue(q.key)}
                className={cn(
                  "rounded-md px-2 py-1 text-xs font-medium whitespace-nowrap",
                  queue === q.key ? "bg-subtle text-ink" : "text-muted",
                )}
              >
                {q.label} {counts[q.key] ? `(${counts[q.key]})` : ""}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-faint" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search all conversations"
              className="h-9 w-full rounded-lg border border-line bg-canvas pr-3 pl-8 text-sm placeholder:text-faint focus:border-brand focus:bg-surface focus:ring-3 focus:ring-brand-ring focus:outline-none"
            />
          </div>
        </div>
        <ul className="flex-1 overflow-y-auto">
          {list.length ? (
            list.map((c) => {
              const active = c.id === selectedId;
              const typing = c.visitor_typing_at && now - new Date(c.visitor_typing_at).getTime() < TYPING_FRESH_MS;
              return (
                <li key={c.id}>
                  <button
                    onClick={() => setSelectedId(c.id)}
                    className={cn(
                      "flex w-full gap-3 border-b border-line/70 px-4 py-3 text-left transition-colors",
                      active ? "bg-brand-soft/60" : "hover:bg-canvas",
                    )}
                  >
                    <div className="relative mt-0.5 grid h-9 w-9 flex-none place-items-center rounded-full bg-subtle text-[13px] font-semibold text-ink-2">
                      {(c.visitors?.name || c.businesses?.name || "?").charAt(0).toUpperCase()}
                      {c.mode === "waiting" && c.status === "open" ? (
                        <span className="absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border-2 border-surface bg-warning" />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className={cn("truncate text-sm", c.agent_unread ? "font-semibold text-ink" : "font-medium text-ink")}>
                          {c.visitors?.name || c.visitors?.email || "Website visitor"}
                        </p>
                        <span className="flex-none text-[11px] text-faint">{formatRelative(c.last_message_at, now)}</span>
                      </div>
                      <p className="truncate text-xs font-medium text-brand">{c.businesses?.name}</p>
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <p className={cn("truncate text-[13px]", c.agent_unread ? "text-ink" : "text-muted")}>
                          {typing ? <span className="text-ai">typing…</span> : c.last_message_preview}
                        </p>
                        {c.agent_unread && c.status === "open" ? (
                          <span className="min-w-5 flex-none rounded-full bg-brand px-1.5 text-center text-[11px] leading-5 font-semibold text-white">
                            {c.agent_unread}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })
          ) : (
            <EmptyState
              icon={<MessagesSquare className="h-5 w-5" />}
              title={searchHits ? "No matches" : queue === "waiting" ? "No one is waiting" : "Nothing here"}
              description={
                searchHits
                  ? "Try another search."
                  : queue === "waiting"
                    ? "Conversations handed off by the AI appear here instantly."
                    : undefined
              }
            />
          )}
        </ul>
      </section>

      {/* Conversation */}
      <section className={cn("min-w-0 flex-1 flex-col", selectedId ? "flex" : "hidden md:flex")}>
        {selected ? (
          <ConversationPane
            key={selected.id}
            conversation={selected}
            messages={messages}
            me={userId}
            agentNames={agentNames}
            now={now}
            error={error}
            onBack={() => setSelectedId(null)}
            onClaim={() => run("agent_claim_conversation", { p_conversation_id: selected.id })}
            onReturnToAI={() => run("agent_return_to_ai", { p_conversation_id: selected.id })}
            onClose={() => run("agent_close_conversation", { p_conversation_id: selected.id })}
            onSend={(text) => run("agent_send_message", { p_conversation_id: selected.id, p_content: text })}
            onTyping={() => void supabase.rpc("agent_set_typing", { p_conversation_id: selected.id })}
          />
        ) : (
          <div className="grid flex-1 place-items-center">
            <EmptyState
              icon={<Inbox className="h-5 w-5" />}
              title="Select a conversation"
              description="Pick a conversation to read its history and reply. New messages arrive live."
            />
          </div>
        )}
      </section>
    </div>
  );
}

function ConversationPane({
  conversation: c,
  messages,
  me,
  agentNames,
  now,
  error,
  onBack,
  onClaim,
  onReturnToAI,
  onClose,
  onSend,
  onTyping,
}: {
  conversation: Row;
  messages: Message[];
  me: string;
  agentNames: Record<string, string>;
  now: number;
  error: string | null;
  onBack: () => void;
  onClaim: () => Promise<boolean>;
  onReturnToAI: () => Promise<boolean>;
  onClose: () => Promise<boolean>;
  onSend: (text: string) => Promise<boolean>;
  onTyping: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastTyping = useRef(0);
  const mine = c.mode === "human" && c.assigned_agent_id === me;
  const otherAgent = c.mode === "human" && c.assigned_agent_id && c.assigned_agent_id !== me;
  const visitorTyping = c.visitor_typing_at && now - new Date(c.visitor_typing_at).getTime() < TYPING_FRESH_MS;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, visitorTyping]);

  async function act(fn: () => Promise<boolean>) {
    setBusy(true);
    await fn();
    setBusy(false);
  }

  async function send() {
    const text = draft.trim();
    if (!text) return;
    setBusy(true);
    const ok = await onSend(text);
    if (ok) setDraft("");
    setBusy(false);
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <>
      <header className="flex flex-wrap items-center gap-3 border-b border-line bg-surface px-4 py-3 sm:px-5">
        <button onClick={onBack} aria-label="Back" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-subtle md:hidden">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-[15px] font-semibold text-ink">
              {c.visitors?.name || c.visitors?.email || "Website visitor"}
            </h2>
            <ModeBadge conversation={c} />
          </div>
          <p className="mt-0.5 truncate text-xs text-muted">
            <span className="font-medium text-brand">{c.businesses?.name}</span>
            {c.visitors?.email ? ` · ${c.visitors.email}` : ""}
            {c.handoff_reason ? ` · ${handoffLabel(c.handoff_reason)}` : ""}
            {` · started ${formatDateTime(c.created_at)}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {c.status === "open" && !mine ? (
            <Button size="sm" onClick={() => act(onClaim)} disabled={busy}>
              <Hand className="h-4 w-4" /> {otherAgent ? "Take over" : "Claim"}
            </Button>
          ) : null}
          {c.status === "open" && c.mode !== "ai" ? (
            <Button size="sm" variant="secondary" onClick={() => act(onReturnToAI)} disabled={busy}>
              <Bot className="h-4 w-4 text-ai" /> Return to AI
            </Button>
          ) : null}
          {c.status === "open" ? (
            <Button size="sm" variant="secondary" onClick={() => act(onClose)} disabled={busy}>
              <CheckCircle2 className="h-4 w-4" /> Close
            </Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => act(onClaim)} disabled={busy}>
              Reopen
            </Button>
          )}
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <Transcript messages={messages} botName="AI assistant" agentNames={agentNames} />
          {visitorTyping ? (
            <div className="mt-3 flex items-center gap-2 text-xs text-muted">
              <span className="flex gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-faint" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-faint [animation-delay:120ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-faint [animation-delay:240ms]" />
              </span>
              Customer is typing
            </div>
          ) : null}
        </div>
      </div>

      <footer className="border-t border-line bg-surface p-3 sm:p-4">
        <div className="mx-auto max-w-3xl">
          {error ? <p className="mb-2 text-xs text-danger">{error}</p> : null}
          {c.mode === "ai" && c.status === "open" ? (
            <p className="mb-2 flex items-center gap-1.5 text-xs text-ai">
              <Bot className="h-3.5 w-3.5" /> The AI is handling this chat. Sending a message takes over and pauses the AI.
            </p>
          ) : null}
          {otherAgent ? (
            <p className="mb-2 text-xs text-warning">
              {agentNames[c.assigned_agent_id!] ?? "Another agent"} is handling this conversation.
            </p>
          ) : null}
          <div className="flex items-end gap-2 rounded-xl border border-line bg-surface p-1.5 pl-3 focus-within:border-brand focus-within:ring-3 focus-within:ring-brand-ring">
            <textarea
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                if (mine && Date.now() - lastTyping.current > 3000) {
                  lastTyping.current = Date.now();
                  onTyping();
                }
              }}
              onKeyDown={onKey}
              rows={2}
              maxLength={8000}
              placeholder={c.status === "closed" ? "Sending reopens this conversation…" : "Reply to the customer…  (Enter to send, Shift+Enter for a new line)"}
              className="max-h-40 min-h-11 flex-1 resize-none bg-transparent py-1.5 text-sm text-ink placeholder:text-faint focus:outline-none"
            />
            <Button onClick={() => void send()} disabled={busy || !draft.trim()} aria-label="Send">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </footer>
    </>
  );
}
