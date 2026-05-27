import { describe, expect, it, vi } from "vitest";
import { requestCallSuggestion, requestLiveCallAnalysis } from "./callCopilotClient";

describe("requestCallSuggestion", () => {
  it("posts the call suggestion contract to the Worker", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        objectionType: "price",
        buyingSignal: false,
        confidence: 0.86,
        customerType: "price_sensitive_lead",
        customerTypeConfidence: 0.86,
        customerIntent: "Understand whether value justifies the cost.",
        recommendedInfo: "Connect price to saved time and avoided manual work.",
        persuasionTip: "Anchor on measurable value before discussing discounts.",
        whisper: "Acknowledge the price concern, then reframe around saved time.",
        sayThis: "Totally fair. Most teams feel that at first.",
        nextAction: "Ask what budget range would make this easier to approve."
      })
    });

    const suggestion = await requestCallSuggestion({
      workerBaseUrl: "https://example.workers.dev",
      mode: "call_copilot",
      latestUtterance: "that price is too high",
      recentTranscript: [],
      screenContext: [],
      salesContext: {
        companyName: "Clicky Sales Agent",
        productName: "Clicky Sales Agent",
        industry: "B2B software",
        prospectName: "Prospect",
        dealStage: "discovery",
        repGoal: "move the customer to a clear next step",
        targetCloseStep: "book a demo",
        knownObjections: ["price"],
        notes: "Prototype test call",
        tone: "concise, warm, confident"
      },
      fetchImpl: fetchMock as typeof fetch
    });

    expect(suggestion.objectionType).toBe("price");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.workers.dev/call/suggest",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("posts a live call analysis payload to the Worker", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        transcriptText: "the price is too high",
        source: "system",
        speaker: "customer",
        speakerConfidence: 0.91,
        reason: "The transcript reads like a prospect objection.",
        ignored: false,
        transcriptEntry: {
          speaker: "customer",
          text: "the price is too high",
          timestampISO: "2026-05-27T04:00:00.000Z"
        },
        suggestion: {
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
        }
      })
    });

    const analysis = await requestLiveCallAnalysis({
      workerBaseUrl: "https://example.workers.dev",
      source: "system",
      file: new Blob(["x".repeat(2048)]),
      recentTranscript: [],
      screenContext: [],
      salesContext: {
        companyName: "Clicky Sales Agent",
        productName: "Clicky Sales Agent",
        industry: "B2B software",
        prospectName: "Prospect",
        dealStage: "discovery",
        repGoal: "move the customer to a clear next step",
        targetCloseStep: "book a demo",
        knownObjections: ["price"],
        notes: "Prototype test call",
        tone: "concise, warm, confident"
      },
      fetchImpl: fetchMock as typeof fetch
    });

    expect(analysis.speaker).toBe("customer");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.workers.dev/call/ingest",
      expect.objectContaining({ method: "POST" })
    );
  });
});
