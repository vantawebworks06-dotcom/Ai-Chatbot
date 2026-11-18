import { describe, expect, it } from "vitest";
import {
  evaluateRules,
  isHumanRequest,
  isUnhelpfulFeedback,
  UNHELPFUL_LIMIT,
} from "@/lib/support/handoff-rules";

describe("explicit requests for a human", () => {
  it.each([
    "Can I talk to a human?",
    "I want to speak with a real person",
    "connect me to an agent please",
    "agent",
    "Human please!",
    "I need a human agent",
    "let me chat with someone from your team",
    "are you a bot? I want a real person",
    "Can I speak to a manager",
  ])("hands off: %s", (text) => {
    expect(isHumanRequest(text)).toBe(true);
    expect(evaluateRules(text, 0).handoff).toBe("customer_requested");
  });

  it.each([
    "What are your opening hours?",
    "Do you ship to Germany?",
    "How do I reset my password",
    "Is this product suitable for humans with allergies?",
  ])("does not hand off: %s", (text) => {
    expect(evaluateRules(text, 0).handoff).toBeNull();
  });
});

describe("refunds and exceptions", () => {
  it.each([
    "I want a refund",
    "Please refund my order",
    "Can I get my money back?",
    "I'm going to file a chargeback",
    "Can you make an exception for me?",
    "I need to cancel my order",
    "I was charged twice",
  ])("hands off: %s", (text) => {
    expect(evaluateRules(text, 0).handoff).toBe("refund_or_exception");
  });

  it("leaves refund policy questions to the AI", () => {
    expect(evaluateRules("What is your refund policy?", 0).handoff).toBeNull();
    expect(evaluateRules("How long do refunds take to process?", 0).handoff).toBeNull();
  });
});

describe("complaints", () => {
  it.each([
    "This is unacceptable",
    "My package arrived damaged",
    "I received a broken item",
    "I'm contacting my lawyer",
    "worst service ever",
  ])("hands off: %s", (text) => {
    expect(evaluateRules(text, 0).handoff).toBe("complaint");
  });
});

describe("repeated unhelpful answers", () => {
  it("counts but does not hand off on the first unhelpful signal", () => {
    const r = evaluateRules("That didn't help", 0);
    expect(r.unhelpful).toBe(true);
    expect(r.handoff).toBeNull();
  });

  it(`hands off once the count reaches ${UNHELPFUL_LIMIT}`, () => {
    const r = evaluateRules("That's not what I asked", UNHELPFUL_LIMIT - 1);
    expect(r.handoff).toBe("repeated_unhelpful");
  });

  it.each(["not helpful", "useless", "you're not understanding", "wrong answer", "that doesn't answer my question"])(
    "detects: %s",
    (text) => expect(isUnhelpfulFeedback(text)).toBe(true),
  );

  it("does not treat normal questions as unhelpful", () => {
    expect(isUnhelpfulFeedback("Thanks, that helps!")).toBe(false);
    expect(isUnhelpfulFeedback("What sizes do you have?")).toBe(false);
  });
});
