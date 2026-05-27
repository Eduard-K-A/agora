import type { CallSuggestionRequest, CallSuggestion } from "./types";

export type RealtimeVoiceSession = {
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  requestSuggestion: (input: CallSuggestionRequest) => Promise<CallSuggestion>;
};

export function createRealtimeVoiceSession(): RealtimeVoiceSession {
  return {
    async connect() {
      // TODO: connect to OpenAI Realtime using a Worker-minted ephemeral key.
    },
    async disconnect() {
      // TODO: tear down the WebRTC session cleanly.
    },
    async requestSuggestion() {
      throw new Error("Realtime voice session is not wired yet.");
    }
  };
}

