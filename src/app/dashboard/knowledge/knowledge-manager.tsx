"use client";

import {
  AlertCircle,
  BookOpen,
  FileText,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Notice,
  Select,
  Textarea,
} from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/client";
import { KNOWLEDGE_KIND_LABELS, type KnowledgeItem, type KnowledgeKind } from "@/lib/types";
import { cn, formatRelative } from "@/lib/utils";
import {
  deleteKnowledgeItem,
  registerDocument,
  reprocessDocument,
  saveKnowledgeItem,
  type ActionState,
} from "../actions";

const TABS: { key: "all" | KnowledgeKind; label: string }[] = [
  { key: "all", label: "All" },
  { key: "faq", label: "FAQs" },
  { key: "product", label: "Products" },
  { key: "shipping_policy", label: "Shipping" },
  { key: "return_policy", label: "Returns" },
  { key: "info", label: "General" },
  { key: "document", label: "Documents" },
];

const EDITABLE: KnowledgeKind[] = ["faq", "product", "shipping_policy", "return_policy", "info"];

const PLACEHOLDERS: Record<string, { title: string; content: string }> = {
  faq: { title: "Do you offer gift wrapping?", content: "Yes. Gift wrapping is available at checkout for 5.00." },
  product: { title: "Trail Runner 2 (men's)", content: "Lightweight trail shoe. Sizes 7–13. Price 129.00. Waterproof: no." },
  shipping_policy: { title: "Shipping & delivery", content: "Orders ship within 1–2 business days. Standard delivery takes 3–5 business days…" },
  return_policy: { title: "Returns & refunds", content: "Unused items can be returned within 30 days of delivery…" },
  info: { title: "About us", content: "Facts customers often ask about: loyalty program, warranty, store locations…" },
};

