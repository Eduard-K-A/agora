import type { CallObjectionType } from "./types";

export type PlaybookEntry = {
  objectionType: CallObjectionType;
  scriptId: string;
  whisper: string;
  sayThis: string;
  nextAction: string;
};

export const salesPlaybook: PlaybookEntry[] = [
  {
    objectionType: "price",
    scriptId: "price-reframe",
    whisper: "Acknowledge the price concern, then reframe around time saved and avoided manual work.",
    sayThis: "Totally fair. Most teams feel that at first, but it usually pays back through time saved and less repetitive work.",
    nextAction: "Ask what budget range would make this easier to approve."
  },
  {
    objectionType: "timing",
    scriptId: "timing-urgency",
    whisper: "Confirm the timing concern, then ask what event would make the timing better.",
    sayThis: "That makes sense. What would need to happen for this to be the right time?",
    nextAction: "Probe for a concrete trigger or deadline."
  },
  {
    objectionType: "competitor",
    scriptId: "competitor-differentiate",
    whisper: "Stay calm, compare on outcomes, not features.",
    sayThis: "That’s helpful context. What matters most in your final decision besides price?",
    nextAction: "Surface the evaluation criteria before positioning the product."
  },
  {
    objectionType: "none",
    scriptId: "next-step",
    whisper: "Keep momentum and move the call to a clear next step.",
    sayThis: "That sounds promising. Would it make sense to map the next step now?",
    nextAction: "Ask for the next concrete action."
  }
];

