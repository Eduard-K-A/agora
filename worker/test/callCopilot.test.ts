import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CallCustomerType, CallObjectionType } from "../src/types";

const createCompletionMock = vi.hoisted(() => vi.fn());
const transcribeMock = vi.hoisted(() => vi.fn());

vi.mock("groq-sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: createCompletionMock
      }
    }
  }))
}));

vi.mock("../src/transcribe", () => ({
  transcribeAudio: transcribeMock
}));

import {
  buildCallAudioAnalysis,
  buildCallScorecard,
  buildCallSuggestion,
  buildFallbackSuggestion
} from "../src/callCopilot";

const env = {
  GROQ_API_KEY: "test-groq-key"
};

describe("callCopilot", () => {
  beforeEach(() => {
    createCompletionMock.mockReset();
    transcribeMock.mockReset();
  });

  it("builds a call suggestion using the extended Groq schema", async () => {
    createCompletionMock.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              objectionType: "none",
              buyingSignal: true,
              confidence: 0.91,
              customerType: "buyer",
              customerTypeConfidence: 0.88,
              customerIntent: "Confirm fit and move to a demo.",
              recommendedInfo: "Share the implementation path and expected time to value.",
              persuasionTip: "Make the next step feel low-risk and concrete.",
              empathyLine: "That sounds promising.",
              whisper: "Move the buying signal into a clear next step.",
              sayThis: "Great. The fastest path is a focused demo with your core workflow.",
              nextQuestion: "Who else should join the demo?",
              nextAction: "Book a follow-up demo with stakeholders.",
              closingMove: "Secure the next meeting.",
              reason: "The customer asked about next steps."
            })
          }
        }
      ]
    });

    const suggestion = await buildCallSuggestion({
      mode: "call_copilot",
      latestUtterance: "this looks good, what are the next steps?",
      recentTranscript: [],
      screenContext: [],
      salesContext: {
        companyName: "Ely Sales Agent",
        productName: "Ely Sales Agent",
        industry: "B2B software",
        prospectName: "Prospect",
        dealStage: "discovery",
        repGoal: "move the customer to a clear next step",
        targetCloseStep: "book a demo",
        knownObjections: [],
        notes: "Prototype test call",
        tone: "concise, warm, confident"
      }
    }, env);

    expect(suggestion.customerType).toBe("buyer");
    expect(suggestion.recommendedInfo.length).toBeGreaterThan(0);
    expect(createCompletionMock.mock.calls[0]?.[0].messages[0].content).toContain("SQLite inventory data");
    expect(createCompletionMock.mock.calls[0]?.[0].messages[0].content).toContain("price");
    expect(createCompletionMock.mock.calls[0]?.[0].messages[0].content).toContain("stock");
    expect(createCompletionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        response_format: expect.objectContaining({
          json_schema: expect.objectContaining({
            schema: expect.objectContaining({
              required: expect.arrayContaining([
                "customerType",
                "customerTypeConfidence",
                "customerIntent",
                "recommendedInfo",
                "persuasionTip"
              ])
            })
          })
        })
      })
    );
  });

  it.each([
    {
      text: "the price is too high for us",
      objectionType: "price",
      customerType: "price_sensitive_lead"
    },
    {
      text: "we need to wait until next quarter",
      objectionType: "timing",
      customerType: "timing_constrained_lead"
    },
    {
      text: "I need approval from my manager",
      objectionType: "authority",
      customerType: "needs_approval_lead"
    },
    {
      text: "we are comparing you against another vendor",
      objectionType: "competitor",
      customerType: "comparison_shopper"
    },
    {
      text: "this looks good and we are ready to buy",
      objectionType: "none",
      customerType: "buyer"
    },
    {
      text: "can you explain how this works?",
      objectionType: "confusion",
      customerType: "inquirer"
    },
    {
      text: "we are an existing customer with a support issue",
      objectionType: "none",
      customerType: "support_existing_customer"
    },
    {
      text: "we have no budget and this is not a fit",
      objectionType: "none",
      customerType: "not_qualified"
    },
    {
      text: "okay",
      objectionType: "none",
      customerType: "unknown"
    }
  ] satisfies Array<{
    text: string;
    objectionType: CallObjectionType;
    customerType: CallCustomerType;
  }>)(
    "classifies fallback suggestion for $customerType",
    ({ text, objectionType, customerType }) => {
      const suggestion = buildFallbackSuggestion(text);

      expect(suggestion.objectionType).toBe(objectionType);
      expect(suggestion.customerType).toBe(customerType);
      expect(suggestion.customerTypeConfidence).toBeGreaterThan(0);
      expect(suggestion.customerIntent.length).toBeGreaterThan(0);
      expect(suggestion.recommendedInfo.length).toBeGreaterThan(0);
      expect(suggestion.persuasionTip.length).toBeGreaterThan(0);
    }
  );

  it("falls back to local classification when Groq is unavailable", async () => {
    createCompletionMock.mockRejectedValue(new Error("Groq unavailable"));

    const suggestion = await buildCallSuggestion({
      mode: "call_copilot",
      latestUtterance: "I need approval from my manager",
      recentTranscript: [],
      screenContext: [],
      salesContext: {
        companyName: "Ely Sales Agent",
        productName: "Ely Sales Agent",
        industry: "B2B software",
        prospectName: "Prospect",
        dealStage: "discovery",
        repGoal: "move the customer to a clear next step",
        targetCloseStep: "book a demo",
        knownObjections: ["authority"],
        notes: "Prototype test call",
        tone: "concise, warm, confident"
      }
    }, env);

    expect(suggestion.customerType).toBe("needs_approval_lead");
    expect(suggestion.objectionType).toBe("authority");
  });

  it("builds a scorecard from transcript text", async () => {
    createCompletionMock.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              summary: "The customer raised a price concern.",
              objections: ["price"],
              buyingSignals: [],
              scriptsUsed: ["price-reframe"],
              recommendedFollowUp: "Send ROI proof and book a follow-up.",
              repCoaching: "Acknowledge the objection before reframing."
            })
          }
        }
      ]
    });

    const scorecard = await buildCallScorecard({
      recentTranscript: [
        { speaker: "customer", text: "the price is too high", timestampISO: "2026-05-27T03:35:00Z" },
        { speaker: "agent", text: "what budget range works?", timestampISO: "2026-05-27T03:35:10Z" }
      ]
    }, env);

    expect(scorecard.objections).toContain("price");
    expect(scorecard.recommendedFollowUp.length).toBeGreaterThan(0);
  });

  it("keeps only customer turns in the ingest pipeline", async () => {
    transcribeMock.mockResolvedValue({ text: "the price is too high" });
    createCompletionMock
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                speaker: "customer",
                confidence: 0.93,
                reason: "The chunk reads like a customer objection."
              })
            }
          }
        ]
      })
      .mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              objectionType: "price",
              buyingSignal: false,
              confidence: 0.86,
              customerType: "price_sensitive_lead",
              customerTypeConfidence: 0.86,
              customerIntent: "Understand whether value justifies the cost.",
              recommendedInfo: "Connect price to saved time and avoided manual work.",
              persuasionTip: "Anchor on measurable value before discussing discounts.",
              empathyLine: "Totally fair.",
              whisper: "Acknowledge the price concern, then reframe around saved time.",
              sayThis: "Totally fair. Most teams feel that at first.",
              nextQuestion: "What budget range would make this easier to approve?",
              nextAction: "Ask what budget range would make this easier to approve.",
              closingMove: "Reframe value, then move to a concrete next step.",
              reason: "The customer raised a price concern."
            })
          }
        }
      ]
    });

    const analysis = await buildCallAudioAnalysis(
      {
        source: "system",
        file: new File(["x".repeat(2048)], "turn.webm"),
        recentTranscript: [],
        screenContext: [],
        salesContext: {
          companyName: "Ely Sales Agent",
          productName: "Ely Sales Agent",
          industry: "B2B software",
          prospectName: "Prospect",
          dealStage: "discovery",
          repGoal: "move the customer to a clear next step",
          targetCloseStep: "book a demo",
          knownObjections: ["price"],
          notes: "Prototype test call",
          tone: "concise, warm, confident"
        }
      },
      env
    );

    expect(analysis.ignored).toBe(false);
    expect(analysis.speaker).toBe("customer");
    expect(analysis.transcriptEntry?.speaker).toBe("customer");
    expect(analysis.suggestion?.customerType).toBe("price_sensitive_lead");
  });
});
