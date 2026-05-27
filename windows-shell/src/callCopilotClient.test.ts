import { describe, expect, it, vi } from "vitest";
import { requestCallSuggestion } from "./callCopilotClient";

describe("requestCallSuggestion", () => {
  it("posts the call suggestion contract to the Worker", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        objectionType: "price",
        buyingSignal: false,
        confidence: 0.86,
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
});
