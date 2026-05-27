import type {
  CallScorecardRequest,
  CallSuggestionRequest,
  Env
} from "./types";
import { buildCallScorecard, buildCallSuggestion } from "./callCopilot";
import { createRTCStub, createRTMStub, generateChannelName } from "./agoraToken";
import { transcribeAudio } from "./transcribe";

function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type"
    },
    ...init
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "content-type",
          "access-control-allow-methods": "GET, POST, OPTIONS"
        }
      });
    }

    if (request.method === "GET" && url.pathname === "/healthz") {
      return json({ ok: true });
    }

    if (request.method === "POST" && url.pathname === "/call/suggest") {
      const payload = (await request.json()) as CallSuggestionRequest;
      return json(await buildCallSuggestion(payload, env));
    }

    if (request.method === "POST" && url.pathname === "/call/scorecard") {
      const payload = (await request.json()) as CallScorecardRequest;
      return json(await buildCallScorecard(payload, env));
    }

    if (request.method === "POST" && url.pathname === "/transcribe") {
      const formData = await request.formData();
      const file = formData.get("file");
      if (!(file instanceof File)) {
        return json({ error: "file is required" }, { status: 400 });
      }

      return json(await transcribeAudio(file, env));
    }

    if (request.method === "POST" && url.pathname === "/agora/channel") {
      const payload = (await request.json()) as { repId?: string };
      return json({ channelName: generateChannelName(payload.repId ?? "rep") });
    }

    if (request.method === "POST" && url.pathname === "/agora/rtc-token") {
      const payload = (await request.json()) as { channelName?: string; uid?: number };
      if (!env.AGORA_APP_ID || !payload.channelName || typeof payload.uid !== "number") {
        return json({ error: "Missing Agora RTC token inputs" }, { status: 400 });
      }
      return json(createRTCStub({ appId: env.AGORA_APP_ID, channelName: payload.channelName, uid: payload.uid }));
    }

    if (request.method === "POST" && url.pathname === "/agora/rtm-token") {
      const payload = (await request.json()) as { uid?: string };
      if (!env.AGORA_APP_ID || !payload.uid) {
        return json({ error: "Missing Agora RTM token inputs" }, { status: 400 });
      }
      return json(createRTMStub({ appId: env.AGORA_APP_ID, uid: payload.uid }));
    }

    if (request.method === "POST" && url.pathname === "/realtime/session") {
      return json(
        { error: "Realtime voice is not enabled in the Groq demo build." },
        { status: 501 }
      );
    }

    return json({ error: "Not found" }, { status: 404 });
  }
};
