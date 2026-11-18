import "server-only";
import { extractText, getDocumentProxy } from "unpdf";

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

/** Extracts plain text from an uploaded PDF or text file. */
export async function extractDocumentText(bytes: Uint8Array, fileName: string): Promise<string> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) {
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  }
  if (/\.(txt|md|markdown|csv)$/.test(lower)) {
    return new TextDecoder("utf-8").decode(bytes);
  }
  throw new Error("Unsupported file type. Upload a PDF, .txt, .md or .csv file.");
}