export function KnowledgeManager({ businessId, items }: { businessId: string; items: KnowledgeItem[] }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("all");
  const [editing, setEditing] = useState<Partial<KnowledgeItem> | null>(null);
  const visible = tab === "all" ? items : items.filter((i) => i.kind === tab);
  const counts = items.reduce<Record<string, number>>((acc, i) => {
    acc[i.kind] = (acc[i.kind] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <Card>
        <div className="flex flex-col gap-3 border-b border-line p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-1 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-[13px] font-medium whitespace-nowrap",
                  tab === t.key ? "bg-subtle text-ink" : "text-muted hover:text-ink",
                )}
              >
                {t.label}
                {t.key !== "all" && counts[t.key] ? (
                  <span className="ml-1.5 text-xs text-faint">{counts[t.key]}</span>
                ) : null}
              </button>
            ))}
          </div>
          <Button
            size="sm"
            onClick={() => setEditing({ kind: tab !== "all" && tab !== "document" ? tab : "faq" })}
          >
            <Plus className="h-4 w-4" /> Add entry
          </Button>
        </div>

        {visible.length ? (
          <ul className="divide-y divide-line">
            {visible.map((item) => (
              <ItemRow key={item.id} item={item} onEdit={() => setEditing(item)} />
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={<BookOpen className="h-5 w-5" />}
            title="Nothing here yet"
            description="Add FAQs, product details and policies, or upload documents. The assistant won't answer questions it has no information for. It hands those to your team."
            action={
              <Button size="sm" variant="secondary" onClick={() => setEditing({ kind: "faq" })}>
                <Plus className="h-4 w-4" /> Add your first FAQ
              </Button>
            }
          />
        )}
      </Card>

      <div className="space-y-6">
        <UploadCard businessId={businessId} />
        <Card className="p-5 text-[13px] leading-relaxed text-muted">
          <p className="font-medium text-ink">Tips for good answers</p>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            <li>Write one FAQ per question, in your customers&apos; words.</li>
            <li>Include exact prices, timeframes and conditions.</li>
            <li>Business hours and contact details live in Settings.</li>
          </ul>
        </Card>
      </div>

      {editing ? <Editor item={editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function ItemRow({ item, onEdit }: { item: KnowledgeItem; onEdit: () => void }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isDoc = item.kind === "document";

  return (
    <li className="group flex gap-3 px-5 py-3.5">
      <div className="mt-0.5 grid h-8 w-8 flex-none place-items-center rounded-lg bg-subtle text-muted">
        {isDoc ? <FileText className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium text-ink">{item.title}</p>
          <Badge tone={isDoc ? "brand" : "neutral"}>{KNOWLEDGE_KIND_LABELS[item.kind]}</Badge>
          {item.status === "processing" ? (
            <Badge tone="warning">
              <Loader2 className="h-3 w-3 animate-spin" /> Processing
            </Badge>
          ) : null}
          {item.status === "error" ? <Badge tone="danger">Error</Badge> : null}
        </div>
        <p className="mt-0.5 line-clamp-2 text-[13px] text-muted">
          {item.status === "error" ? item.error : item.content || item.file_name}
        </p>
        {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
      </div>
      <div className="flex flex-none items-start gap-1">
        <span className="mr-1 hidden pt-1.5 text-xs text-faint sm:block">{formatRelative(item.updated_at)}</span>
        {isDoc ? (
          <IconButton
            label="Process again"
            disabled={pending}
            onClick={() => start(async () => setError((await reprocessDocument(item.id)).error ?? null))}
          >
            <RefreshCw className={cn("h-4 w-4", pending && "animate-spin")} />
          </IconButton>
        ) : (
          <IconButton label="Edit" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
          </IconButton>
        )}
        <IconButton
          label="Delete"
          disabled={pending}
          onClick={() => {
            if (!confirm(`Delete "${item.title}"? The assistant will stop using it.`)) return;
            start(async () => setError((await deleteKnowledgeItem(item.id)).error ?? null));
          }}
        >
          <Trash2 className="h-4 w-4" />
        </IconButton>
      </div>
    </li>
  );
}

function IconButton({
  label,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className="grid h-8 w-8 place-items-center rounded-lg text-faint hover:bg-subtle hover:text-ink disabled:opacity-50"
      {...props}
    >
      {children}
    </button>
  );
}

function Editor({ item, onClose }: { item: Partial<KnowledgeItem>; onClose: () => void }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveKnowledgeItem, {});
  const [kind, setKind] = useState<KnowledgeKind>(
    item.kind && EDITABLE.includes(item.kind) ? item.kind : "faq",
  );
  const isFaq = kind === "faq";
  const ph = PLACEHOLDERS[kind];

  useEffect(() => {
    if (state.ok) onClose();
  }, [state.ok, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-ink/30" onClick={onClose} />
      <Card className="animate-in relative max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-b-none sm:rounded-xl">
        <form action={action}>
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 className="text-[15px] font-semibold">{item.id ? "Edit entry" : "New knowledge entry"}</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="text-faint hover:text-ink">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="space-y-4 p-5">
            {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
            {item.id ? <input type="hidden" name="id" value={item.id} /> : null}
            <Field label="Type" htmlFor="kind">
              <Select id="kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value as KnowledgeKind)}>
                {EDITABLE.map((k) => (
                  <option key={k} value={k}>
                    {KNOWLEDGE_KIND_LABELS[k]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={isFaq ? "Question" : "Title"} htmlFor="title">
              <Input id="title" name="title" required maxLength={300} defaultValue={item.title} placeholder={ph.title} />
            </Field>
            <Field
              label={isFaq ? "Answer" : "Details"}
              htmlFor="content"
              hint="Be specific. The assistant will only state what's written here."
            >
              <Textarea
                id="content"
                name="content"
                required
                rows={isFaq ? 5 : 9}
                maxLength={20000}
                defaultValue={item.content}
                placeholder={ph.content}
              />
            </Field>
          </div>
          <div className="flex justify-end gap-2 border-t border-line bg-canvas px-5 py-3">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function UploadCard({ businessId }: { businessId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ tone: "danger" | "success"; text: string } | null>(null);

  async function upload(file: File) {
    setStatus(null);
    if (file.size > 10 * 1024 * 1024) {
      setStatus({ tone: "danger", text: "Files must be 10 MB or smaller." });
      return;
    }
    const ext = file.name.toLowerCase().match(/\.(pdf|txt|md|markdown|csv)$/)?.[1];
    if (!ext) {
      setStatus({ tone: "danger", text: "Upload a PDF, .txt, .md or .csv file." });
      return;
    }
    setBusy(true);
    try {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-80);
      const path = `${businessId}/${crypto.randomUUID()}-${safe}`;
      const contentType =
        ext === "pdf" ? "application/pdf" : ext === "csv" ? "text/csv" : ext === "txt" ? "text/plain" : "text/markdown";
      const { error } = await createClient()
        .storage.from("knowledge-docs")
        .upload(path, file, { contentType, upsert: false });
      if (error) throw new Error(error.message);
      const result = await registerDocument({ path, fileName: file.name });
      setStatus(
        result.error
          ? { tone: "danger", text: result.error }
          : { tone: "success", text: result.message ?? "Uploaded." },
      );
    } catch (e) {
      setStatus({ tone: "danger", text: e instanceof Error ? e.message : "Upload failed." });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <Card className="p-5">
      <p className="text-[15px] font-semibold text-ink">Upload documents</p>
      <p className="mt-1 text-[13px] text-muted">PDF or text files up to 10 MB: catalogs, policies, manuals.</p>
      <label
        className={cn(
          "mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong bg-canvas px-4 py-6 text-center transition-colors hover:border-brand hover:bg-brand-soft/40",
          busy && "pointer-events-none opacity-60",
        )}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) void upload(f);
        }}
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin text-brand" /> : <Upload className="h-5 w-5 text-muted" />}
        <span className="text-[13px] font-medium text-ink-2">{busy ? "Reading document…" : "Choose a file or drop it here"}</span>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.txt,.md,.markdown,.csv"
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
        />
      </label>
      {status ? (
        <div className="mt-3">
          <Notice tone={status.tone}>
            {status.tone === "danger" ? <AlertCircle className="mr-1 inline h-3.5 w-3.5" /> : null}
            {status.text}
          </Notice>
        </div>
      ) : null}
    </Card>
  );
}
