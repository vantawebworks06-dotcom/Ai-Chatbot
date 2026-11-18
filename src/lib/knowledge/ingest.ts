import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { embed, toPgVector } from "@/lib/ai/embeddings";
import type { KnowledgeItem } from "@/lib/types";
import { itemToChunks } from "./chunk";
import { extractDocumentText } from "./extract";

const MAX_DOCUMENT_CHARS = 300_000;

/**
 * (Re)builds the search chunks for one knowledge item. Uses the service-role
 * client; callers must have already checked the user may edit this item.
 */
export async function ingestKnowledgeItem(db: SupabaseClient, itemId: string): Promise<void> {
  const { data, error } = await db.from("knowledge_items").select("*").eq("id", itemId).single();
  if (error) throw error;
  const item = data as KnowledgeItem;

  try {
    let content = item.content;

    if (item.kind === "document" && item.file_path) {
      const { data: file, error: dlError } = await db.storage
        .from("knowledge-docs")
        .download(item.file_path);
      if (dlError) throw dlError;
      const bytes = new Uint8Array(await file.arrayBuffer());
      content = (await extractDocumentText(bytes, item.file_name ?? item.file_path)).slice(
        0,
        MAX_DOCUMENT_CHARS,
      );
      if (!content.trim()) {
        throw new Error(
          "No text found in this file. Scanned PDFs (images of text) aren't supported yet.",
        );
      }
    }

    const chunks = itemToChunks(item.title, content);
    let vectors: number[][] | null = null;
    try {
      vectors = await embed(chunks, "document");
    } catch {
      vectors = null; // full-text search still works without embeddings
    }

    const { error: delError } = await db.from("knowledge_chunks").delete().eq("item_id", item.id);
    if (delError) throw delError;

    if (chunks.length) {
      const rows = chunks.map((chunk, i) => ({
        business_id: item.business_id,
        item_id: item.id,
        chunk_index: i,
        content: chunk,
        embedding: vectors ? toPgVector(vectors[i]) : null,
      }));
      for (let i = 0; i < rows.length; i += 100) {
        const { error: insError } = await db.from("knowledge_chunks").insert(rows.slice(i, i + 100));
        if (insError) throw insError;
      }
    }

    const { error: updError } = await db
      .from("knowledge_items")
      .update({
        status: "ready",
        error: null,
        ...(item.kind === "document" ? { content } : {}),
      })
      .eq("id", item.id);
    if (updError) throw updError;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Processing failed";
    await db.from("knowledge_items").update({ status: "error", error: message }).eq("id", item.id);
    throw err;
  }
}
