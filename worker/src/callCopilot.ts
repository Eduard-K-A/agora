import Groq from "groq-sdk";
import type {
  CallAudioAnalysisRequest,
  CallAudioAnalysisResponse,
  CallCustomerNeedCategory,
  CallCustomerType,
  CallObjectionType,
  CallScorecard,
  CallScorecardRequest,
  CallSpeaker,
  CallSuggestion,
  CallSuggestionRequest,
  CallTranscriptEntry,
  Env
} from "./types";
import { salesPlaybook } from "./salesPlaybook";
import { transcribeAudio } from "./transcribe";

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

const turnClassificationSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    speaker: {
      type: "string",
      enum: ["customer", "agent", "unknown"]
    },
    confidence: { type: "number" },
    reason: { type: "string" }
  },
  required: ["speaker", "confidence", "reason"]
} as const;

const customerNeedSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    category: {
      type: "string",
      enum: ["pricing", "timing", "approval", "comparison", "education", "trust", "support", "purchase_ready", "unclear"]
    },
    summary: { type: "string" },
    confidence: { type: "number" },
    reason: { type: "string" }
  },
  required: ["category", "summary", "confidence", "reason"]
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

function createCustomerTranscriptEntry(text: string): CallTranscriptEntry {
  return {
    speaker: "customer",
    text: text.trim(),
    timestampISO: new Date().toISOString()
  };
}

function classifyCustomerTurnFallback(text: string): {
  speaker: CallSpeaker;
  confidence: number;
  reason: string;
} {
  const normalized = text.toLowerCase();

  if (
    includesAny(normalized, [
      "i need",
      "we need",
      "our team",
      "my manager",
      "our budget",
      "how much",
      "how does this work",
      "what do you offer",
      "we are comparing",
      "we're comparing",
      "too expensive",
      "not now",
      "next quarter",
      "can you explain",
      "show me",
      "tell me more"
    ])
  ) {
    return {
      speaker: "customer",
      confidence: 0.68,
      reason: "The chunk reads like a prospect asking about fit, price, timing, or next steps."
    };
  }

  if (
    includesAny(normalized, [
      "i can send",
      "let me",
      "happy to",
      "thanks for",
      "the next step",
      "book time",
      "we can",
      "i'll follow up",
      "i will follow up"
    ])
  ) {
    return {
      speaker: "agent",
      confidence: 0.64,
      reason: "The chunk reads like rep follow-up language or a next-step commitment."
    };
  }

  return {
    speaker: "unknown",
    confidence: 0.42,
    reason: "The chunk did not contain enough evidence to identify the speaker reliably."
  };
}

function classifyCustomerNeedFallback(text: string): {
  category: CallCustomerNeedCategory;
  summary: string;
  confidence: number;
  reason: string;
} {
  const normalized = text.toLowerCase();

  if (includesAny(normalized, ["price", "cost", "budget", "expensive", "discount", "cheaper"])) {
    return {
      category: "pricing",
      summary: "The customer is evaluating price or budget fit.",
      confidence: 0.9,
      reason: "The transcript contains pricing language."
    };
  }

  if (includesAny(normalized, ["later", "next quarter", "timing", "busy", "not now", "timeline"])) {
    return {
      category: "timing",
      summary: "The customer wants to delay the decision or implementation.",
      confidence: 0.88,
      reason: "The transcript contains timing language."
    };
  }

  if (includesAny(normalized, ["manager", "approval", "decision", "boss", "procurement", "legal", "committee"])) {
    return {
      category: "approval",
      summary: "The customer needs internal approval or stakeholder alignment.",
      confidence: 0.88,
      reason: "The transcript contains approval language."
    };
  }

  if (includesAny(normalized, ["competitor", "comparing", "comparison", "versus", "alternative"])) {
    return {
      category: "comparison",
      summary: "The customer is comparing this offer with another option.",
      confidence: 0.87,
      reason: "The transcript contains comparison language."
    };
  }

  if (includesAny(normalized, ["how does", "how do", "what is", "explain", "learn more", "understand"])) {
    return {
      category: "education",
      summary: "The customer is trying to understand how the product works.",
      confidence: 0.85,
      reason: "The transcript contains educational language."
    };
  }

  if (includesAny(normalized, ["trust", "risk", "security", "compliance", "privacy"])) {
    return {
      category: "trust",
      summary: "The customer is checking trust, risk, or security concerns.",
      confidence: 0.84,
      reason: "The transcript contains trust language."
    };
  }

  if (includesAny(normalized, ["support", "issue", "bug", "invoice", "renewal", "account"])) {
    return {
      category: "support",
      summary: "The customer seems to need support or account help.",
      confidence: 0.84,
      reason: "The transcript contains support language."
    };
  }

  if (includesAny(normalized, ["buy", "purchase", "sign", "get started", "move forward", "next steps"])) {
    return {
      category: "purchase_ready",
      summary: "The customer is signaling readiness for the next buying step.",
      confidence: 0.8,
      reason: "The transcript contains purchase-ready language."
    };
  }

  return {
    category: "unclear",
    summary: "The customer's exact need is still unclear.",
    confidence: 0.52,
    reason: "The transcript does not clearly reveal the customer's intent."
  };
}

