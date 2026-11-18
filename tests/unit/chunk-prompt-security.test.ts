import { describe, expect, it } from "vitest";
import { chunkText, itemToChunks } from "@/lib/knowledge/chunk";
import { buildSystemPrompt, formatKnowledge, toTurns } from "@/lib/support/prompt";
import type { Business, ChatbotSettings, Message } from "@/lib/types";
import {
  bearerToken,
  generateVisitorToken,
  hashVisitorToken,
  isOriginAllowed,
  isUuid,
  isWellFormedToken,
  normalizeDomain,
  sanitizeMessage,
} from "@/lib/widget/security";

describe("chunking", () => {
  it("keeps short text as one chunk", () => {
    expect(chunkText("Hello world.")).toEqual(["Hello world."]);
  });

  it("returns nothing for empty text", () => {
    expect(chunkText("   \n\n ")).toEqual([]);
  });

  it("splits long text into chunks under the limit without losing content", () => {
    const para = (n: number) => `Paragraph ${n}. ` + "Some detail about the policy. ".repeat(20);
    const text = Array.from({ length: 12 }, (_, i) => para(i)).join("\n\n");
    const chunks = chunkText(text, { maxChars: 800, overlap: 100 });
    expect(chunks.length).toBeGreaterThan(5);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(800);
    for (let i = 0; i < 12; i++) expect(chunks.join(" ")).toContain(`Paragraph ${i}.`);
  });

  it("splits a single giant word", () => {
    const chunks = chunkText("x".repeat(3000), { maxChars: 1000 });
    expect(chunks.every((c) => c.length <= 1000)).toBe(true);
    expect(chunks.join("").length).toBe(3000);
  });

  it("prefixes chunks with the item title", () => {
    expect(itemToChunks("Returns", "30 days.")).toEqual(["Returns\n\n30 days."]);
  });
});

describe("prompt", () => {
  const business: Business = {
    id: "b1",
    name: "Acme",
    website_url: null,
    description: null,
    industry: null,
    country: "Germany",
    timezone: "Europe/Berlin",
    currency: "EUR",
    phone: "+49 30 1234",
    support_email: null,
    address: null,
    business_hours: "Mon–Fri 9–18",
    created_at: "",
  };
  const settings = { bot_name: "Ava" } as ChatbotSettings;

  it("forbids invented facts and unauthorized actions", () => {
    const p = buildSystemPrompt(business, settings);
    expect(p).toContain("Never invent or guess prices");
    expect(p).toMatch(/Never say or imply you have processed a refund/);
    expect(p).toContain("Acme");
    expect(p).toContain("Ava");
  });

  it("includes the business's own details and localization", () => {
    const k = formatKnowledge(business, []);
    expect(k).toContain("Mon–Fri 9–18");
    expect(k).toContain("EUR");
    expect(k).toContain("Europe/Berlin");
    expect(k).toContain("No entries matched");
  });

  it("maps message senders to model roles and drops system notices", () => {
    const msgs = [
      { sender: "ai", content: "hi" },
      { sender: "visitor", content: "q1" },
      { sender: "ai", content: "a1" },
      { sender: "system", content: "Agent joined" },
      { sender: "agent", content: "I can help" },
      { sender: "visitor", content: "q2" },
    ] as Message[];
    expect(toTurns(msgs)).toEqual([
      { role: "user", content: "q1" },
      { role: "assistant", content: "a1" },
      { role: "assistant", content: "(Team member) I can help" },
      { role: "user", content: "q2" },
    ]);
  });
});

describe("widget security", () => {
  it("generates unguessable, well-formed visitor tokens", () => {
    const a = generateVisitorToken();
    const b = generateVisitorToken();
    expect(a).not.toBe(b);
    expect(isWellFormedToken(a)).toBe(true);
    expect(isWellFormedToken("vt_short")).toBe(false);
    expect(isWellFormedToken(123)).toBe(false);
  });

  it("stores only a hash of the token", () => {
    const t = generateVisitorToken();
    const h = hashVisitorToken(t);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain(t);
    expect(hashVisitorToken(t)).toBe(h);
  });

  it("parses bearer tokens", () => {
    expect(bearerToken("Bearer abc")).toBe("abc");
    expect(bearerToken("Basic abc")).toBeNull();
    expect(bearerToken(null)).toBeNull();
  });

  it("validates ids", () => {
    expect(isUuid("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).toBe(true);
    expect(isUuid("1; drop table")).toBe(false);
  });

  it("allows any origin when no domains are configured", () => {
    expect(isOriginAllowed("https://anything.test", [])).toBe(true);
  });

  it("restricts origins to configured domains and their subdomains", () => {
    const allowed = ["shop.com"];
    expect(isOriginAllowed("https://shop.com", allowed)).toBe(true);
    expect(isOriginAllowed("https://www.shop.com", allowed)).toBe(true);
    expect(isOriginAllowed("https://eu.shop.com", allowed)).toBe(true);
    expect(isOriginAllowed("https://evilshop.com", allowed)).toBe(false);
    expect(isOriginAllowed("https://shop.com.evil.io", allowed)).toBe(false);
    expect(isOriginAllowed(null, allowed)).toBe(false);
  });

  it("normalizes domains", () => {
    expect(normalizeDomain("https://www.Shop.com/path")).toBe("shop.com");
    expect(normalizeDomain("shop.com:8080")).toBe("shop.com");
  });

  it("sanitizes messages", () => {
    expect(sanitizeMessage("  hi\u0000 there ")).toBe("hi there");
    expect(sanitizeMessage("   ")).toBeNull();
    expect(sanitizeMessage(42)).toBeNull();
    expect(sanitizeMessage("x".repeat(5000))?.length).toBe(2000);
  });
});
