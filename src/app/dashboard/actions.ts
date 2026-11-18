"use server";

import { refresh } from "next/cache";
import { requireBusiness } from "@/lib/auth";
import { ingestKnowledgeItem } from "@/lib/knowledge/ingest";
import { createAdminClient } from "@/lib/supabase/admin";
import type { KnowledgeKind } from "@/lib/types";
import { normalizeDomain } from "@/lib/widget/security";

export interface ActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

const str = (form: FormData, key: string, max = 2000) =>
  String(form.get(key) ?? "").trim().slice(0, max);
const optional = (form: FormData, key: string, max = 2000) => str(form, key, max) || null;

// ---------------------------------------------------------------------------
// Business settings
// ---------------------------------------------------------------------------
export async function updateBusiness(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, business } = await requireBusiness();
  const name = str(form, "name", 120);
  if (!name) return { error: "Business name is required." };

  const { error } = await supabase
    .from("businesses")
    .update({
      name,
      website_url: optional(form, "website_url", 300),
      description: optional(form, "description", 2000),
      industry: optional(form, "industry", 120),
      country: optional(form, "country", 120),
      timezone: str(form, "timezone", 64) || "UTC",
      currency: (str(form, "currency", 3) || "USD").toUpperCase(),
      phone: optional(form, "phone", 60),
      support_email: optional(form, "support_email", 254),
      address: optional(form, "address", 500),
      business_hours: optional(form, "business_hours", 2000),
    })
    .eq("id", business.id);
  if (error) return { error: error.message };
  refresh();
  return { ok: true, message: "Business details saved." };
}

// ---------------------------------------------------------------------------
// Chatbot customization
// ---------------------------------------------------------------------------
export async function updateChatbot(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, business } = await requireBusiness();
  const color = str(form, "primary_color", 7);
  if (!/^#[0-9a-f]{6}$/i.test(color)) return { error: "Pick a valid color." };
  const botName = str(form, "bot_name", 60);
  if (!botName) return { error: "Give your assistant a name." };

  const { error } = await supabase
    .from("chatbot_settings")
    .update({
      bot_name: botName,
      welcome_message: str(form, "welcome_message", 500) || "Hi there! How can we help you today?",
      primary_color: color.toLowerCase(),
      position: form.get("position") === "left" ? "left" : "right",
      enabled: form.get("enabled") === "on",
    })
    .eq("business_id", business.id);
  if (error) return { error: error.message };
  refresh();
  return { ok: true, message: "Chatbot updated. Changes appear on your website right away." };
}

export async function updateAllowedDomains(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, business } = await requireBusiness();
  const domains = str(form, "allowed_domains", 4000)
    .split(/[\s,]+/)
    .map(normalizeDomain)
    .filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$|^localhost$/.test(d));
  const unique = [...new Set(domains)].slice(0, 50);

  const { error } = await supabase
    .from("chatbot_settings")
    .update({ allowed_domains: unique })
    .eq("business_id", business.id);
  if (error) return { error: error.message };
  refresh();
  return {
    ok: true,
    message: unique.length
      ? `Widget restricted to ${unique.length} domain${unique.length === 1 ? "" : "s"}.`
      : "Widget allowed on any website.",
  };
}

// ---------------------------------------------------------------------------
// Knowledge base
// ---------------------------------------------------------------------------
const TEXT_KINDS: KnowledgeKind[] = ["faq", "product", "shipping_policy", "return_policy", "info"];

export async function saveKnowledgeItem(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, business, user } = await requireBusiness();
  const id = str(form, "id", 64);
  const kind = str(form, "kind", 32) as KnowledgeKind;
  const title = str(form, "title", 300);
  const content = str(form, "content", 20000);

  if (!TEXT_KINDS.includes(kind)) return { error: "Unknown knowledge type." };
  if (!title) return { error: kind === "faq" ? "Enter the question." : "Enter a title." };
  if (!content) return { error: kind === "faq" ? "Enter the answer." : "Enter the details." };

  // Written through the user's session, so row-level security confirms they
  // belong to this business before anything is indexed.
  const query = id
    ? supabase
        .from("knowledge_items")
        .update({ kind, title, content, status: "processing", error: null })
        .eq("id", id)
        .eq("business_id", business.id)
    : supabase.from("knowledge_items").insert({
        business_id: business.id,
        kind,
        title,
        content,
        status: "processing",
        created_by: user.id,
      });
  const { data, error } = await query.select("id").single();
  if (error) return { error: error.message };

  try {
    await ingestKnowledgeItem(createAdminClient(), data.id as string);
  } catch (e) {
    refresh();
    return { error: `Saved, but indexing failed: ${e instanceof Error ? e.message : "unknown error"}` };
  }
  refresh();
  return { ok: true, message: id ? "Entry updated." : "Entry added." };
}

export async function deleteKnowledgeItem(id: string): Promise<ActionState> {
  const { supabase, business } = await requireBusiness();
  const { data, error } = await supabase
    .from("knowledge_items")
    .delete()
    .eq("id", id)
    .eq("business_id", business.id)
    .select("file_path")
    .maybeSingle();
  if (error) return { error: error.message };
  if (data?.file_path) {
    await supabase.storage.from("knowledge-docs").remove([data.file_path as string]);
  }
  refresh();
  return { ok: true };
}

/** Called after the browser uploads a file to knowledge-docs/<business_id>/... */
export async function registerDocument(input: {
  path: string;
  fileName: string;
  title?: string;
}): Promise<ActionState> {
  const { supabase, business, user } = await requireBusiness();
  if (!input.path.startsWith(`${business.id}/`)) return { error: "Invalid upload path." };

  const { data, error } = await supabase
    .from("knowledge_items")
    .insert({
      business_id: business.id,
      kind: "document",
      title: (input.title || input.fileName).slice(0, 300),
      content: "",
      file_path: input.path,
      file_name: input.fileName.slice(0, 255),
      status: "processing",
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  try {
    await ingestKnowledgeItem(createAdminClient(), data.id as string);
  } catch (e) {
    refresh();
    return { error: e instanceof Error ? e.message : "Couldn't read this document." };
  }
  refresh();
  return { ok: true, message: "Document added to your knowledge base." };
}

export async function reprocessDocument(id: string): Promise<ActionState> {
  const { supabase, business } = await requireBusiness();
  const { data, error } = await supabase
    .from("knowledge_items")
    .update({ status: "processing", error: null })
    .eq("id", id)
    .eq("business_id", business.id)
    .select("id")
    .single();
  if (error) return { error: error.message };
  try {
    await ingestKnowledgeItem(createAdminClient(), data.id as string);
  } catch (e) {
    refresh();
    return { error: e instanceof Error ? e.message : "Processing failed." };
  }
  refresh();
  return { ok: true };
}