async function classifyCustomerNeed(
  request: CallAudioAnalysisRequest & { transcriptText: string },
  env: Env
): Promise<{ category: CallCustomerNeedCategory; summary: string; confidence: number; reason: string }> {
  const fallback = classifyCustomerNeedFallback(request.transcriptText);

  const systemPrompt = [
    "Classify the customer's primary need from a live sales-call transcript chunk.",
    "Choose the single best category: pricing, timing, approval, comparison, education, trust, support, purchase_ready, or unclear.",
    "Use the recent transcript and conversation state only as hints.",
    "Return a short summary that a rep can act on immediately.",
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
            transcriptText: request.transcriptText,
            recentTranscript: request.recentTranscript.slice(-8),
            screenContext: request.screenContext,
            salesContext: request.salesContext,
            conversationState: request.conversationState ?? null
          })
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "customer_need",
          strict: true,
          schema: customerNeedSchema
        }
      }
    });

    const parsed = await parseJsonContent<{
      category: CallCustomerNeedCategory;
      summary: string;
      confidence: number;
      reason: string;
    }>(response.choices[0]?.message?.content);

    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

async function classifyCustomerTurn(
  request: CallAudioAnalysisRequest & { transcriptText: string },
  env: Env
): Promise<{ speaker: CallSpeaker; confidence: number; reason: string }> {
  const fallback = classifyCustomerTurnFallback(request.transcriptText);

  const systemPrompt = [
    "You classify a single transcribed audio chunk from a live sales call.",
    "The audio comes from the call stream, so the chunk may be customer speech, rep speech, or unclear.",
    "Classify the latest speaker only. Do not guess beyond the evidence.",
    "Return customer when the speaker is the prospect/customer.",
    "Return agent when the speaker is the sales rep.",
    "Return unknown when the chunk is too ambiguous.",
    "Use the recent transcript and sales context only as hints.",
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
            transcriptText: request.transcriptText,
            recentTranscript: request.recentTranscript.slice(-8),
            screenContext: request.screenContext,
            salesContext: request.salesContext
          })
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "turn_classification",
          strict: true,
          schema: turnClassificationSchema
        }
      }
    });

    const parsed = await parseJsonContent<{ speaker: CallSpeaker; confidence: number; reason: string }>(
      response.choices[0]?.message?.content
    );
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
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
    "If a conversation state is provided, use it to preserve the customer's current need across turns.",
    "Give a persuasive tip that helps the rep ethically move the customer toward the next concrete step.",
    "Be concise, specific, calm, and persuasive without being pushy.",
    "Use the provided sales context and transcript. Do not invent facts.",
    "If screen context includes inventory or stock data, warn the rep about low stock, availability, inbound orders, or quantity mismatch.",
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
            salesContext: request.salesContext,
            conversationState: request.conversationState ?? null
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
    "You are generating a concise post-call summary for a sales rep.",
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
      summary: "No summary could be generated.",
      objections: [],
      buyingSignals: [],
      scriptsUsed: [],
      recommendedFollowUp: "Review the transcript manually.",
      repCoaching: "No coaching available."
    }
  );
}

export async function buildCallAudioAnalysis(
  request: CallAudioAnalysisRequest & { file: File },
  env: Env
): Promise<CallAudioAnalysisResponse> {
  let transcription: { text: string };

  try {
    transcription = await transcribeAudio(request.file, env);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Transcription failed";
    if (message.includes("could not process file") || message.includes("invalid_request_error")) {
      return {
        transcriptText: "",
        source: request.source,
        speaker: "unknown",
        speakerConfidence: 0,
        reason: `Groq could not process the audio chunk: ${message}`,
        ignored: true,
        transcriptEntry: undefined
      };
    }

    throw error;
  }

  const transcriptText = transcription.text.trim();

  if (!transcriptText) {
    return {
      transcriptText: "",
      source: request.source,
      speaker: "unknown",
      speakerConfidence: 0,
      reason: "The audio chunk did not produce transcribable speech.",
      ignored: true,
      transcriptEntry: undefined
    };
  }

  const speaker = request.source === "mic" ? "agent" : "customer";
  const transcriptEntry: CallTranscriptEntry = {
    speaker,
    text: transcriptText,
    timestampISO: new Date().toISOString()
  };

  if (speaker === "agent") {
    return {
      transcriptText,
      source: request.source,
      speaker,
      speakerConfidence: 1,
      reason: "Device microphone mapped to representative speech.",
      ignored: false,
      transcriptEntry
    };
  }

  const customerNeed = await classifyCustomerNeed(
    {
      source: request.source,
      transcriptText,
      recentTranscript: request.recentTranscript,
      screenContext: request.screenContext,
      salesContext: request.salesContext,
      conversationState: request.conversationState
    },
    env
  );

  const updatedTranscript = [...request.recentTranscript, transcriptEntry].slice(-20);
  const suggestion = await buildCallSuggestion(
    {
      mode: "call_copilot",
      latestUtterance: transcriptText,
      recentTranscript: updatedTranscript,
      screenContext: request.screenContext,
      salesContext: request.salesContext,
      conversationState: {
        summary: customerNeed.summary,
        lastCustomerUtterance: transcriptText,
        lastCustomerIntent: customerNeed.summary,
        lastCustomerNeedCategory: customerNeed.category,
        lastCustomerType: "unknown",
        confidence: customerNeed.confidence,
        lastUpdatedISO: transcriptEntry.timestampISO
      }
    },
    env
  );

  return {
    transcriptText,
    source: request.source,
    speaker,
    speakerConfidence: 1,
    reason: "System audio mapped to customer speech.",
    ignored: false,
    transcriptEntry,
    customerNeedCategory: customerNeed.category,
    customerNeedSummary: customerNeed.summary,
    suggestion
  };
}
