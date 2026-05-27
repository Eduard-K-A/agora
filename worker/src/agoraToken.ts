import type { AgoraRTCTokenResponse, AgoraRTMTokenResponse } from "./types";

export function generateChannelName(repId: string): string {
  const suffix = Math.random().toString(36).slice(2, 9);
  return `call-${repId}-${suffix}`;
}

export function createRTCStub(input: {
  appId: string;
  channelName: string;
  uid: number;
}): AgoraRTCTokenResponse {
  return {
    token: "TODO: integrate agora-token builder",
    appId: input.appId,
    channelName: input.channelName,
    uid: input.uid,
    expiresAt: Math.floor(Date.now() / 1000) + 3600
  };
}

export function createRTMStub(input: {
  appId: string;
  uid: string;
}): AgoraRTMTokenResponse {
  return {
    token: "TODO: integrate agora-token builder",
    appId: input.appId,
    uid: input.uid,
    expiresAt: Math.floor(Date.now() / 1000) + 3600
  };
}

