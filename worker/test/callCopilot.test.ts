import { describe, expect, it } from "vitest";
import { buildCallScorecard, buildCallSuggestion } from "../src/callCopilot";

const env = {
  GROQ_API_KEY: "test-groq-key"
};

describe("callCopilot", () => {
  it("builds a price objection suggestion", async () => {
    const suggestion = await buildCallSuggestion({
      mode: "call_copilot",
      latestUtterance: "that price is too high",
      recentTranscript: [],
      screenContext: [],
      salesContext: {
        companyName: "Clicky Sales Agent",
        repGoal: "move the customer to a clear next step",
        tone: "concise, warm, confident"
      }
    }, env);

    expect(suggestion.objectionType).toBe("price");
    expect(suggestion.sayThis.length).toBeGreaterThan(0);
  });

  it("builds a scorecard from transcript text", async () => {
    const scorecard = await buildCallScorecard({
      recentTranscript: [
        { speaker: "customer", text: "the price is too high", timestampISO: "2026-05-27T03:35:00Z" },
        { speaker: "agent", text: "what budget range works?", timestampISO: "2026-05-27T03:35:10Z" }
      ]
    }, env);

    expect(scorecard.objections).toContain("price");
    expect(scorecard.recommendedFollowUp.length).toBeGreaterThan(0);
  });
});
