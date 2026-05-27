import type { CallSuggestion } from "./types";

export type AgoraSignalingSession = {
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  publishSuggestion: (suggestion: CallSuggestion) => Promise<void>;
};

export function createAgoraSignalingSession(): AgoraSignalingSession {
  return {
    async connect() {
      // TODO: connect to Agora RTM / Signaling.
    },
    async disconnect() {
      // TODO: disconnect from signaling cleanly.
    },
    async publishSuggestion() {
      // TODO: publish whisper payloads to the suggestion channel.
    }
  };
}

