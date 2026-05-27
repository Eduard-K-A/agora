import type { CallScorecard, CallSuggestion } from "./types";

export type OverlayState = {
  latestSuggestion: CallSuggestion | null;
  scorecard: CallScorecard | null;
  isCallActive: boolean;
};

export const overlayState: OverlayState = {
  latestSuggestion: null,
  scorecard: null,
  isCallActive: false
};

