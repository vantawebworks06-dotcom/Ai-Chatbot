// Deterministic handoff rules. These run before (and independently of) the AI,
// so a customer can always reach a person even if the model misjudges.

export type HandoffReason =
  | "customer_requested"
  | "refund_or_exception"
  | "complaint"
  | "repeated_unhelpful"
  | "no_knowledge"
  | "low_confidence"
  | "ai_error";

export const HANDOFF_REASON_LABELS: Record<HandoffReason, string> = {
  customer_requested: "Customer asked for a person",
  refund_or_exception: "Refund or special request",
  complaint: "Complaint",
  repeated_unhelpful: "Answers weren't helping",
  no_knowledge: "Not covered by knowledge base",
  low_confidence: "AI wasn't confident",
  ai_error: "AI unavailable",
};

const HUMAN_REQUEST = [
  /\b(talk|speak|chat|connect)\s+(to|with)\s+(a\s+|an\s+|some\s*one|somebody|your\s+)?(human|person|agent|representative|rep|someone|somebody|staff|team|manager|supervisor|operator|real\s+person)/i,
  /\b(connect|transfer|put)\s+me\s+(to|with|through\s+to)\s+(a\s+|an\s+|the\s+|your\s+)?(human|person|agent|representative|rep|someone|somebody|staff|team|manager|supervisor|operator)\b/i,
  /\b(real|live|actual)\s+(human|person|agent|representative)\b/i,
  /\bhuman\s+(agent|being|support|please)\b/i,
  /\b(customer\s+service|customer\s+support)\s+(agent|representative|rep)\b/i,
  /\b(want|need|get)\s+(a|an|to\s+talk\s+to\s+a)\s+(human|person|agent|representative)\b/i,
  /^\s*(human|agent|representative|operator|person)\s*(please)?[.!?]*\s*$/i,
  /\bnot\s+a\s+(bot|robot|machine)\b/i,
  /\bstop\s+(the\s+)?bot\b/i,
];

// Requests for a refund are escalated; questions about the refund *policy*
// ("what is your refund policy?") are left to the AI and the knowledge base.
const REFUND_OR_EXCEPTION = [
  /\b(want|need|get|request|requesting|issue|process|give|demand)\b[^.?!]{0,25}\brefund/i,
  /\brefund\s+(me|my|this|the\s+order)\b/i,
  /\bmoney\s+back\b/i,
  /\bcharge\s*back\b/i,
  /\breimburse(ment)?\b/i,
  /\b(make|give\s+me)\s+an?\s+exception\b/i,
  /\bspecial\s+(exception|request|arrangement)\b/i,
  /\b(cancel|change|modify)\s+(my|the)\s+(order|subscription|booking|reservation)\b/i,
  /\bcharged\s+(twice|double|incorrectly|wrong)\b/i,
  /\bwrong\s+(item|order|charge)\b/i,
];

const COMPLAINT = [
  /\b(complain|complaint|unacceptable|outrageous|ridiculous|furious|disgusted)\b/i,
  /\b(lawyer|legal\s+action|sue|lawsuit|attorney)\b/i,
  /\b(scam|fraud)\b/i,
  /\b(damaged|broken|defective)\b.*\b(arrived|received|order|item|product)\b/i,
  /\b(arrived|received)\b.*\b(damaged|broken|defective)\b/i,
  /\bworst\s+(service|experience|company)\b/i,
];

const UNHELPFUL = [
  /\b(not|wasn'?t|isn'?t|didn'?t)\s+(help|helpful|useful|what\s+i\s+(asked|meant|need))/i,
  /\b(that|this)\s+(doesn'?t|does\s+not|didn'?t)\s+(help|answer)/i,
  /\b(useless|unhelpful|pointless)\b/i,
  /\byou('re|\s+are)\s+not\s+(understanding|listening|helping)\b/i,
  /\b(that'?s|that\s+is)\s+(wrong|incorrect|not\s+right)\b/i,
  /\bnot\s+what\s+i\s+(asked|meant|wanted)\b/i,
  /\bwrong\s+answer\b/i,
];

/** How many unhelpful signals before a conversation is handed off. */
export const UNHELPFUL_LIMIT = 2;

const matches = (patterns: RegExp[], text: string) => patterns.some((p) => p.test(text));

export function isHumanRequest(text: string): boolean {
  return matches(HUMAN_REQUEST, text);
}

export function isUnhelpfulFeedback(text: string): boolean {
  return matches(UNHELPFUL, text);
}

export interface RuleResult {
  /** Hand off right away, without asking the AI. */
  handoff: HandoffReason | null;
  /** The message signals that previous answers did not help. */
  unhelpful: boolean;
}

export function evaluateRules(text: string, previousUnhelpfulCount: number): RuleResult {
  const unhelpful = isUnhelpfulFeedback(text);

  if (isHumanRequest(text)) return { handoff: "customer_requested", unhelpful };
  if (matches(REFUND_OR_EXCEPTION, text)) return { handoff: "refund_or_exception", unhelpful };
  if (matches(COMPLAINT, text)) return { handoff: "complaint", unhelpful };
  if (unhelpful && previousUnhelpfulCount + 1 >= UNHELPFUL_LIMIT) {
    return { handoff: "repeated_unhelpful", unhelpful };
  }
  return { handoff: null, unhelpful };
}

export function handoffMessage(reason: HandoffReason): string {
  switch (reason) {
    case "customer_requested":
      return "Of course. I'm connecting you with a member of our team now. They'll reply right here in this chat.";
    case "refund_or_exception":
      return "A member of our team needs to handle this personally, so I'm connecting you with them now. They'll reply right here in this chat.";
    case "complaint":
      return "I'm sorry about this. I'm bringing in a member of our team who can look into it properly. They'll reply right here in this chat.";
    case "repeated_unhelpful":
      return "Sorry I haven't been able to help. I'm connecting you with a member of our team now. They'll reply right here in this chat.";
    default:
      return "I want to make sure you get the right answer, so I'm connecting you with a member of our team. They'll reply right here in this chat.";
  }
}
