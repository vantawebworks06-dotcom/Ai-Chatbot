import { beforeEach, describe, expect, it, vi } from "vitest";

// The Groq SDK is replaced with a stub: these tests check what Velora sends
// to Groq and how it handles the reply, without network calls.
// (A plain function is used instead of vi.fn so rejected promises returned by
// the stub aren't reported as unhandled by Vitest's mock tracking.)
type Params = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const calls: Params[] = [];
const constructed: Params[] = [];
let respond: () => Promise<unknown> = async () => ({});

vi.mock("groq-sdk", () => ({
  default: class {
    constructor(options: Params) {
      constructed.push(options);
    }
    chat = {
      completions: {
        create: (params: Params) => {
          calls.push(params);
          return respond();
        },
      },
    };
  },
}));

const { GroqSupportProvider } = await import("@/lib/ai/groq");

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
const completion = (content: string | null, finish_reason = "stop") => ({
  choices: [{ finish_reason, message: { role: "assistant", content } }],
});
const reply = (value: unknown) => {
  respond = async () => value;
};
const provider = () => new GroqSupportProvider("test-key", "openai/gpt-oss-120b");

beforeEach(() => {
  calls.length = 0;
  constructed.length = 0;
  reply(completion(JSON.stringify(good)));
});

describe("GroqSupportProvider", () => {
  it("passes the API key and a short timeout to the SDK", () => {
    provider();
    expect(constructed[0].apiKey).toBe("test-key");
    expect(constructed[0].timeout).toBeGreaterThan(0);
  });

  it("sends instructions + knowledge as the system message, then the history", async () => {
    await provider().generateReply(request);
    const params = calls[0];
    expect(params.model).toBe("openai/gpt-oss-120b");
    expect(params.messages[0].role).toBe("system");
    expect(params.messages[0].content).toContain("You are Ava for Acme.");
    expect(params.messages[0].content).toContain("Shipping: 3-5 days.");
    expect(params.messages.slice(1)).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "Hello! How can I help?" },
      { role: "user", content: "How long is shipping?" },
    ]);
  });

  it("requests strict JSON Schema output", async () => {
    await provider().generateReply(request);
    const rf = calls[0].response_format;
    expect(rf.type).toBe("json_schema");
    expect(rf.json_schema.strict).toBe(true);
    expect(rf.json_schema.schema.additionalProperties).toBe(false);
    expect(rf.json_schema.schema.required).toEqual(["reply", "needs_human", "reason", "confidence"]);
  });

  it("parses a valid structured reply", async () => {
    expect(await provider().generateReply(request)).toEqual(good);
  });

  it("throws when the reply is cut off (engine then hands off)", async () => {
    reply(completion('{"reply": "3-5', "length"));
    await expect(provider().generateReply(request)).rejects.toThrow(/cut off/);
  });

  it("throws on empty output or no choices", async () => {
    reply(completion(null));
    await expect(provider().generateReply(request)).rejects.toThrow(/no text/);
    reply({ choices: [] });
    await expect(provider().generateReply(request)).rejects.toThrow(/no choices/);
  });

  it("rejects malformed JSON or wrong fields", async () => {
    reply(completion("not json"));
    await expect(provider().generateReply(request)).rejects.toThrow();
    reply(completion(JSON.stringify({ reply: "x" })));
    await expect(provider().generateReply(request)).rejects.toThrow();
  });

  it("retries Groq's transient json_validate_failed error, then succeeds", async () => {
    let n = 0;
    respond = async () => {
      n++;
      if (n < 3) {
        throw Object.assign(new Error('400 {"error":{"code":"json_validate_failed"}}'), { status: 400 });
      }
      return completion(JSON.stringify(good));
    };
    expect(await provider().generateReply(request)).toEqual(good);
    expect(calls).toHaveLength(3);
  });

  it("gives up after 3 json_validate_failed attempts (engine then hands off)", async () => {
    respond = async () => {
      throw Object.assign(new Error('400 {"error":{"code":"json_validate_failed"}}'), { status: 400 });
    };
    await expect(provider().generateReply(request)).rejects.toThrow(/json_validate_failed/);
    expect(calls).toHaveLength(3);
  });

  it("does not retry other errors", async () => {
    respond = async () => {
      throw Object.assign(new Error("401 Invalid API Key"), { status: 401 });
    };
    await expect(provider().generateReply(request)).rejects.toThrow();
    expect(calls).toHaveLength(1);
  });

  it("propagates API errors (engine then hands off)", async () => {
    respond = async () => {
      throw new Error("401 Invalid API Key");
    };
    await expect(provider().generateReply(request)).rejects.toThrow(/API Key/);
  });
});
