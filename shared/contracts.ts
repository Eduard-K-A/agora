export type CallSpeaker = "customer" | "agent" | "unknown";

export type CallObjectionType =
  | "price"
  | "timing"
  | "trust"
  | "competitor"
  | "confusion"
  | "authority"
  | "none";

export type CallCustomerType =
  | "buyer"
  | "inquirer"
  | "price_sensitive_lead"
  | "comparison_shopper"
  | "needs_approval_lead"
  | "timing_constrained_lead"
  | "support_existing_customer"
  | "not_qualified"
  | "unknown";

export type CallCustomerNeedCategory =
  | "pricing"
  | "timing"
  | "approval"
  | "comparison"
  | "education"
  | "trust"
  | "support"
  | "purchase_ready"
  | "unclear";

export type CallTranscriptEntry = {
  speaker: CallSpeaker;
  text: string;
  timestampISO: string;
};

export type LiveCallAudioSource = "mic" | "system";

export type ScreenContextItem = {
  label: string;
  summary?: string;
};

export type LiveConversationState = {
  summary: string;
  lastCustomerUtterance: string;
  lastCustomerIntent: string;
  lastCustomerNeedCategory: CallCustomerNeedCategory;
  lastCustomerType: CallCustomerType;
  confidence: number;
  lastUpdatedISO: string;
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
  conversationState?: LiveConversationState;
};

export type CallAudioAnalysisRequest = {
  source: LiveCallAudioSource;
  recentTranscript: CallTranscriptEntry[];
  screenContext: ScreenContextItem[];
  salesContext: SalesContext;
  conversationState?: LiveConversationState;
};

export type CallAudioAnalysisResponse = {
  transcriptText: string;
  source: LiveCallAudioSource;
  speaker: CallSpeaker;
  speakerConfidence: number;
  reason: string;
  ignored: boolean;
  transcriptEntry?: CallTranscriptEntry;
  customerNeedCategory?: CallCustomerNeedCategory;
  customerNeedSummary?: string;
  customerTranscriptEntry?: CallTranscriptEntry;
  suggestion?: CallSuggestion;
};

export type CallSuggestion = {
  objectionType: CallObjectionType;
  buyingSignal: boolean;
  confidence: number;
  customerType: CallCustomerType;
  customerTypeConfidence: number;
  customerIntent: string;
  recommendedInfo: string;
  persuasionTip: string;
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

export type SaveCallSummaryRequest = {
  summary: CallScorecard;
  transcript: CallTranscriptEntry[];
  createdAtISO?: string;
};

export type SaveCallSummaryResponse = {
  id: number;
  createdAtISO: string;
  databasePath: string;
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
