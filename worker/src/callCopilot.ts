import Groq from "groq-sdk";
import type {
  CallCustomerType,
  CallObjectionType,
  CallScorecard,
  CallScorecardRequest,
  CallSuggestion,
  CallSuggestionRequest,
  Env
} from "./types";
import { salesPlaybook } from "./salesPlaybook";

const suggestionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    objectionType: {
      type: "string",
      enum: ["price", "timing", "trust", "competitor", "confusion", "authority", "none"]
    },
    buyingSignal: { type: "boolean" },
    confidence: { type: "number" },
    customerType: {
      type: "string",
      enum: [
        "buyer",
        "inquirer",
        "price_sensitive_lead",
        "comparison_shopper",
        "needs_approval_lead",
        "timing_constrained_lead",
        "support_existing_customer",
        "not_qualified",
        "unknown"
      ]
    },
    customerTypeConfidence: { type: "number" },
    customerIntent: { type: "string" },
    recommendedInfo: { type: "string" },
    persuasionTip: { type: "string" },
    empathyLine: { type: "string" },
    whisper: { type: "string" },
    sayThis: { type: "string" },
    nextQuestion: { type: "string" },
    nextAction: { type: "string" },
    closingMove: { type: "string" },
    reason: { type: "string" }
  },
  required: [
    "objectionType",
    "buyingSignal",
    "confidence",
    "customerType",
    "customerTypeConfidence",
    "customerIntent",
    "recommendedInfo",
    "persuasionTip",
    "empathyLine",
    "whisper",
    "sayThis",
    "nextQuestion",
    "nextAction",
    "closingMove",
    "reason"
  ]
} as const;

const scorecardSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    objections: { type: "array", items: { type: "string" } },
    buyingSignals: { type: "array", items: { type: "string" } },
    scriptsUsed: { type: "array", items: { type: "string" } },
    recommendedFollowUp: { type: "string" },
    repCoaching: { type: "string" }
  },
  required: ["summary", "objections", "buyingSignals", "scriptsUsed", "recommendedFollowUp", "repCoaching"]
} as const;

function createGroqClient(env: Env): Groq {
  if (!env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is missing");
  }

  return new Groq({
    apiKey: env.GROQ_API_KEY
  });
}

type FallbackSuggestionDraft = Omit<CallSuggestion, "reason">;

function includesAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

function getPlaybookCopy(objectionType: CallObjectionType) {
  return (
    salesPlaybook.find((item) => item.objectionType === objectionType) ??
    salesPlaybook.find((item) => item.objectionType === "none")!
  );
}

function withPlaybookDefaults(
  draft: Omit<FallbackSuggestionDraft, "whisper" | "sayThis" | "nextAction"> &
    Partial<Pick<FallbackSuggestionDraft, "whisper" | "sayThis" | "nextAction">>
): FallbackSuggestionDraft {
  const playbookCopy = getPlaybookCopy(draft.objectionType);

  return {
    ...draft,
    whisper: draft.whisper ?? playbookCopy.whisper,
    sayThis: draft.sayThis ?? playbookCopy.sayThis,
    nextAction: draft.nextAction ?? playbookCopy.nextAction
  };
}

