import "server-only";
import { serverEnv } from "@/lib/env";

// Optional vector embeddings for knowledge retrieval. When no embeddings
// provider is configured, retrieval uses Postgres full-text search only.
// Dimension must match knowledge_chunks.embedding (1024).

export const EMBEDDING_DIMENSIONS = 1024;

export function embeddingsEnabled(): boolean {
  return serverEnv.embeddingsProvider() === "voyage";
}

/**
 * Embeds texts. Returns null when embeddings are disabled.
 * inputType: "document" for knowledge chunks, "query" for customer questions.
 */
export async function embed(
  texts: string[],
  inputType: "document" | "query",
): Promise<number[][] | null> {
  if (!embeddingsEnabled() || texts.length === 0) return null;

  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serverEnv.voyageApiKey()}`,
    },
    body: JSON.stringify({
      input: texts,
      model: process.env.VOYAGE_MODEL || "voyage-3.5",
      input_type: inputType,
      output_dimension: EMBEDDING_DIMENSIONS,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    throw new Error(`Embeddings request failed (${res.status})`);
  }
  const json = (await res.json()) as { data: { embedding: number[]; index: number }[] };
  return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

/** pgvector text format, e.g. "[0.1,0.2,...]". */
export function toPgVector(vector: number[]): string {
  return `[${vector.join(",")}]`;
}
