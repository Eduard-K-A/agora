export type AgoraVoiceSession = {
  join: () => Promise<void>;
  leave: () => Promise<void>;
};

export function createAgoraVoiceSession(): AgoraVoiceSession {
  return {
    async join() {
      // TODO: join the Agora voice channel with a Worker-minted RTC token.
    },
    async leave() {
      // TODO: leave the Agora voice channel and stop local capture.
    }
  };
}

