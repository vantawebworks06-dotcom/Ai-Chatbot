import { beforeEach, describe, expect, it, vi } from "vitest";

// The Google SDK is replaced with a stub: these tests check what Velora sends
// to Gemini and how it handles the reply, without network calls.
// (A plain function is used instead of vi.fn so rejected promises returned by
// the stub aren't reported as unhandled by Vitest's mock tracking.)
type Call = [Record<string, any>, Record<string, any>]; // eslint-disable-line @typescript-eslint/no-explicit-any
const calls: Call[] = [];
let respond: () => Promise<unknown> = async () => ({});

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    interactions = {
      create: (params: Call[0], options: Call[1]) => {
        calls.push([params, options]);
        return respond();
      },
    };
  },
}));

const { GeminiSupportProvider } = await import("@/lib/ai/gemini");

const request = {
  system: "You are Ava for Acme.",
  knowledge: "BUSINESS KNOWLEDGE\nShipping: 3-5 days.",
  history: [
    { role: "user" as const, content: "hi" },
    { role: "assistant" as const, content: "Hello! How can I help?" },
    { role: "user" as const, content: "How long is shipping?" },
  ],
};

const good = { reply: "3-5 business days.", needs_human: false, reason: "answered", confidence: "high" };
const reply = (value: unknown) => {
  respond = async () => value;
};
const provider = () => new GeminiSupportProvider("test-key", "gemini-test-model");

beforeEach(() => {
  calls.length = 0;
  reply({ status: "completed", output_text: JSON.stringify(good) });
});

describe("GeminiSupportProvider", () => {
  it("sends instructions, knowledge, history and the JSON schema", async () => {
    await provider().generateReply(request);

    const [params, options] = calls[0];
    expect(params.model).toBe("gemini-test-model");
    expect(params.store).toBe(false);
    expect(params.system_instruction).toContain("You are Ava for Acme.");
    expect(params.system_instruction).toContain("Shipping: 3-5 days.");
    expect(params.input).toEqual([
      { type: "user_input", content: [{ type: "text", text: "hi" }] },
      { type: "model_output", content: [{ type: "text", text: "Hello! How can I help?" }] },
      { type: "user_input", content: [{ type: "text", text: "How long is shipping?" }] },
    ]);
    expect(params.response_format.mime_type).toBe("application/json");
    expect(params.response_format.schema.required).toEqual(["reply", "needs_human", "reason", "confidence"]);
    expect(options.timeout).toBeGreaterThan(0);
  });

  it("parses a valid structured reply", async () => {
    expect(await provider().generateReply(request)).toEqual(good);
  });

  it("throws on incomplete or failed interactions (engine then hands off)", async () => {
    reply({ status: "incomplete", output_text: "" });
    await expect(provider().generateReply(request)).rejects.toThrow(/incomplete/);
  });

  it("throws on empty output", async () => {
    reply({ status: "completed", output_text: "" });
    await expect(provider().generateReply(request)).rejects.toThrow(/no text/);
  });

  it("rejects malformed JSON or wrong fields", async () => {
    reply({ status: "completed", output_text: "not json" });
    await expect(provider().generateReply(request)).rejects.toThrow();
    reply({ status: "completed", output_text: JSON.stringify({ reply: "x" }) });
    await expect(provider().generateReply(request)).rejects.toThrow();
  });

  it("propagates API errors (engine then hands off)", async () => {
    respond = async () => {
      throw new Error("401 API key not valid");
    };
    await expect(provider().generateReply(request)).rejects.toThrow(/API key/);
  });
});