function classifyFallbackSuggestion(text: string): FallbackSuggestionDraft {
  const normalized = text.toLowerCase();

  if (
    includesAny(normalized, [
      "not a fit",
      "no budget",
      "too small",
      "just browsing",
      "not qualified",
      "student project",
      "not interested"
    ])
  ) {
    return withPlaybookDefaults({
      objectionType: "none",
      buyingSignal: false,
      confidence: 0.76,
      customerType: "not_qualified",
      customerTypeConfidence: 0.78,
      customerIntent: "Signal that the product may not match their budget, urgency, or use case.",
      recommendedInfo: "Confirm the disqualifying constraint and offer a lighter resource only if it preserves time.",
      persuasionTip: "Do not over-persuade; qualify cleanly and protect the rep's time.",
      empathyLine: "That is helpful context.",
      whisper: "Qualify quickly and avoid forcing a next step if the fit is weak.",
      sayThis: "That helps. If this is not a fit right now, the most useful thing may be to confirm what would need to change.",
      nextQuestion: "What would need to be true for this to become relevant later?",
      nextAction: "Decide whether to nurture, disqualify, or send a lightweight resource.",
      closingMove: "Confirm fit before asking for another meeting."
    });
  }

  if (
    includesAny(normalized, [
      "existing customer",
      "current customer",
      "support",
      "bug",
      "issue",
      "problem",
      "invoice",
      "renewal",
      "account"
    ])
  ) {
    return withPlaybookDefaults({
      objectionType: "none",
      buyingSignal: false,
      confidence: 0.72,
      customerType: "support_existing_customer",
      customerTypeConfidence: 0.74,
      customerIntent: "Resolve an account, support, billing, or renewal issue rather than evaluate a new purchase.",
      recommendedInfo: "Acknowledge the issue, clarify ownership, and route to the right next support or account step.",
      persuasionTip: "Earn trust by solving the immediate problem before expanding the conversation.",
      empathyLine: "Thanks for flagging that.",
      whisper: "Switch from selling to resolution, then preserve any commercial thread for later.",
      sayThis: "Thanks for flagging that. Let me make sure we get the right next step for this issue first.",
      nextQuestion: "Is this blocking your team right now, or is it more of a follow-up item?",
      nextAction: "Capture the issue and route it to support or the account owner.",
      closingMove: "Resolve or route the support need before returning to sales."
    });
  }

  if (includesAny(normalized, ["price", "expensive", "cost", "budget", "cheaper", "discount"])) {
    return withPlaybookDefaults({
      objectionType: "price",
      buyingSignal: false,
      confidence: 0.86,
      customerType: "price_sensitive_lead",
      customerTypeConfidence: 0.86,
      customerIntent: "Understand whether the value justifies the cost and fits their budget.",
      recommendedInfo: "Tie price to time saved, avoided manual work, implementation scope, and the smallest viable next step.",
      persuasionTip: "Anchor on measurable value before discussing discounts or cheaper plans.",
      empathyLine: "Totally fair.",
      nextQuestion: "What budget range would make this easier to approve?",
      closingMove: "Reframe value, then move to a concrete next step."
    });
  }

  if (includesAny(normalized, ["later", "timing", "not now", "next quarter", "too busy", "timeline"])) {
    return withPlaybookDefaults({
      objectionType: "timing",
      buyingSignal: false,
      confidence: 0.82,
      customerType: "timing_constrained_lead",
      customerTypeConfidence: 0.82,
      customerIntent: "Delay the decision until timing, workload, or priorities change.",
      recommendedInfo: "Explain the lowest-effort implementation path and connect timing to a specific business trigger.",
      persuasionTip: "Turn vague delay into a concrete trigger date or event.",
      empathyLine: "That makes sense.",
      nextQuestion: "What event would make this the right time?",
      closingMove: "Convert the timing objection into a scheduled follow-up."
    });
  }

  if (includesAny(normalized, ["manager", "approval", "decision", "boss", "procurement", "legal", "committee"])) {
    return withPlaybookDefaults({
      objectionType: "authority",
      buyingSignal: true,
      confidence: 0.84,
      customerType: "needs_approval_lead",
      customerTypeConfidence: 0.84,
      customerIntent: "Get internal approval or align additional stakeholders before committing.",
      recommendedInfo: "Offer a concise business case, stakeholder-ready summary, and approval criteria.",
      persuasionTip: "Help the customer sell internally instead of pushing them to decide alone.",
      empathyLine: "That is completely reasonable.",
      whisper: "Equip the champion with a short business case and identify the real decision path.",
      sayThis: "That makes sense. I can help you make this easy to review with your manager.",
      nextQuestion: "What will your manager care about most when they review this?",
      nextAction: "Offer a summary the customer can forward and ask who else should be included.",
      closingMove: "Map the approval path and secure the next stakeholder step."
    });
  }

  if (
    includesAny(normalized, [
      "competitor",
      "other vendor",
      "alternative",
      "comparing",
      "comparison",
      "versus",
      " vs "
    ])
  ) {
    return withPlaybookDefaults({
      objectionType: "competitor",
      buyingSignal: true,
      confidence: 0.82,
      customerType: "comparison_shopper",
      customerTypeConfidence: 0.82,
      customerIntent: "Compare options and identify the vendor that best fits their decision criteria.",
      recommendedInfo: "Clarify evaluation criteria, then differentiate on outcomes, implementation, and support.",
      persuasionTip: "Ask what matters most before positioning against competitors.",
      empathyLine: "That is useful context.",
      nextQuestion: "What matters most in your final decision besides price?",
      closingMove: "Surface decision criteria before differentiating."
    });
  }

  if (includesAny(normalized, ["ready to buy", "move forward", "next steps", "purchase", "sign", "get started"])) {
    return withPlaybookDefaults({
      objectionType: "none",
      buyingSignal: true,
      confidence: 0.8,
      customerType: "buyer",
      customerTypeConfidence: 0.8,
      customerIntent: "Confirm fit and move toward a concrete buying or implementation step.",
      recommendedInfo: "Give the buyer the exact next step, timeline, and who needs to be involved.",
      persuasionTip: "Reduce friction by making the next action specific and easy to accept.",
      empathyLine: "That sounds promising.",
      whisper: "Capitalize on momentum and make the next step explicit.",
      sayThis: "Great. The easiest next step is to line up the right people and walk through the exact workflow.",
      nextQuestion: "Who else should be involved in the next step?",
      nextAction: "Book the next meeting or confirm the purchase path.",
      closingMove: "Secure a concrete next step while intent is high."
    });
  }

  if (
    includesAny(normalized, [
      "how does",
      "how do",
      "what is",
      "tell me",
      "can you explain",
      "interested in",
      "looking for",
      "curious",
      "learn more",
      "understand"
    ])
  ) {
    return withPlaybookDefaults({
      objectionType: "confusion",
      buyingSignal: false,
      confidence: 0.7,
      customerType: "inquirer",
      customerTypeConfidence: 0.72,
      customerIntent: "Learn how the product works and whether it is relevant to their problem.",
      recommendedInfo: "Explain the product in one sentence, then tie it to the customer's likely workflow.",
      persuasionTip: "Keep the answer concrete and invite them to share the use case behind the question.",
      empathyLine: "Good question.",
      whisper: "Answer simply, then discover the business reason behind the question.",
      sayThis: "Good question. The simplest way to think about it is that it gives reps live guidance during calls.",
      nextQuestion: "What part of your workflow are you trying to improve?",
      nextAction: "Clarify the use case before pitching features.",
      closingMove: "Turn the inquiry into a discovery question."
    });
  }

  if (includesAny(normalized, ["trust", "risk", "security", "compliance", "privacy"])) {
    return withPlaybookDefaults({
      objectionType: "trust",
      buyingSignal: false,
      confidence: 0.72,
      customerType: "inquirer",
      customerTypeConfidence: 0.62,
      customerIntent: "Evaluate whether the product is safe and credible enough to consider.",
      recommendedInfo: "Share only confirmed security, privacy, or proof-point details from the sales context.",
      persuasionTip: "Use proof and specificity; avoid broad promises.",
      empathyLine: "That is a fair thing to check.",
      whisper: "Acknowledge the risk concern and offer proof without inventing details.",
      sayThis: "That is fair to check. I can share the security details we have and flag anything that needs follow-up.",
      nextQuestion: "Which risk or requirement matters most for your team?",
      nextAction: "Offer a focused proof point or follow-up with the right documentation.",
      closingMove: "Convert trust concern into a concrete proof request."
    });
  }

  return withPlaybookDefaults({
    objectionType: "none",
    buyingSignal: false,
    confidence: 0.45,
    customerType: "unknown",
    customerTypeConfidence: 0.45,
    customerIntent: "The customer's intent is not clear from the latest utterance.",
    recommendedInfo: "Ask one clarifying question before giving a strong recommendation.",
    persuasionTip: "Stay neutral and gather context before persuading.",
    empathyLine: "That helps clarify things.",
    whisper: "Ask for context before assuming an objection or buying signal.",
    sayThis: "That helps. Can you tell me what matters most to you right now?",
    nextQuestion: "What would make the next step feel useful?",
    nextAction: "Ask a clarifying discovery question.",
    closingMove:
      "Clarify intent, then choose the right next step."
  });
}

