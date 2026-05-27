export type {
  AgoraRTCTokenResponse,
  AgoraRTMTokenResponse,
  CallCustomerType,
  CallObjectionType,
  CallScorecard,
  CallScorecardRequest,
  CallSessionStatus,
  CallSpeaker,
  CallSuggestion,
  CallSuggestionRequest,
  CallAudioAnalysisRequest,
  CallAudioAnalysisResponse,
  CallTranscriptEntry,
  CallCustomerNeedCategory,
  LiveCallAudioSource,
  LiveConversationState,
  RealtimeSessionTokenResponse,
  SalesContext,
  ScreenContextItem
} from "../../shared/contracts";

export type Env = {
  AGORA_APP_ID?: string;
  AGORA_APP_CERTIFICATE?: string;
  AGORA_CUSTOMER_ID?: string;
  AGORA_CUSTOMER_SECRET?: string;
  GROQ_API_KEY?: string;
};

export type TranscriptionResponse = {
  text: string;
};
