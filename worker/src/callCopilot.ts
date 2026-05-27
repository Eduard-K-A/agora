import Groq from "groq-sdk";
import type {
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

function fallbackSuggestion(text: string): CallSuggestion {
  const normalized = text.toLowerCase();
  let objectionType: CallObjectionType = "none";

  if (normalized.includes("price") || normalized.includes("expensive") || normalized.includes("cost")) {
    objectionType = "price";
  } else if (normalized.includes("later") || normalized.includes("timing") || normalized.includes("not now")) {
    objectionType = "timing";
  } else if (normalized.includes("competitor") || normalized.includes("other vendor") || normalized.includes("alternative")) {
    objectionType = "competitor";
  } else if (normalized.includes("trust") || normalized.includes("risk") || normalized.includes("security")) {
    objectionType = "trust";
  } else if (normalized.includes("confused") || normalized.includes("unclear") || normalized.includes("understand")) {
    objectionType = "confusion";
  } else if (normalized.includes("manager") || normalized.includes("approval") || normalized.includes("decision")) {
    objectionType = "authority";
  }

  const match =
    salesPlaybook.find((item) => item.objectionType === objectionType) ??
    salesPlaybook.find((item) => item.objectionType === "none")!;

  return {
    objectionType,
    buyingSignal: objectionType === "none" || objectionType === "authority",
    confidence: objectionType === "none" ? 0.45 : 0.86,
    empathyLine:
      objectionType === "price"
        ? "Totally fair."
        : objectionType === "timing"
          ? "That makes sense."
          : "That helps clarify things.",
    whisper: match.whisper,
    sayThis: match.sayThis,
    nextQuestion:
      objectionType === "price"
        ? "What budget range would make this easier to approve?"
        : "What would make the next step feel reasonable?",
    nextAction: match.nextAction,
    closingMove:
      objectionType === "none"
        ? "Ask for the next step."
        : "Reframe value, then move to a concrete next step.",
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
  const client = createGroqClient(env);
  const fallback = fallbackSuggestion(request.latestUtterance);

  const systemPrompt = [
    "You are a senior B2B sales coach.",
    "Your job is to help the rep move the call toward one concrete next step.",
    "Be concise, specific, calm, and persuasive without being pushy.",
    "Use the provided sales context and transcript. Do not invent facts.",
    "If confidence is low, prefer a clarifying question over a strong claim.",
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