export function buildFallbackSuggestion(text: string): CallSuggestion {
  return {
    ...classifyFallbackSuggestion(text),
    reason: "Heuristic fallback because the model was unavailable or returned invalid JSON."
  };
}

async function parseJsonContent<T>(content: string | null | undefined): Promise<T | null> {
  if (!content) {
    return null;
  }

  try {
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

export async function buildCallSuggestion(
  request: CallSuggestionRequest,
  env: Env
): Promise<CallSuggestion> {
  const fallback = buildFallbackSuggestion(request.latestUtterance);

  const systemPrompt = [
    "You are a senior B2B sales coach.",
    "Your job is to help the rep move the call toward one concrete next step.",
    "Classify the caller/customer type as buyer, inquirer, price_sensitive_lead, comparison_shopper, needs_approval_lead, timing_constrained_lead, support_existing_customer, not_qualified, or unknown.",
    "Identify the customer's intent and the exact information the rep should give next.",
    "Give a persuasive tip that helps the rep ethically move the customer toward the next concrete step.",
    "Be concise, specific, calm, and persuasive without being pushy.",
    "Use the provided sales context and transcript. Do not invent facts.",
    "If confidence is low, prefer a clarifying question over a strong claim.",
    "Return only JSON that matches the schema."
  ].join(" ");

  try {
    const client = createGroqClient(env);
    const response = await client.chat.completions.create({
      model: "openai/gpt-oss-20b",
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: JSON.stringify({
            latestUtterance: request.latestUtterance,
            recentTranscript: request.recentTranscript.slice(-8),
            screenContext: request.screenContext,
            salesContext: request.salesContext
          })
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "call_suggestion",
          strict: true,
          schema: suggestionSchema
        }
      }
    });

    const parsed = await parseJsonContent<CallSuggestion>(response.choices[0]?.message?.content);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

export async function buildCallScorecard(
  request: CallScorecardRequest,
  env: Env
): Promise<CallScorecard> {
  const client = createGroqClient(env);

  const systemPrompt = [
    "You are generating a concise post-call scorecard for a sales rep.",
    "Focus on objections, buying signals, next-step quality, and rep coaching.",
    "Return only JSON that matches the schema."
  ].join(" ");

  const response = await client.chat.completions.create({
    model: "openai/gpt-oss-20b",
    messages: [
      {
        role: "system",
        content: systemPrompt
      },
      {
        role: "user",
        content: JSON.stringify({
          recentTranscript: request.recentTranscript.slice(-20)
        })
      }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "call_scorecard",
        strict: true,
        schema: scorecardSchema
      }
    }
  });

  const parsed = await parseJsonContent<CallScorecard>(response.choices[0]?.message?.content);
  return (
    parsed ?? {
      summary: "No scorecard could be generated.",
      objections: [],
      buyingSignals: [],
      scriptsUsed: [],
      recommendedFollowUp: "Review the transcript manually.",
      repCoaching: "No coaching available."
    }
  );
}
