export type CallSpeaker = "customer" | "agent" | "unknown";

export type CallObjectionType =
  | "price"
  | "timing"
  | "trust"
  | "competitor"
  | "confusion"
  | "authority"
  | "none";

export type CallTranscriptEntry = {
  speaker: CallSpeaker;
  text: string;
  timestampISO: string;
};

export type ScreenContextItem = {
  label: string;
  summary?: string;
};

export type SalesContext = {
  companyName: string;
  productName: string;
  industry: string;
  prospectName: string;
  dealStage: string;
  repGoal: string;
  targetCloseStep: string;
  knownObjections: string[];
  notes: string;
  tone: string;
};

export type CallSuggestionRequest = {
  mode: "direct_coaching" | "call_copilot";
  latestUtterance: string;
  recentTranscript: CallTranscriptEntry[];
  screenContext: ScreenContextItem[];
  salesContext: SalesContext;
};

export type CallSuggestion = {
  objectionType: CallObjectionType;
  buyingSignal: boolean;
  confidence: number;
  empathyLine: string;
  whisper: string;
  sayThis: string;
  nextQuestion: string;
  nextAction: string;
  closingMove: string;
  reason: string;
};

export type CallScorecardRequest = {
  recentTranscript: CallTranscriptEntry[];
};

export type CallScorecard = {
  summary: string;
  objections: string[];
  buyingSignals: string[];
  scriptsUsed: string[];
  recommendedFollowUp: string;
  repCoaching: string;
};

export type RealtimeSessionTokenResponse = {
  ephemeralKey: string;
  sessionId: string;
  expiresAt: number;
};

export type AgoraRTCTokenResponse = {
  token: string;
  appId: string;
  channelName: string;
  uid: number;
  expiresAt: number;
};

export type AgoraRTMTokenResponse = {
  token: string;
  appId: string;
  uid: string;
  expiresAt: number;
};

export type CallSessionStatus =
  | "idle"
  | "joining"
  | "live"
  | "bot_starting"
  | "bot_live"
  | "ending"
  | "scored";

export type RealtimeVoiceMode = "openai_direct" | "agora_bot";
