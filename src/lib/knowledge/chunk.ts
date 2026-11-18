// Splits knowledge text into overlapping chunks for retrieval.
// Pure function, unit tested in tests/unit/chunk.test.ts.

export interface ChunkOptions {
  /** Target maximum characters per chunk. */
  maxChars?: number;
  /** Characters of overlap carried into the next chunk. */
  overlap?: number;
}

export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function chunkText(text: string, options: ChunkOptions = {}): string[] {
  const maxChars = options.maxChars ?? 1200;
  const overlap = Math.min(options.overlap ?? 150, Math.floor(maxChars / 3));
  const clean = normalizeText(text);
  if (!clean) return [];
  if (clean.length <= maxChars) return [clean];

  // Split into paragraphs, then sentences when a paragraph is too long.
  const units: string[] = [];
  for (const para of clean.split(/\n\n+/)) {
    if (para.length <= maxChars) {
      units.push(para);
      continue;
    }
    const sentences = para.match(/[^.!?\n]+[.!?]*\s*|\n/g) ?? [para];
    let buf = "";
    for (const s of sentences) {
      if ((buf + s).length > maxChars && buf) {
        units.push(buf.trim());
        buf = "";
      }
      if (s.length > maxChars) {
        for (let i = 0; i < s.length; i += maxChars) units.push(s.slice(i, i + maxChars).trim());
      } else {
        buf += s;
      }
    }
    if (buf.trim()) units.push(buf.trim());
  }

  const chunks: string[] = [];
  let current = "";
  for (const unit of units) {
    const candidate = current ? `${current}\n\n${unit}` : unit;
    if (candidate.length > maxChars && current) {
      chunks.push(current);
      const tail = current.slice(-overlap);
      const cut = tail.indexOf(" ");
      const carried = cut >= 0 ? tail.slice(cut + 1) : "";
      current = carried && carried.length + unit.length + 2 <= maxChars ? `${carried}\n\n${unit}` : unit;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/** Text that is indexed for an item: the title gives each chunk context. */
export function itemToChunks(title: string, content: string, options?: ChunkOptions): string[] {
  const body = chunkText(content, options);
  if (body.length === 0) return title.trim() ? [title.trim()] : [];
  return body.map((chunk) => `${title.trim()}\n\n${chunk}`);
}
