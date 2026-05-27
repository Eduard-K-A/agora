# Clicky Sales Agent — Voice-Enabled Implementation Plan
## Agora Conversational AI + Voice Calling + OpenAI Realtime API

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Clicky Sales Agent Windows Electron shell with production-grade AI voice capabilities using two distinct voice paths: OpenAI Realtime API for direct whisper coaching in the app, and Agora Voice Calling plus Agora Conversational AI for production live-call routing with a silent AI listener. The Cloudflare Worker remains the API boundary for all key management and sales intelligence. The macOS Swift app is out of scope for this plan - all tasks target the `windows-shell` Electron + React codebase.

**Architecture Overview:**
```
[Rep's Microphone / Active Call]
        │
        ▼
[Agora Voice Calling Channel]  ◄──── customer also joins here
        │
        ├──► [Direct Coaching Path]
        │       └──► [OpenAI Realtime API] ───────► [Electron Overlay]
        │                speech-to-speech                renders whisper card
        │
        └──► [Production Call Path]
                ├──► [Agora Conversational AI Bot]
                │       detects intent + objections
                └──► [Agora Signaling] ───────────► [Cloudflare Worker /call/suggest]
                                pushes suggestion payloads   validates + enriches with playbook
                                and syncs overlay state
```

Direct Coaching Mode and Production Call Mode are separate execution paths. Do not chain Agora Conversational AI and OpenAI Realtime in the same live path; choose one voice engine per call session.
Even in Direct Coaching Mode, the Worker still mints the ephemeral Realtime session and owns the sales intelligence endpoints.

**Tech Stack:**
- Electron 37 + React 19 + TypeScript 5 (windows-shell)
- Agora RTC Web SDK (`agora-rtc-sdk-ng`) for Voice Calling
- Agora Conversational AI REST API for bot management
- Agora RTM SDK (`agora-rtm-sdk`) for Signaling and suggestion push
- OpenAI Realtime API via WebRTC with Worker-minted ephemeral keys for direct speech-to-speech coaching
- Cloudflare Worker (TypeScript) for token generation and call intelligence
- AssemblyAI streaming STT as fallback transcription
- Vitest for unit tests
- electron-vite for build tooling

## Phase Roadmap

1. Foundation
   - Configure the Windows Electron build, shared types, and overlay shell.
   - Add the Worker routes and token-generation plumbing.
2. Direct Coaching Mode
   - Implement OpenAI Realtime as the low-latency, in-app whisper path.
   - Keep this path independent from Agora voice routing.
3. Production Call Mode
   - Route calls through Agora Voice Calling.
   - Join a silent AI listener through Agora Conversational AI.
   - Use Agora Signaling for whisper-card and state synchronization.
4. Verification And Hardening
   - Run end-to-end manual verification.
   - Validate token handling, latency, and overlay behavior under load.

---

## Prerequisites and Account Setup

Before writing any code, ensure the following credentials are available:

- Agora account at `console.agora.io` with an active project
- Agora App ID (from project settings, not a key — this is public-safe)
- Agora App Certificate (server-side only, never in Electron renderer)
- Agora Customer ID and Customer Secret (for REST API auth)
- Agora Conversational AI extension enabled on the project
- OpenAI account with Realtime API access enabled
- OpenAI API key
- Cloudflare Worker deployed from the existing plan with `ANTHROPIC_API_KEY`, and now also `AGORA_APP_ID`, `AGORA_APP_CERTIFICATE`, `AGORA_CUSTOMER_ID`, `AGORA_CUSTOMER_SECRET`, `OPENAI_API_KEY` bound as Worker secrets

Store secrets in the Worker via:
```bash
wrangler secret put AGORA_APP_ID
wrangler secret put AGORA_APP_CERTIFICATE
wrangler secret put AGORA_CUSTOMER_ID
wrangler secret put AGORA_CUSTOMER_SECRET
wrangler secret put OPENAI_API_KEY
```

Never put Agora App Certificate, Customer Secret, or OpenAI key in the Electron app or any frontend code.

## API References

Use the official docs below before implementing each integration point:

1. Agora Voice Calling
   - Read the Agora RTC / Voice Calling documentation for channel join, leave, publish, and subscribe flows.
   - Use it to implement `windows-shell/src/agoraVoice.ts` and the Worker RTC token route.
   - Starting point: `console.agora.io` for the project, then the RTC Web SDK docs for Electron/browser clients.
2. Agora Conversational AI
   - Read the Conversational AI developer docs for bot lifecycle, start/stop behavior, and bot configuration.
   - Use it to implement the silent AI listener that joins the live call and produces structured coaching output.
   - The bot should remain a call observer/coaching agent, not a second human-facing participant.
3. Agora Signaling
   - Read the RTM / Signaling docs for presence, channel messages, and low-latency event delivery.
   - Use it to push whisper-card payloads and sync overlay state between the bot, Worker, and desktop app.
   - Keep signaling for state transport only; do not put sales reasoning in the transport layer.
4. OpenAI Realtime API
   - Read the Realtime overview, WebRTC connection guide, VAD guide, transcription guide, and server-controls guide.
   - Use WebRTC for the desktop client path and Worker-minted ephemeral access for session creation.
   - Use this path only for Direct Coaching Mode, not at the same time as the Agora production call path.

## Development Kickoff

Start development in this order:

1. Freeze the request and response contracts in the Worker and `windows-shell/src/types.ts`.
2. Implement Worker secrets and token/session routes for Agora and OpenAI.
3. Build the Electron overlay shell and call session state machine.
4. Implement Direct Coaching Mode with OpenAI Realtime.
5. Implement Production Call Mode with Agora Voice Calling, Conversational AI, and Signaling.
6. Add scorecard generation and end-to-end verification.

---

## Updated File Structure

### New Files To Create

- `windows-shell/src/agoraVoice.ts` — Agora RTC channel lifecycle (join, leave, publish mic, subscribe)
- `windows-shell/src/agoraSignaling.ts` — Agora RTM client for receiving suggestion push from the bot
- `windows-shell/src/realtimeVoice.ts` — OpenAI Realtime API WebRTC client for direct speech-to-speech coaching using ephemeral keys from the Worker
- `windows-shell/src/callSession.ts` — Call session state machine (idle → joining → live → ending → scored)
- `windows-shell/src/micCapture.ts` — Microphone device enumeration and MediaStream management
- `windows-shell/src/overlayStore.ts` — Shared state between main process and renderer via IPC
- `windows-shell/src/overlay.tsx` — Updated React overlay with call controls and whisper card
- `windows-shell/src/types.ts` — Extended with Agora and Realtime API types
- `windows-shell/src/callCopilotClient.ts` — Extended with token fetch and scorecard calls
- `windows-shell/electron.vite.config.ts` — Vite config for main, preload, and renderer
- `windows-shell/src/overlay.html` — HTML entry point for the overlay renderer
- `worker/src/agoraToken.ts` — RTC + RTM token generation using Agora token builder
- `worker/src/conversationalAI.ts` — Agora Conversational AI bot start/stop REST calls
- `worker/src/realtimeSession.ts` — OpenAI Realtime session token endpoint
- `worker/test/agoraToken.test.ts` — Token generation tests

### Files To Modify

- `windows-shell/src/main.ts` — Add IPC handlers for call lifecycle, mic capture, and signaling events
- `windows-shell/src/preload.ts` — Expose call lifecycle and signal events to renderer
- `windows-shell/package.json` — Add Agora SDK dependencies
- `worker/src/index.ts` — Add `/agora/rtc-token`, `/agora/rtm-token`, `/agora/bot/start`, `/agora/bot/stop`, `/realtime/session`
- `worker/package.json` — Add agora token builder dependency

---

## Data Contracts

### Agora RTC Token Request
```json
{
  "channelName": "call-rep-a1b2c3",
  "uid": 1001,
  "role": "publisher"
}
```

### Agora RTC Token Response
```json
{
  "token": "007eJxT...",
  "appId": "abc123",
  "channelName": "call-rep-a1b2c3",
  "uid": 1001,
  "expiresAt": 1748316000
}
```

### Agora Bot Start Request (Worker → Agora REST)
```json
{
  "channelName": "call-rep-a1b2c3",
  "agentUid": 9001,
  "openaiApiKey": "[from env]",
  "systemPrompt": "You are a silent sales coach. Detect objections and buying signals. Output JSON only.",
  "signalingChannel": "suggestions-rep-a1b2c3"
}
```

### OpenAI Realtime Session Token Request
```json
{
  "channelName": "call-rep-a1b2c3",
  "model": "gpt-realtime-2"
}
```

### OpenAI Realtime Session Token Response
```json
{
  "ephemeralKey": "ek_abc123...",
  "sessionId": "sess_xyz",
  "expiresAt": 1748316000
}
```

### Agora Signaling Suggestion Push (bot → RTM channel → Electron)
```json
{
  "type": "call_suggestion",
  "objectionType": "price",
  "buyingSignal": false,
  "confidence": 0.87,
  "whisper": "Acknowledge the concern, then reframe around saved time.",
  "sayThis": "Totally fair. Most teams stay because it saves repeat manual work.",
  "nextAction": "Ask what budget range would make this easier to approve."
}
```

---

## Phase 1: Desktop Foundation

Set up the Windows shell, build pipeline, and shared call contracts before touching live voice integrations.

## Task 1: Configure electron-vite Build System

**Files:**
- Create: `windows-shell/electron.vite.config.ts`
- Create: `windows-shell/src/overlay.html`
- Modify: `windows-shell/package.json`

The existing plan scaffolded a `package.json` but did not add the Vite config or HTML entry points. Without these, the Electron + React overlay renderer cannot build.

- [ ] **Step 1: Install build dependencies**

```bash
cd windows-shell
npm install --save-dev electron-vite vite @vitejs/plugin-react
npm install --save-dev @types/node @types/react @types/react-dom
npm install react react-dom
npm install --save-dev electron
```

Note: `electron` must be in `devDependencies` not `dependencies` when using electron-vite. This is intentional — electron-vite handles the Electron binary separately from your app code bundle.

- [ ] **Step 2: Create electron-vite config**

Create `windows-shell/electron.vite.config.ts`:

```ts
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    root: "src",
    build: {
      rollupOptions: {
        input: {
          overlay: "src/overlay.html"
        }
      }
    },
    plugins: [react()]
  }
});
```

- [ ] **Step 3: Create overlay HTML entry point**

Create `windows-shell/src/overlay.html`:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Clicky Sales Agent</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        background: transparent;
        overflow: hidden;
        font-family: "Segoe UI", system-ui, sans-serif;
        -webkit-app-region: no-drag;
      }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./overlay.tsx"></script>
  </body>
</html>
```

- [ ] **Step 4: Update package.json scripts**

In `windows-shell/package.json`, update the scripts block to:

```json
{
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 5: Verify build**

```bash
cd windows-shell
npm run build
```

Expected: `dist/` folder created with `dist/main/`, `dist/preload/`, `dist/renderer/` containing compiled output. No TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add windows-shell/electron.vite.config.ts windows-shell/src/overlay.html windows-shell/package.json
git commit -m "build: configure electron-vite with react renderer"
```

---

## Task 2: Add Agora SDK Dependencies And Realtime Session Bridge

**Files:**
- Modify: `windows-shell/package.json`
- Modify: `windows-shell/src/types.ts`

- [ ] **Step 1: Install Agora SDKs**

```bash
cd windows-shell
npm install agora-rtc-sdk-ng
npm install agora-rtm-sdk
```

These are runtime dependencies because the Electron renderer process loads them directly in browser context. Agora RTC SDK is designed for browser/Electron renderer use.

- [ ] **Step 2: Extend types.ts with voice and session types**

Replace the contents of `windows-shell/src/types.ts` with:

```ts
// ─── Call Copilot Core Types ───────────────────────────────────────────────

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

export type CallSuggestion = {
  objectionType: CallObjectionType;
  buyingSignal: boolean;
  confidence: number;
  whisper: string;
  sayThis: string;
  nextAction: string;
};

export type CallScorecard = {
  summary: string;
  objections: string[];
  buyingSignals: string[];
  scriptsUsed: string[];
  recommendedFollowUp: string;
  repCoaching: string;
};

// ─── Agora Voice Calling Types ─────────────────────────────────────────────

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

export type CallChannelConfig = {
  channelName: string;
  uid: number;
  rtcToken: string;
  rtmToken: string;
  appId: string;
};

// ─── Call Session State Machine ────────────────────────────────────────────

export type CallSessionStatus =
  | "idle"
  | "joining"
  | "live"
  | "bot_starting"
  | "bot_live"
  | "ending"
  | "scored";

export type CallSessionState = {
  status: CallSessionStatus;
  channelName: string | null;
  uid: number | null;
  transcript: CallTranscriptEntry[];
  latestSuggestion: CallSuggestion | null;
  scorecard: CallScorecard | null;
  errorMessage: string | null;
};

// ─── OpenAI Realtime Types ─────────────────────────────────────────────────

export type RealtimeSessionTokenResponse = {
  clientSecret: { value: string };
  sessionId: string;
};

export type RealtimeVoiceMode = "agora_bot" | "openai_direct" | "none";

// ─── IPC Bridge Types (main ↔ renderer) ────────────────────────────────────

export type IPCCallEvent =
  | { type: "session_status_changed"; status: CallSessionStatus }
  | { type: "suggestion_received"; suggestion: CallSuggestion }
  | { type: "transcript_entry_added"; entry: CallTranscriptEntry }
  | { type: "scorecard_ready"; scorecard: CallScorecard }
  | { type: "error"; message: string };
```

- [ ] **Step 3: Run typecheck**

```bash
cd windows-shell
npm run typecheck
```

Expected: no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add windows-shell/package.json windows-shell/src/types.ts
git commit -m "feat: add agora and openai sdk dependencies with extended types"
```

---

## Task 3: Add Worker Token Generation Routes

**Files:**
- Create: `worker/src/agoraToken.ts`
- Modify: `worker/src/index.ts`
- Test: `worker/test/agoraToken.test.ts`

Agora RTC and RTM tokens must be generated server-side using the App Certificate, which must never leave the Worker. The Electron app calls the Worker to get short-lived tokens before joining a channel.

- [ ] **Step 1: Install Agora token builder in Worker**

```bash
cd worker
npm install agora-token
```

The `agora-token` npm package is the official Agora token builder for Node/edge runtimes. It works in Cloudflare Workers.

- [ ] **Step 2: Create failing token tests**

Create `worker/test/agoraToken.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildRTCToken, buildRTMToken, generateChannelName } from "../src/agoraToken";

describe("agoraToken", () => {
  it("generates a deterministic channel name from a rep ID", () => {
    const name = generateChannelName("rep-123");
    expect(name).toMatch(/^call-rep-123-/);
    expect(name.length).toBeGreaterThan(10);
  });

  it("buildRTCToken returns a non-empty string given valid inputs", () => {
    const token = buildRTCToken({
      appId: "testAppId123",
      appCertificate: "testCert456",
      channelName: "call-test",
      uid: 1001,
      role: "publisher",
      expirationSeconds: 3600
    });
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);
  });

  it("buildRTMToken returns a non-empty string given valid inputs", () => {
    const token = buildRTMToken({
      appId: "testAppId123",
      appCertificate: "testCert456",
      uid: "user-1001",
      expirationSeconds: 3600
    });
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run tests and verify they fail**

```bash
cd worker
npm test
```

Expected: build fails because `agoraToken.ts` does not exist.

- [ ] **Step 4: Implement token builder**

Create `worker/src/agoraToken.ts`:

```ts
import { RtcTokenBuilder, RtcRole, RtmTokenBuilder } from "agora-token";

export type RTCTokenInput = {
  appId: string;
  appCertificate: string;
  channelName: string;
  uid: number;
  role: "publisher" | "subscriber";
  expirationSeconds: number;
};

export type RTMTokenInput = {
  appId: string;
  appCertificate: string;
  uid: string;
  expirationSeconds: number;
};

export function generateChannelName(repId: string): string {
  const suffix = Math.random().toString(36).slice(2, 9);
  return `call-${repId}-${suffix}`;
}

export function buildRTCToken(input: RTCTokenInput): string {
  const privilegeExpireTs = Math.floor(Date.now() / 1000) + input.expirationSeconds;
  const role = input.role === "publisher" ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;

  return RtcTokenBuilder.buildTokenWithUid(
    input.appId,
    input.appCertificate,
    input.channelName,
    input.uid,
    role,
    privilegeExpireTs,
    privilegeExpireTs
  );
}

export function buildRTMToken(input: RTMTokenInput): string {
  const privilegeExpireTs = Math.floor(Date.now() / 1000) + input.expirationSeconds;

  return RtmTokenBuilder.buildToken(
    input.appId,
    input.appCertificate,
    input.uid,
    privilegeExpireTs
  );
}
```

- [ ] **Step 5: Add token routes to Worker index**

In `worker/src/index.ts`, add imports at the top:

```ts
import { buildRTCToken, buildRTMToken, generateChannelName } from "./agoraToken";
```

Add to the Env interface (if using TypeScript Wrangler env typing):

```ts
interface Env {
  ANTHROPIC_API_KEY: string;
  AGORA_APP_ID: string;
  AGORA_APP_CERTIFICATE: string;
  AGORA_CUSTOMER_ID: string;
  AGORA_CUSTOMER_SECRET: string;
  OPENAI_API_KEY: string;
}
```

Add route handlers inside the `fetch` function:

```ts
if (url.pathname === "/agora/rtc-token") {
  return await handleAgoraRTCToken(request, env);
}

if (url.pathname === "/agora/rtm-token") {
  return await handleAgoraRTMToken(request, env);
}

if (url.pathname === "/agora/channel") {
  return await handleCreateChannel(request, env);
}
```

Add handler functions:

```ts
async function handleCreateChannel(request: Request, env: Env): Promise<Response> {
  const payload = await request.json<{ repId?: string }>();
  const repId = payload.repId ?? "rep";
  const channelName = generateChannelName(repId);

  return new Response(JSON.stringify({ channelName }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

async function handleAgoraRTCToken(request: Request, env: Env): Promise<Response> {
  const payload = await request.json<{
    channelName?: string;
    uid?: number;
    role?: "publisher" | "subscriber";
  }>();

  if (!payload.channelName || !payload.uid) {
    return new Response(JSON.stringify({ error: "channelName and uid are required" }), {
      status: 400,
      headers: { "content-type": "application/json" }
    });
  }

  const token = buildRTCToken({
    appId: env.AGORA_APP_ID,
    appCertificate: env.AGORA_APP_CERTIFICATE,
    channelName: payload.channelName,
    uid: payload.uid,
    role: payload.role ?? "publisher",
    expirationSeconds: 3600
  });

  const expiresAt = Math.floor(Date.now() / 1000) + 3600;

  return new Response(JSON.stringify({
    token,
    appId: env.AGORA_APP_ID,
    channelName: payload.channelName,
    uid: payload.uid,
    expiresAt
  }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

async function handleAgoraRTMToken(request: Request, env: Env): Promise<Response> {
  const payload = await request.json<{ uid?: string }>();

  if (!payload.uid) {
    return new Response(JSON.stringify({ error: "uid is required" }), {
      status: 400,
      headers: { "content-type": "application/json" }
    });
  }

  const token = buildRTMToken({
    appId: env.AGORA_APP_ID,
    appCertificate: env.AGORA_APP_CERTIFICATE,
    uid: payload.uid,
    expirationSeconds: 3600
  });

  const expiresAt = Math.floor(Date.now() / 1000) + 3600;

  return new Response(JSON.stringify({
    token,
    appId: env.AGORA_APP_ID,
    uid: payload.uid,
    expiresAt
  }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}
```

- [ ] **Step 6: Run Worker tests**

```bash
cd worker
npm test
```

Expected: all token tests pass.

- [ ] **Step 7: Deploy Worker**

```bash
cd worker
wrangler deploy
```

Expected: Worker deploys with new `/agora/rtc-token`, `/agora/rtm-token`, `/agora/channel` routes live.

- [ ] **Step 8: Commit**

```bash
git add worker/src/agoraToken.ts worker/src/index.ts worker/test/agoraToken.test.ts worker/package.json
git commit -m "feat: add agora token generation worker routes"
```

---

## Task 4: Add Agora Conversational AI Bot Routes to Worker

**Files:**
- Create: `worker/src/conversationalAI.ts`
- Modify: `worker/src/index.ts`
- Test: `worker/test/conversationalAI.test.ts`

The Agora Conversational AI REST API manages a bot that joins the call channel as a silent AI participant. It processes the audio stream, transcribes both speakers, and calls a webhook or signals back with suggestions. The Worker owns the bot lifecycle because the Agora Customer Secret must stay server-side.

- [ ] **Step 1: Create failing bot lifecycle tests**

Create `worker/test/conversationalAI.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { buildBotStartPayload, buildSystemPrompt } from "../src/conversationalAI";

describe("conversationalAI", () => {
  it("builds a valid bot start payload", () => {
    const payload = buildBotStartPayload({
      channelName: "call-rep-a1b2c3",
      agentUid: 9001,
      openaiApiKey: "sk-test",
      signalingUid: "bot-signal-a1b2c3"
    });

    expect(payload.channel).toBe("call-rep-a1b2c3");
    expect(payload.agent.uid).toBe(9001);
    expect(typeof payload.agent.llm.url).toBe("string");
  });

  it("builds a system prompt that includes call copilot instruction", () => {
    const prompt = buildSystemPrompt("call-rep-a1b2c3");
    expect(prompt).toContain("call copilot");
    expect(prompt).toContain("JSON");
    expect(prompt).toContain("objectionType");
  });
});
```

- [ ] **Step 2: Run tests and verify they fail**

```bash
cd worker
npm test
```

Expected: tests fail because `conversationalAI.ts` does not exist.

- [ ] **Step 3: Implement bot lifecycle helpers**

Create `worker/src/conversationalAI.ts`:

```ts
// Agora Conversational AI REST API integration.
// Reference: https://docs.agora.io/en/conversational-ai/get-started/quickstart

export type BotStartInput = {
  channelName: string;
  agentUid: number;
  openaiApiKey: string;
  signalingUid: string;
};

export type BotStartPayload = {
  channel: string;
  agent: {
    uid: number;
    asr: { language: string };
    llm: {
      url: string;
      api_key: string;
      system_messages: Array<{ role: string; content: string }>;
      greeting_message: string;
      failure_message: string;
      max_history: number;
    };
    tts: {
      vendor: string;
      params: { model: string; encoding: string; sample_rate: number; speed: number; volume: number };
    };
    vad: { silence_duration_ms: number; speech_duration_ms: number; threshold: number };
  };
  advanced: { subscribe_audio: boolean };
};

export function buildSystemPrompt(channelName: string): string {
  return `You are Clicky Sales Agent in call copilot mode on channel ${channelName}.

You are a silent AI sales coach listening to a live sales call between a rep and a customer.

Your job:
- Detect the customer's intent, objections, price sensitivity, competitor mentions, confusion, and buying signals
- When you detect something actionable, immediately respond with a JSON object only — no text before or after
- Keep suggestions concise, ethical, and practical for the rep to use immediately
- Never invent product facts, pricing promises, or guarantees

Always respond with this exact JSON structure:
{
  "type": "call_suggestion",
  "objectionType": "price | timing | trust | competitor | confusion | authority | none",
  "buyingSignal": true | false,
  "confidence": 0.0 to 1.0,
  "whisper": "brief internal coaching note for the rep",
  "sayThis": "exact words the rep can say right now",
  "nextAction": "what the rep should do next"
}

Do not respond to the customer directly. Do not speak. Only output JSON when you detect something.`;
}

export function buildBotStartPayload(input: BotStartInput): BotStartPayload {
  return {
    channel: input.channelName,
    agent: {
      uid: input.agentUid,
      asr: {
        language: "en-US"
      },
      llm: {
        url: "https://api.openai.com/v1/chat/completions",
        api_key: input.openaiApiKey,
        system_messages: [
          {
            role: "system",
            content: buildSystemPrompt(input.channelName)
          }
        ],
        greeting_message: "",
        failure_message: "",
        max_history: 20
      },
      tts: {
        vendor: "microsoft",
        params: {
          model: "en-US-AndrewMultilingualNeural",
          encoding: "audio/opus",
          sample_rate: 16000,
          speed: 1.0,
          volume: 0
        }
      },
      vad: {
        silence_duration_ms: 480,
        speech_duration_ms: 80,
        threshold: 0.5
      }
    },
    advanced: {
      subscribe_audio: true
    }
  };
}

export async function startConversationalBot(input: {
  appId: string;
  customerId: string;
  customerSecret: string;
  channelName: string;
  agentUid: number;
  openaiApiKey: string;
  signalingUid: string;
}): Promise<{ agentId: string }> {
  const credentials = btoa(`${input.customerId}:${input.customerSecret}`);
  const payload = buildBotStartPayload({
    channelName: input.channelName,
    agentUid: input.agentUid,
    openaiApiKey: input.openaiApiKey,
    signalingUid: input.signalingUid
  });

  const response = await fetch(
    `https://api.agora.io/api/conversational-ai/v1/projects/${input.appId}/agents`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${credentials}`
      },
      body: JSON.stringify(payload)
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Agora bot start failed (${response.status}): ${errorBody}`);
  }

  const data = await response.json<{ agent_id: string }>();
  return { agentId: data.agent_id };
}

export async function stopConversationalBot(input: {
  appId: string;
  customerId: string;
  customerSecret: string;
  agentId: string;
}): Promise<void> {
  const credentials = btoa(`${input.customerId}:${input.customerSecret}`);

  const response = await fetch(
    `https://api.agora.io/api/conversational-ai/v1/projects/${input.appId}/agents/${input.agentId}/stop`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`
      }
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Agora bot stop failed (${response.status}): ${errorBody}`);
  }
}
```

- [ ] **Step 4: Add bot routes to Worker index**

In `worker/src/index.ts`, import:

```ts
import { startConversationalBot, stopConversationalBot } from "./conversationalAI";
```

Add routes:

```ts
if (url.pathname === "/agora/bot/start") {
  return await handleBotStart(request, env);
}

if (url.pathname === "/agora/bot/stop") {
  return await handleBotStop(request, env);
}
```

Add handlers:

```ts
async function handleBotStart(request: Request, env: Env): Promise<Response> {
  const payload = await request.json<{
    channelName?: string;
    agentUid?: number;
    signalingUid?: string;
  }>();

  if (!payload.channelName || !payload.agentUid) {
    return new Response(JSON.stringify({ error: "channelName and agentUid are required" }), {
      status: 400,
      headers: { "content-type": "application/json" }
    });
  }

  const result = await startConversationalBot({
    appId: env.AGORA_APP_ID,
    customerId: env.AGORA_CUSTOMER_ID,
    customerSecret: env.AGORA_CUSTOMER_SECRET,
    channelName: payload.channelName,
    agentUid: payload.agentUid,
    openaiApiKey: env.OPENAI_API_KEY,
    signalingUid: payload.signalingUid ?? `bot-signal-${payload.channelName}`
  });

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

async function handleBotStop(request: Request, env: Env): Promise<Response> {
  const payload = await request.json<{ agentId?: string }>();

  if (!payload.agentId) {
    return new Response(JSON.stringify({ error: "agentId is required" }), {
      status: 400,
      headers: { "content-type": "application/json" }
    });
  }

  await stopConversationalBot({
    appId: env.AGORA_APP_ID,
    customerId: env.AGORA_CUSTOMER_ID,
    customerSecret: env.AGORA_CUSTOMER_SECRET,
    agentId: payload.agentId
  });

  return new Response(JSON.stringify({ stopped: true }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}
```

- [ ] **Step 5: Run Worker tests**

```bash
cd worker
npm test
```

Expected: all bot lifecycle tests pass.

- [ ] **Step 6: Deploy Worker**

```bash
cd worker
wrangler deploy
```

- [ ] **Step 7: Commit**

```bash
git add worker/src/conversationalAI.ts worker/src/index.ts worker/test/conversationalAI.test.ts
git commit -m "feat: add conversational AI bot lifecycle worker routes"
```

---

## Task 5: Add OpenAI Realtime Session Route to Worker

**Files:**
- Create: `worker/src/realtimeSession.ts`
- Modify: `worker/src/index.ts`
- Test: `worker/test/realtimeSession.test.ts`

The OpenAI Realtime API requires a short-lived ephemeral client secret for browser/Electron clients to connect directly via WebSocket. This secret is obtained server-side with the permanent OpenAI API key and has a 1-minute expiry. The Worker mints it on demand.

- [ ] **Step 1: Create failing Realtime session tests**

Create `worker/test/realtimeSession.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { buildRealtimeSessionRequest } from "../src/realtimeSession";

describe("realtimeSession", () => {
  it("builds a valid realtime session request body", () => {
    const body = buildRealtimeSessionRequest({
      model: "gpt-4o-realtime-preview",
      systemPrompt: "You are a call coach.",
      voice: "alloy"
    });

    expect(body.model).toBe("gpt-4o-realtime-preview");
    expect(body.voice).toBe("alloy");
    expect(body.instructions).toContain("call coach");
    expect(body.modalities).toContain("text");
    expect(body.modalities).toContain("audio");
  });
});
```

- [ ] **Step 2: Run tests and verify they fail**

```bash
cd worker
npm test
```

Expected: tests fail because `realtimeSession.ts` does not exist.

- [ ] **Step 3: Implement Realtime session helpers**

Create `worker/src/realtimeSession.ts`:

```ts
export type RealtimeSessionBody = {
  model: string;
  voice: string;
  instructions: string;
  modalities: string[];
  input_audio_transcription: { model: string };
  turn_detection: {
    type: string;
    threshold: number;
    prefix_padding_ms: number;
    silence_duration_ms: number;
  };
};

export function buildRealtimeSessionRequest(input: {
  model: string;
  systemPrompt: string;
  voice: string;
}): RealtimeSessionBody {
  return {
    model: input.model,
    voice: input.voice,
    instructions: input.systemPrompt,
    modalities: ["text", "audio"],
    input_audio_transcription: {
      model: "whisper-1"
    },
    turn_detection: {
      type: "server_vad",
      threshold: 0.5,
      prefix_padding_ms: 300,
      silence_duration_ms: 500
    }
  };
}

export async function createRealtimeSession(input: {
  openaiApiKey: string;
  model: string;
  systemPrompt: string;
  voice?: string;
}): Promise<{ clientSecret: { value: string }; sessionId: string }> {
  const body = buildRealtimeSessionRequest({
    model: input.model,
    systemPrompt: input.systemPrompt,
    voice: input.voice ?? "alloy"
  });

  const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.openaiApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI Realtime session creation failed (${response.status}): ${errorBody}`);
  }

  const data = await response.json<{
    client_secret: { value: string };
    id: string;
  }>();

  return {
    clientSecret: { value: data.client_secret.value },
    sessionId: data.id
  };
}
```

- [ ] **Step 4: Add Realtime session route to Worker index**

In `worker/src/index.ts`, import:

```ts
import { createRealtimeSession } from "./realtimeSession";
```

Add route:

```ts
if (url.pathname === "/realtime/session") {
  return await handleRealtimeSession(request, env);
}
```

Add handler:

```ts
async function handleRealtimeSession(request: Request, env: Env): Promise<Response> {
  const systemPrompt = `You are Clicky Sales Agent in Call Copilot mode.
You are a silent coach listening to a live sales call.
When you detect a customer objection, buying signal, or critical moment:
Output a JSON object with keys: type, objectionType, buyingSignal, confidence, whisper, sayThis, nextAction.
type must always be "call_suggestion".
Do not speak to the customer. Output JSON only when you detect something actionable.`;

  const session = await createRealtimeSession({
    openaiApiKey: env.OPENAI_API_KEY,
    model: "gpt-4o-realtime-preview",
    systemPrompt
  });

  return new Response(JSON.stringify(session), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}
```

- [ ] **Step 5: Run Worker tests and deploy**

```bash
cd worker
npm test
wrangler deploy
```

Expected: all tests pass and Worker deploys with `/realtime/session` route live.

- [ ] **Step 6: Commit**

```bash
git add worker/src/realtimeSession.ts worker/src/index.ts worker/test/realtimeSession.test.ts
git commit -m "feat: add openai realtime session token worker route"
```

---

## Task 6: Implement Agora Voice Calling in Electron Renderer

**Files:**
- Create: `windows-shell/src/agoraVoice.ts`
- Create: `windows-shell/src/micCapture.ts`
- Test: `windows-shell/src/agoraVoice.test.ts`

This module manages the RTC channel lifecycle inside the Electron renderer process. The renderer has access to browser APIs, so Agora RTC SDK works natively here exactly as it does in a web app.

- [ ] **Step 1: Create failing voice client tests**

Create `windows-shell/src/agoraVoice.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { buildJoinConfig } from "./agoraVoice";

describe("agoraVoice", () => {
  it("builds a valid join config from token response", () => {
    const config = buildJoinConfig({
      appId: "testApp123",
      channelName: "call-rep-abc",
      uid: 1001,
      token: "007eJxT..."
    });

    expect(config.appId).toBe("testApp123");
    expect(config.channel).toBe("call-rep-abc");
    expect(config.uid).toBe(1001);
    expect(config.token).toBe("007eJxT...");
  });
});
```

- [ ] **Step 2: Run tests and verify they fail**

```bash
cd windows-shell
npm test
```

Expected: tests fail because `agoraVoice.ts` does not exist.

- [ ] **Step 3: Implement Agora voice module**

Create `windows-shell/src/agoraVoice.ts`:

```ts
import AgoraRTC, {
  type IAgoraRTCClient,
  type IMicrophoneAudioTrack
} from "agora-rtc-sdk-ng";
import type { AgoraRTCTokenResponse } from "./types";

// Configure Agora SDK for Electron (disable log in production)
AgoraRTC.setLogLevel(process.env.NODE_ENV === "development" ? 0 : 4);

export type AgoraJoinConfig = {
  appId: string;
  channel: string;
  uid: number;
  token: string;
};

export function buildJoinConfig(input: AgoraRTCTokenResponse): AgoraJoinConfig {
  return {
    appId: input.appId,
    channel: input.channelName,
    uid: input.uid,
    token: input.token
  };
}

export class AgoraVoiceClient {
  private client: IAgoraRTCClient;
  private micTrack: IMicrophoneAudioTrack | null = null;
  private channelName: string | null = null;

  constructor() {
    this.client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
    this.setupEventListeners();
  }

  private setupEventListeners() {
    this.client.on("user-joined", (user) => {
      console.log("[Agora] Remote user joined:", user.uid);
    });

    this.client.on("user-left", (user) => {
      console.log("[Agora] Remote user left:", user.uid);
    });

    this.client.on("connection-state-change", (current, prev) => {
      console.log(`[Agora] Connection state: ${prev} → ${current}`);
    });
  }

  async join(config: AgoraJoinConfig): Promise<void> {
    if (this.client.connectionState !== "DISCONNECTED") {
      throw new Error("AgoraVoiceClient is already joined or joining.");
    }

    await this.client.join(config.appId, config.channel, config.token, config.uid);
    this.channelName = config.channel;

    this.micTrack = await AgoraRTC.createMicrophoneAudioTrack({
      encoderConfig: "speech_standard",
      AEC: true,
      ANS: true,
      AGC: true
    });

    await this.client.publish([this.micTrack]);
    console.log("[Agora] Joined channel and published mic:", config.channel);
  }

  async leave(): Promise<void> {
    if (this.micTrack) {
      this.micTrack.stop();
      this.micTrack.close();
      this.micTrack = null;
    }

    await this.client.leave();
    this.channelName = null;
    console.log("[Agora] Left channel.");
  }

  muteMic(): void {
    this.micTrack?.setEnabled(false);
  }

  unmuteMic(): void {
    this.micTrack?.setEnabled(true);
  }

  get currentChannel(): string | null {
    return this.channelName;
  }

  get connectionState(): string {
    return this.client.connectionState;
  }
}
```

- [ ] **Step 4: Implement mic capture utility**

Create `windows-shell/src/micCapture.ts`:

```ts
export type MicDevice = {
  deviceId: string;
  label: string;
};

export async function enumerateMicrophoneDevices(): Promise<MicDevice[]> {
  try {
    // Request permission first — required before enumerateDevices returns labels
    await navigator.mediaDevices.getUserMedia({ audio: true });
    const devices = await navigator.mediaDevices.enumerateDevices();

    return devices
      .filter((d) => d.kind === "audioinput")
      .map((d) => ({
        deviceId: d.deviceId,
        label: d.label || `Microphone ${d.deviceId.slice(0, 6)}`
      }));
  } catch (error) {
    console.error("[micCapture] Failed to enumerate microphones:", error);
    return [];
  }
}

export async function requestMicrophonePermission(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 5: Run tests**

```bash
cd windows-shell
npm test
```

Expected: `buildJoinConfig` test passes. Note: full RTC client tests require mocking the Agora SDK — add those as integration tests in a separate pass.

- [ ] **Step 6: Commit**

```bash
git add windows-shell/src/agoraVoice.ts windows-shell/src/micCapture.ts windows-shell/src/agoraVoice.test.ts
git commit -m "feat: implement agora voice calling client"
```

---

## Task 7: Implement Agora Signaling for Real-Time Suggestion Push

**Files:**
- Create: `windows-shell/src/agoraSignaling.ts`
- Test: `windows-shell/src/agoraSignaling.test.ts`

The Conversational AI bot outputs JSON to the Agora RTM (Signaling) channel. The Electron app subscribes to that RTM channel and parses incoming messages as `CallSuggestion` payloads. This is what drives the real-time whisper overlay.

- [ ] **Step 1: Create failing signaling tests**

Create `windows-shell/src/agoraSignaling.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseSignalingMessage } from "./agoraSignaling";

describe("parseSignalingMessage", () => {
  it("parses a valid call suggestion message", () => {
    const raw = JSON.stringify({
      type: "call_suggestion",
      objectionType: "price",
      buyingSignal: false,
      confidence: 0.87,
      whisper: "Reframe around saved time.",
      sayThis: "Totally fair. Most teams stay because it cuts repeat work.",
      nextAction: "Ask about budget range."
    });

    const suggestion = parseSignalingMessage(raw);
    expect(suggestion).not.toBeNull();
    expect(suggestion!.objectionType).toBe("price");
    expect(suggestion!.confidence).toBe(0.87);
  });

  it("returns null for non-suggestion messages", () => {
    const result = parseSignalingMessage(JSON.stringify({ type: "heartbeat" }));
    expect(result).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    const result = parseSignalingMessage("not json at all");
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests and verify they fail**

```bash
cd windows-shell
npm test
```

- [ ] **Step 3: Implement Agora Signaling module**

Create `windows-shell/src/agoraSignaling.ts`:

```ts
import AgoraRTM from "agora-rtm-sdk";
import type { CallSuggestion } from "./types";

export function parseSignalingMessage(raw: string): CallSuggestion | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.type !== "call_suggestion") return null;

    const allowedObjectionTypes = new Set([
      "price", "timing", "trust", "competitor", "confusion", "authority", "none"
    ]);

    if (!allowedObjectionTypes.has(parsed.objectionType)) return null;

    return {
      objectionType: parsed.objectionType,
      buyingSignal: typeof parsed.buyingSignal === "boolean" ? parsed.buyingSignal : false,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
      whisper: typeof parsed.whisper === "string" ? parsed.whisper : "",
      sayThis: typeof parsed.sayThis === "string" ? parsed.sayThis : "",
      nextAction: typeof parsed.nextAction === "string" ? parsed.nextAction : ""
    };
  } catch {
    return null;
  }
}

export type SignalingEventHandler = {
  onSuggestion: (suggestion: CallSuggestion) => void;
  onError: (error: Error) => void;
};

export class AgoraSignalingClient {
  private client: ReturnType<typeof AgoraRTM.createInstance> | null = null;
  private channel: ReturnType<
    ReturnType<typeof AgoraRTM.createInstance>["createChannel"]
  > | null = null;
  private handlers: SignalingEventHandler;

  constructor(handlers: SignalingEventHandler) {
    this.handlers = handlers;
  }

  async connect(input: {
    appId: string;
    uid: string;
    rtmToken: string;
    channelName: string;
  }): Promise<void> {
    this.client = AgoraRTM.createInstance(input.appId);

    await this.client.login({ uid: input.uid, token: input.rtmToken });

    this.channel = this.client.createChannel(input.channelName);

    this.channel.on("ChannelMessage", ({ text }) => {
      if (typeof text !== "string") return;

      const suggestion = parseSignalingMessage(text);
      if (suggestion) {
        this.handlers.onSuggestion(suggestion);
      }
    });

    await this.channel.join();
    console.log("[Signaling] Joined RTM channel:", input.channelName);
  }

  async disconnect(): Promise<void> {
    await this.channel?.leave();
    await this.client?.logout();
    this.channel = null;
    this.client = null;
    console.log("[Signaling] Disconnected from RTM.");
  }
}
```

- [ ] **Step 4: Run tests**

```bash
cd windows-shell
npm test
```

Expected: all signaling tests pass.

- [ ] **Step 5: Commit**

```bash
git add windows-shell/src/agoraSignaling.ts windows-shell/src/agoraSignaling.test.ts
git commit -m "feat: implement agora rtm signaling for suggestion push"
```

---

## Task 8: Implement OpenAI Realtime API Direct Voice Mode

**Files:**
- Create: `windows-shell/src/realtimeVoice.ts`
- Test: `windows-shell/src/realtimeVoice.test.ts`

This is the fallback and lower-latency alternative to the Agora bot path. The Electron renderer opens a WebSocket directly to the OpenAI Realtime API using the ephemeral token minted by the Worker. The local microphone audio is streamed to OpenAI, which transcribes and processes it. Suggestion JSON responses come back over the WebSocket and are parsed into `CallSuggestion` objects.

Use this mode when: (a) the rep is not routing the call through Agora, (b) you want lowest possible suggestion latency, or (c) during demos without a live Agora channel.

- [ ] **Step 1: Create failing Realtime voice tests**

Create `windows-shell/src/realtimeVoice.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseRealtimeServerEvent } from "./realtimeVoice";

describe("parseRealtimeServerEvent", () => {
  it("extracts a call suggestion from a response.done event", () => {
    const event = {
      type: "response.done",
      response: {
        output: [
          {
            type: "message",
            role: "assistant",
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  type: "call_suggestion",
                  objectionType: "price",
                  buyingSignal: false,
                  confidence: 0.9,
                  whisper: "Reframe around value.",
                  sayThis: "Totally fair. Let me explain the ROI.",
                  nextAction: "Ask about budget."
                })
              }
            ]
          }
        ]
      }
    };

    const suggestion = parseRealtimeServerEvent(event);
    expect(suggestion).not.toBeNull();
    expect(suggestion!.objectionType).toBe("price");
  });

  it("returns null for non-suggestion response events", () => {
    const event = {
      type: "response.done",
      response: {
        output: [
          {
            type: "message",
            role: "assistant",
            content: [{ type: "text", text: "Just a regular reply." }]
          }
        ]
      }
    };

    expect(parseRealtimeServerEvent(event)).toBeNull();
  });

  it("returns null for non-response events", () => {
    expect(parseRealtimeServerEvent({ type: "session.created" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests and verify they fail**

```bash
cd windows-shell
npm test
```

- [ ] **Step 3: Implement Realtime voice client**

Create `windows-shell/src/realtimeVoice.ts`:

```ts
import type { CallSuggestion } from "./types";

// Parses OpenAI Realtime API server events to extract call suggestion JSON
// when the model outputs a JSON object starting with `type: "call_suggestion"`.
export function parseRealtimeServerEvent(event: unknown): CallSuggestion | null {
  try {
    const e = event as Record<string, unknown>;
    if (e.type !== "response.done") return null;

    const response = e.response as Record<string, unknown>;
    const output = response?.output as unknown[];
    if (!Array.isArray(output)) return null;

    for (const item of output) {
      const msg = item as Record<string, unknown>;
      if (msg.type !== "message") continue;

      const content = msg.content as unknown[];
      if (!Array.isArray(content)) continue;

      for (const block of content) {
        const b = block as Record<string, unknown>;
        if (b.type !== "text" || typeof b.text !== "string") continue;

        try {
          const parsed = JSON.parse(b.text);
          if (parsed?.type === "call_suggestion") {
            return {
              objectionType: parsed.objectionType ?? "none",
              buyingSignal: parsed.buyingSignal ?? false,
              confidence: parsed.confidence ?? 0.5,
              whisper: parsed.whisper ?? "",
              sayThis: parsed.sayThis ?? "",
              nextAction: parsed.nextAction ?? ""
            };
          }
        } catch {
          // text block was not JSON — skip
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

export type RealtimeVoiceEventHandler = {
  onSuggestion: (suggestion: CallSuggestion) => void;
  onTranscript: (text: string, role: "user" | "assistant") => void;
  onError: (error: Error) => void;
  onConnected: () => void;
  onDisconnected: () => void;
};

export class RealtimeVoiceClient {
  private ws: WebSocket | null = null;
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private handlers: RealtimeVoiceEventHandler;

  constructor(handlers: RealtimeVoiceEventHandler) {
    this.handlers = handlers;
  }

  // Connect using an ephemeral token minted by the Worker /realtime/session endpoint.
  // The ephemeral token expires in 60 seconds; connection must be established immediately.
  async connect(ephemeralToken: string): Promise<void> {
    const url = `wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview`;

    this.ws = new WebSocket(url, [
      "realtime",
      `openai-insecure-api-key.${ephemeralToken}`,
      "openai-beta.realtime-v1"
    ]);

    this.ws.addEventListener("open", () => {
      this.handlers.onConnected();
      this.sendSessionUpdate();
      this.startMicCapture();
    });

    this.ws.addEventListener("message", (event) => {
      try {
        const data = JSON.parse(event.data as string);
        this.handleServerEvent(data);
      } catch (error) {
        this.handlers.onError(new Error(`Failed to parse Realtime event: ${error}`));
      }
    });

    this.ws.addEventListener("close", () => {
      this.handlers.onDisconnected();
      this.stopMicCapture();
    });

    this.ws.addEventListener("error", (event) => {
      this.handlers.onError(new Error(`WebSocket error: ${JSON.stringify(event)}`));
    });
  }

  private sendSessionUpdate(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    this.ws.send(JSON.stringify({
      type: "session.update",
      session: {
        modalities: ["text", "audio"],
        input_audio_format: "pcm16",
        output_audio_format: "pcm16",
        input_audio_transcription: { model: "whisper-1" },
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500
        }
      }
    }));
  }

  private handleServerEvent(data: Record<string, unknown>): void {
    switch (data.type) {
      case "response.done": {
        const suggestion = parseRealtimeServerEvent(data);
        if (suggestion) {
          this.handlers.onSuggestion(suggestion);
        }
        break;
      }

      case "conversation.item.input_audio_transcription.completed": {
        const transcript = data.transcript as string;
        if (transcript) {
          this.handlers.onTranscript(transcript, "user");
        }
        break;
      }

      case "error": {
        const errData = data.error as Record<string, unknown>;
        this.handlers.onError(new Error(String(errData?.message ?? "Unknown Realtime error")));
        break;
      }
    }
  }

  private async startMicCapture(): Promise<void> {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 24000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        }
      });

      this.audioContext = new AudioContext({ sampleRate: 24000 });
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);

      // ScriptProcessorNode converts MediaStream to PCM16 buffers for Realtime API
      this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);
      this.scriptProcessor.onaudioprocess = (event) => {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        const inputData = event.inputBuffer.getChannelData(0);
        const pcm16 = this.convertFloat32ToPCM16(inputData);
        const base64 = this.arrayBufferToBase64(pcm16.buffer);

        this.ws.send(JSON.stringify({
          type: "input_audio_buffer.append",
          audio: base64
        }));
      };

      source.connect(this.scriptProcessor);
      this.scriptProcessor.connect(this.audioContext.destination);
    } catch (error) {
      this.handlers.onError(new Error(`Microphone capture failed: ${error}`));
    }
  }

  private stopMicCapture(): void {
    this.scriptProcessor?.disconnect();
    this.audioContext?.close();
    this.mediaStream?.getTracks().forEach((t) => t.stop());
    this.scriptProcessor = null;
    this.audioContext = null;
    this.mediaStream = null;
  }

  private convertFloat32ToPCM16(float32Array: Float32Array): Int16Array {
    const pcm16 = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const clamped = Math.max(-1, Math.min(1, float32Array[i]));
      pcm16[i] = clamped < 0 ? clamped * 32768 : clamped * 32767;
    }
    return pcm16;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary);
  }

  async disconnect(): Promise<void> {
    this.stopMicCapture();
    this.ws?.close();
    this.ws = null;
  }
}
```

- [ ] **Step 4: Run tests**

```bash
cd windows-shell
npm test
```

Expected: all Realtime event parsing tests pass.

- [ ] **Step 5: Commit**

```bash
git add windows-shell/src/realtimeVoice.ts windows-shell/src/realtimeVoice.test.ts
git commit -m "feat: implement openai realtime voice client"
```

---

## Task 9: Implement Call Session State Machine

**Files:**
- Create: `windows-shell/src/callSession.ts`
- Test: `windows-shell/src/callSession.test.ts`

The call session module coordinates the Agora voice client, the signaling client, and the Realtime voice client under a single state machine. The Electron renderer imports this and drives the overlay UI from its published state.

- [ ] **Step 1: Create failing session state machine tests**

Create `windows-shell/src/callSession.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { CallSessionManager } from "./callSession";

describe("CallSessionManager", () => {
  it("starts in idle state", () => {
    const manager = new CallSessionManager({
      workerBaseUrl: "https://example.workers.dev",
      onStateChange: vi.fn(),
      onSuggestion: vi.fn(),
      onTranscriptEntry: vi.fn(),
      onError: vi.fn()
    });

    expect(manager.state.status).toBe("idle");
    expect(manager.state.channelName).toBeNull();
    expect(manager.state.transcript).toHaveLength(0);
  });

  it("transitions to error state when start is called without worker URL", async () => {
    const onError = vi.fn();
    const manager = new CallSessionManager({
      workerBaseUrl: "",
      onStateChange: vi.fn(),
      onSuggestion: vi.fn(),
      onTranscriptEntry: vi.fn(),
      onError
    });

    // Empty worker URL should cause validation error
    await manager.startCall({ repId: "rep-123", voiceMode: "openai_direct" })
      .catch(() => {});

    expect(onError).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests and verify they fail**

```bash
cd windows-shell
npm test
```

- [ ] **Step 3: Implement call session manager**

Create `windows-shell/src/callSession.ts`:

```ts
import { AgoraVoiceClient } from "./agoraVoice";
import { AgoraSignalingClient } from "./agoraSignaling";
import { RealtimeVoiceClient } from "./realtimeVoice";
import type {
  CallSessionState,
  CallSessionStatus,
  CallSuggestion,
  CallTranscriptEntry,
  RealtimeVoiceMode
} from "./types";

export type CallSessionManagerConfig = {
  workerBaseUrl: string;
  onStateChange: (state: CallSessionState) => void;
  onSuggestion: (suggestion: CallSuggestion) => void;
  onTranscriptEntry: (entry: CallTranscriptEntry) => void;
  onError: (error: Error) => void;
};

export class CallSessionManager {
  private _state: CallSessionState = {
    status: "idle",
    channelName: null,
    uid: null,
    transcript: [],
    latestSuggestion: null,
    scorecard: null,
    errorMessage: null
  };

  private agoraVoice: AgoraVoiceClient | null = null;
  private agoraSignaling: AgoraSignalingClient | null = null;
  private realtimeVoice: RealtimeVoiceClient | null = null;
  private activeAgentId: string | null = null;
  private config: CallSessionManagerConfig;

  constructor(config: CallSessionManagerConfig) {
    this.config = config;
  }

  get state(): CallSessionState {
    return this._state;
  }

  private setState(patch: Partial<CallSessionState>): void {
    this._state = { ...this._state, ...patch };
    this.config.onStateChange(this._state);
  }

  private setStatus(status: CallSessionStatus): void {
    this.setState({ status });
  }

  async startCall(input: { repId: string; voiceMode: RealtimeVoiceMode }): Promise<void> {
    if (!this.config.workerBaseUrl) {
      const error = new Error("Worker base URL is not configured.");
      this.config.onError(error);
      this.setState({ status: "idle", errorMessage: error.message });
      throw error;
    }

    this.setStatus("joining");

    try {
      // 1. Create a channel name
      const channelResponse = await fetch(`${this.config.workerBaseUrl}/agora/channel`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ repId: input.repId })
      });
      const { channelName } = await channelResponse.json<{ channelName: string }>();
      const uid = Math.floor(Math.random() * 100000) + 1000;

      this.setState({ channelName, uid });

      if (input.voiceMode === "agora_bot") {
        await this.startAgoraMode(channelName, uid);
      } else if (input.voiceMode === "openai_direct") {
        await this.startRealtimeMode(channelName, uid);
      }

      this.setStatus("live");
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.config.onError(err);
      this.setState({ status: "idle", errorMessage: err.message });
    }
  }

  private async startAgoraMode(channelName: string, uid: number): Promise<void> {
    // Get RTC token for the rep's mic
    const rtcResponse = await fetch(`${this.config.workerBaseUrl}/agora/rtc-token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ channelName, uid, role: "publisher" })
    });
    const rtcTokenData = await rtcResponse.json<{
      token: string; appId: string; channelName: string; uid: number;
    }>();

    // Get RTM token for signaling channel subscription
    const rtmUid = `rep-${uid}`;
    const rtmResponse = await fetch(`${this.config.workerBaseUrl}/agora/rtm-token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ uid: rtmUid })
    });
    const rtmTokenData = await rtmResponse.json<{ token: string; appId: string }>();

    // Join RTC channel with mic
    this.agoraVoice = new AgoraVoiceClient();
    await this.agoraVoice.join({
      appId: rtcTokenData.appId,
      channel: rtcTokenData.channelName,
      uid: rtcTokenData.uid,
      token: rtcTokenData.token
    });

    // Subscribe to RTM signaling channel for bot suggestions
    this.agoraSignaling = new AgoraSignalingClient({
      onSuggestion: (suggestion) => {
        this.setState({ latestSuggestion: suggestion });
        this.config.onSuggestion(suggestion);
      },
      onError: this.config.onError
    });

    await this.agoraSignaling.connect({
      appId: rtmTokenData.appId,
      uid: rtmUid,
      rtmToken: rtmTokenData.token,
      channelName: `suggestions-${channelName}`
    });

    // Start the AI bot
    this.setStatus("bot_starting");
    const agentUid = 9001;
    const botResponse = await fetch(`${this.config.workerBaseUrl}/agora/bot/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        channelName,
        agentUid,
        signalingUid: `bot-signal-${channelName}`
      })
    });
    const { agentId } = await botResponse.json<{ agentId: string }>();
    this.activeAgentId = agentId;
    this.setStatus("bot_live");
  }

  private async startRealtimeMode(channelName: string, uid: number): Promise<void> {
    // Get ephemeral token from Worker
    const sessionResponse = await fetch(`${this.config.workerBaseUrl}/realtime/session`, {
      method: "POST",
      headers: { "content-type": "application/json" }
    });
    const sessionData = await sessionResponse.json<{
      clientSecret: { value: string }; sessionId: string;
    }>();

    this.realtimeVoice = new RealtimeVoiceClient({
      onSuggestion: (suggestion) => {
        this.setState({ latestSuggestion: suggestion });
        this.config.onSuggestion(suggestion);
      },
      onTranscript: (text, role) => {
        const entry: CallTranscriptEntry = {
          speaker: role === "user" ? "agent" : "customer",
          text,
          timestampISO: new Date().toISOString()
        };
        const transcript = [...this._state.transcript.slice(-9), entry];
        this.setState({ transcript });
        this.config.onTranscriptEntry(entry);
      },
      onError: this.config.onError,
      onConnected: () => console.log("[Realtime] Connected, session:", sessionData.sessionId),
      onDisconnected: () => console.log("[Realtime] Disconnected.")
    });

    await this.realtimeVoice.connect(sessionData.clientSecret.value);
  }

  async endCall(): Promise<void> {
    this.setStatus("ending");

    try {
      if (this.activeAgentId) {
        await fetch(`${this.config.workerBaseUrl}/agora/bot/stop`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ agentId: this.activeAgentId })
        });
        this.activeAgentId = null;
      }

      await this.agoraSignaling?.disconnect();
      await this.agoraVoice?.leave();
      await this.realtimeVoice?.disconnect();

      this.agoraVoice = null;
      this.agoraSignaling = null;
      this.realtimeVoice = null;

      this.setStatus("idle");
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.config.onError(err);
      this.setStatus("idle");
    }
  }
}
```

- [ ] **Step 4: Run tests**

```bash
cd windows-shell
npm test
```

Expected: session state machine tests pass.

- [ ] **Step 5: Commit**

```bash
git add windows-shell/src/callSession.ts windows-shell/src/callSession.test.ts
git commit -m "feat: implement call session state machine"
```

---

## Task 10: Update Electron Main Process with Call IPC Handlers

**Files:**
- Modify: `windows-shell/src/main.ts`
- Modify: `windows-shell/src/preload.ts`

The main process owns the system tray, global shortcut, and window lifecycle. The renderer owns the voice clients (they need browser APIs). IPC bridges the two: the renderer signals call start/end through `ipcRenderer.invoke`, and the main process relays state events back to the overlay.

- [ ] **Step 1: Replace main.ts with updated version**

Replace the contents of `windows-shell/src/main.ts` with:

```ts
import { app, BrowserWindow, globalShortcut, ipcMain, Tray, Menu, nativeImage } from "electron";
import path from "node:path";
import type { IPCCallEvent } from "./types";

let overlayWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isMicActive = false;

function createOverlayWindow(): void {
  overlayWindow = new BrowserWindow({
    width: 360,
    height: 220,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  overlayWindow.setAlwaysOnTop(true, "screen-saver");
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  if (process.env["ELECTRON_RENDERER_URL"]) {
    overlayWindow.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}/overlay.html`);
  } else {
    overlayWindow.loadFile(path.join(__dirname, "../renderer/overlay.html"));
  }

  overlayWindow.on("closed", () => {
    overlayWindow = null;
  });
}

function createTray(): void {
  // Use a default icon — replace icon.ico with a real icon before shipping
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip("Clicky Sales Agent");

  const updateTrayMenu = () => {
    tray?.setContextMenu(Menu.buildFromTemplate([
      {
        label: isMicActive ? "🔴 Mic Active" : "🎤 Start Call",
        click: () => {
          overlayWindow?.webContents.send("call-control", { action: "toggle" });
        }
      },
      { type: "separator" },
      {
        label: "Show Overlay",
        click: () => overlayWindow?.show()
      },
      {
        label: "Hide Overlay",
        click: () => overlayWindow?.hide()
      },
      { type: "separator" },
      { label: "Quit Clicky Sales Agent", click: () => app.quit() }
    ]));
  };

  updateTrayMenu();
}

app.whenReady().then(() => {
  createOverlayWindow();
  createTray();

  // Global shortcut: Control+Alt+Space toggles push-to-talk / call start
  globalShortcut.register("Control+Alt+Space", () => {
    isMicActive = !isMicActive;
    overlayWindow?.webContents.send("call-control", { action: "toggle" });
    createTray(); // Refresh tray menu to reflect new state
  });

  // Listen for call state events bubbled up from the renderer
  ipcMain.on("call-event", (_event, payload: IPCCallEvent) => {
    console.log("[Main] Call event:", payload.type);
  });
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  // Keep app running in tray — do not quit
});
```

- [ ] **Step 2: Replace preload.ts with updated version**

Replace the contents of `windows-shell/src/preload.ts` with:

```ts
import { contextBridge, ipcRenderer } from "electron";
import type { CallSuggestion, IPCCallEvent } from "./types";

contextBridge.exposeInMainWorld("clickySales", {
  // Renderer → Main: call control commands
  onCallControl: (callback: (action: { action: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { action: string }) =>
      callback(data);
    ipcRenderer.on("call-control", handler);
    return () => ipcRenderer.removeListener("call-control", handler);
  },

  // Renderer → Main: emit call state events for logging / tray updates
  emitCallEvent: (event: IPCCallEvent) => {
    ipcRenderer.send("call-event", event);
  },

  // Config: provide worker base URL to renderer (set via environment at build time)
  getWorkerBaseUrl: () => process.env["VITE_WORKER_BASE_URL"] ?? ""
});

// Expose IPC cleanup helper — renderer should call these to avoid listener leaks
declare global {
  interface Window {
    clickySales: {
      onCallControl: (callback: (action: { action: string }) => void) => () => void;
      emitCallEvent: (event: IPCCallEvent) => void;
      getWorkerBaseUrl: () => string;
    };
  }
}
```

- [ ] **Step 3: Add VITE_WORKER_BASE_URL to .env**

Create `windows-shell/.env`:

```
VITE_WORKER_BASE_URL=https://your-worker-subdomain.workers.dev
```

Replace `your-worker-subdomain` with the actual deployed Worker URL from `wrangler deploy` output.

- [ ] **Step 4: Verify build**

```bash
cd windows-shell
npm run build
npm run typecheck
```

Expected: no TypeScript errors, build succeeds.

- [ ] **Step 5: Commit**

```bash
git add windows-shell/src/main.ts windows-shell/src/preload.ts windows-shell/.env
git commit -m "feat: update electron main process with call ipc bridge"
```

---

## Task 11: Build the React Overlay with Live Call Controls

**Files:**
- Modify: `windows-shell/src/overlay.tsx`

This is the full React overlay renderer. It wires `CallSessionManager` to the UI, handles call start/end controls, and renders the whisper card and scorecard panel.

- [ ] **Step 1: Replace overlay.tsx with full implementation**

Replace `windows-shell/src/overlay.tsx` with:

```tsx
import React, { useCallback, useEffect, useReducer, useRef } from "react";
import { createRoot } from "react-dom/client";
import { CallSessionManager } from "./callSession";
import type {
  CallScorecard,
  CallSessionState,
  CallSuggestion,
  CallTranscriptEntry,
  RealtimeVoiceMode
} from "./types";

// ─── State ────────────────────────────────────────────────────────────────────

type OverlayState = {
  sessionState: CallSessionState;
  voiceMode: RealtimeVoiceMode;
  scorecard: CallScorecard | null;
  isGeneratingScorecard: boolean;
  showScorecard: boolean;
};

type OverlayAction =
  | { type: "SESSION_STATE_CHANGED"; state: CallSessionState }
  | { type: "SET_VOICE_MODE"; mode: RealtimeVoiceMode }
  | { type: "SCORECARD_READY"; scorecard: CallScorecard }
  | { type: "SCORECARD_LOADING"; loading: boolean }
  | { type: "TOGGLE_SCORECARD" };

function overlayReducer(state: OverlayState, action: OverlayAction): OverlayState {
  switch (action.type) {
    case "SESSION_STATE_CHANGED":
      return { ...state, sessionState: action.state };
    case "SET_VOICE_MODE":
      return { ...state, voiceMode: action.mode };
    case "SCORECARD_READY":
      return { ...state, scorecard: action.scorecard, isGeneratingScorecard: false, showScorecard: true };
    case "SCORECARD_LOADING":
      return { ...state, isGeneratingScorecard: action.loading };
    case "TOGGLE_SCORECARD":
      return { ...state, showScorecard: !state.showScorecard };
    default:
      return state;
  }
}

const initialState: OverlayState = {
  sessionState: {
    status: "idle",
    channelName: null,
    uid: null,
    transcript: [],
    latestSuggestion: null,
    scorecard: null,
    errorMessage: null
  },
  voiceMode: "openai_direct",
  scorecard: null,
  isGeneratingScorecard: false,
  showScorecard: false
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const colors = {
  bg: "rgba(8, 12, 18, 0.93)",
  border: "rgba(64, 156, 255, 0.7)",
  borderSubtle: "rgba(255, 255, 255, 0.08)",
  textPrimary: "rgba(255, 255, 255, 0.95)",
  textSecondary: "rgba(255, 255, 255, 0.65)",
  textTertiary: "rgba(255, 255, 255, 0.45)",
  accent: "#409cff",
  accentHover: "#5aaaff",
  red: "#ff453a",
  green: "#30d158",
  yellow: "#ffd60a"
};

// ─── Components ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const dot = {
    idle: colors.textTertiary,
    joining: colors.yellow,
    live: colors.green,
    bot_starting: colors.yellow,
    bot_live: colors.green,
    ending: colors.red,
    scored: colors.accent
  }[status] ?? colors.textTertiary;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <div style={{
        width: 6, height: 6, borderRadius: "50%",
        background: dot,
        boxShadow: status === "live" || status === "bot_live"
          ? `0 0 6px ${dot}` : "none"
      }} />
      <span style={{ fontSize: 10, color: colors.textTertiary, textTransform: "capitalize" }}>
        {status.replace(/_/g, " ")}
      </span>
    </div>
  );
}

function WhisperCard({ suggestion }: { suggestion: CallSuggestion }) {
  const objectionColors: Record<string, string> = {
    price: colors.yellow,
    competitor: colors.red,
    trust: colors.accent,
    timing: colors.textSecondary,
    confusion: colors.accent,
    authority: colors.textSecondary,
    none: colors.textTertiary
  };

  const labelColor = objectionColors[suggestion.objectionType] ?? colors.textTertiary;
  const label = suggestion.objectionType === "none"
    ? "Suggested response"
    : `${suggestion.objectionType.charAt(0).toUpperCase() + suggestion.objectionType.slice(1)} objection`;

  return (
    <div style={{
      padding: "10px 12px",
      borderTop: `1px solid ${colors.borderSubtle}`,
      display: "flex",
      flexDirection: "column",
      gap: 6
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: labelColor }}>
          {label}
        </span>
        <span style={{ fontSize: 10, color: colors.textTertiary }}>
          {Math.round(suggestion.confidence * 100)}% conf
        </span>
      </div>

      <p style={{
        fontSize: 12, lineHeight: 1.45, color: colors.textPrimary,
        margin: 0, fontWeight: 500
      }}>
        {suggestion.sayThis}
      </p>

      {suggestion.nextAction && (
        <p style={{
          fontSize: 11, color: colors.textSecondary,
          margin: 0, fontStyle: "italic"
        }}>
          → {suggestion.nextAction}
        </p>
      )}
    </div>
  );
}

function ScorecardPanel({ scorecard }: { scorecard: CallScorecard }) {
  return (
    <div style={{
      padding: "10px 12px",
      borderTop: `1px solid ${colors.borderSubtle}`,
      display: "flex",
      flexDirection: "column",
      gap: 8
    }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: colors.accent, textTransform: "uppercase", letterSpacing: "0.08em" }}>
        Call Summary
      </span>

      <p style={{ fontSize: 11, color: colors.textSecondary, margin: 0, lineHeight: 1.4 }}>
        {scorecard.summary}
      </p>

      {scorecard.objections.length > 0 && (
        <div>
          <span style={{ fontSize: 10, color: colors.textTertiary }}>Objections: </span>
          <span style={{ fontSize: 10, color: colors.yellow }}>{scorecard.objections.join(", ")}</span>
        </div>
      )}

      {scorecard.buyingSignals.length > 0 && (
        <div>
          <span style={{ fontSize: 10, color: colors.textTertiary }}>Buying signals: </span>
          <span style={{ fontSize: 10, color: colors.green }}>{scorecard.buyingSignals.join(", ")}</span>
        </div>
      )}

      <p style={{ fontSize: 11, color: colors.textSecondary, margin: 0 }}>
        <strong style={{ color: colors.textPrimary }}>Follow-up:</strong> {scorecard.recommendedFollowUp}
      </p>

      <p style={{ fontSize: 11, color: colors.textSecondary, margin: 0 }}>
        <strong style={{ color: colors.textPrimary }}>Coaching:</strong> {scorecard.repCoaching}
      </p>
    </div>
  );
}

function Button({
  children, onClick, disabled, variant = "default", small
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "danger" | "accent";
  small?: boolean;
}) {
  const bg = {
    default: "rgba(255,255,255,0.08)",
    danger: "rgba(255,69,58,0.15)",
    accent: "rgba(64,156,255,0.2)"
  }[variant];

  const borderColor = {
    default: colors.borderSubtle,
    danger: "rgba(255,69,58,0.4)",
    accent: "rgba(64,156,255,0.4)"
  }[variant];

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: disabled ? "rgba(255,255,255,0.03)" : bg,
        border: `1px solid ${disabled ? "rgba(255,255,255,0.04)" : borderColor}`,
        borderRadius: 6,
        color: disabled ? colors.textTertiary : colors.textPrimary,
        fontSize: small ? 10 : 11,
        fontWeight: 600,
        padding: small ? "4px 8px" : "6px 10px",
        cursor: disabled ? "default" : "pointer",
        fontFamily: "Segoe UI, system-ui, sans-serif",
        transition: "opacity 0.15s"
      }}
    >
      {children}
    </button>
  );
}

// ─── Main Overlay ─────────────────────────────────────────────────────────────

function Overlay() {
  const [state, dispatch] = useReducer(overlayReducer, initialState);
  const sessionManagerRef = useRef<CallSessionManager | null>(null);
  const workerBaseUrl = window.clickySales?.getWorkerBaseUrl() ?? "";

  // Initialize session manager once
  useEffect(() => {
    sessionManagerRef.current = new CallSessionManager({
      workerBaseUrl,
      onStateChange: (s) => dispatch({ type: "SESSION_STATE_CHANGED", state: s }),
      onSuggestion: () => {},
      onTranscriptEntry: () => {},
      onError: (err) => {
        console.error("[Overlay] Session error:", err);
        window.clickySales?.emitCallEvent({ type: "error", message: err.message });
      }
    });
  }, [workerBaseUrl]);

  // Listen for tray/shortcut toggle
  useEffect(() => {
    const cleanup = window.clickySales?.onCallControl(({ action }) => {
      if (action === "toggle") {
        const status = sessionManagerRef.current?.state.status;
        if (status === "idle") {
          handleStartCall();
        } else if (status === "live" || status === "bot_live") {
          handleEndCall();
        }
      }
    });
    return cleanup;
  }, []);

  const handleStartCall = useCallback(async () => {
    await sessionManagerRef.current?.startCall({
      repId: `rep-${Date.now()}`,
      voiceMode: state.voiceMode
    });
    window.clickySales?.emitCallEvent({ type: "session_status_changed", status: "live" });
  }, [state.voiceMode]);

  const handleEndCall = useCallback(async () => {
    await sessionManagerRef.current?.endCall();
    window.clickySales?.emitCallEvent({ type: "session_status_changed", status: "idle" });
  }, []);

  const handleGenerateScorecard = useCallback(async () => {
    const transcript = sessionManagerRef.current?.state.transcript ?? [];
    if (transcript.length === 0) return;

    dispatch({ type: "SCORECARD_LOADING", loading: true });

    try {
      const response = await fetch(`${workerBaseUrl}/call/scorecard`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recentTranscript: transcript })
      });
      const scorecard = await response.json();
      dispatch({ type: "SCORECARD_READY", scorecard });
      window.clickySales?.emitCallEvent({ type: "scorecard_ready", scorecard });
    } catch (err) {
      console.error("[Overlay] Scorecard error:", err);
    }
  }, [workerBaseUrl]);

  const { sessionState, voiceMode, scorecard, isGeneratingScorecard, showScorecard } = state;
  const isActive = ["live", "bot_live", "bot_starting"].includes(sessionState.status);
  const isIdle = sessionState.status === "idle";
  const hasTranscript = sessionState.transcript.length > 0;

  return (
    <div style={{
      width: 320,
      margin: 12,
      borderRadius: 10,
      background: colors.bg,
      border: `1px solid ${isActive ? colors.border : colors.borderSubtle}`,
      boxShadow: isActive
        ? `0 0 20px rgba(64,156,255,0.15), 0 12px 30px rgba(0,0,0,0.5)`
        : "0 8px 24px rgba(0,0,0,0.4)",
      fontFamily: "Segoe UI, system-ui, sans-serif",
      overflow: "hidden",
      transition: "border-color 0.3s, box-shadow 0.3s"
    }}>

      {/* Header */}
      <div style={{
        padding: "8px 12px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        borderBottom: `1px solid ${colors.borderSubtle}`
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: colors.textPrimary }}>
            Clicky Sales
          </span>
          <span style={{
            fontSize: 9, fontWeight: 600, color: colors.accent,
            background: "rgba(64,156,255,0.12)",
            border: "1px solid rgba(64,156,255,0.25)",
            borderRadius: 4, padding: "1px 5px"
          }}>
            CALL COPILOT
          </span>
        </div>
        <StatusBadge status={sessionState.status} />
      </div>

      {/* Mode selector (only when idle) */}
      {isIdle && (
        <div style={{
          padding: "8px 12px",
          display: "flex",
          gap: 6,
          borderBottom: `1px solid ${colors.borderSubtle}`
        }}>
          {(["openai_direct", "agora_bot"] as RealtimeVoiceMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => dispatch({ type: "SET_VOICE_MODE", mode })}
              style={{
                flex: 1, padding: "5px 8px",
                borderRadius: 6, border: "none", cursor: "pointer",
                fontSize: 10, fontWeight: 600,
                fontFamily: "Segoe UI, system-ui, sans-serif",
                background: voiceMode === mode
                  ? "rgba(64,156,255,0.2)"
                  : "rgba(255,255,255,0.05)",
                color: voiceMode === mode ? colors.accent : colors.textTertiary,
                transition: "all 0.15s"
              }}
            >
              {mode === "openai_direct" ? "⚡ Direct" : "🎙 Agora Bot"}
            </button>
          ))}
        </div>
      )}

      {/* Whisper card */}
      {sessionState.latestSuggestion && (
        <WhisperCard suggestion={sessionState.latestSuggestion} />
      )}

      {/* Scorecard panel */}
      {showScorecard && scorecard && (
        <ScorecardPanel scorecard={scorecard} />
      )}

      {/* Error message */}
      {sessionState.errorMessage && (
        <div style={{ padding: "6px 12px", borderTop: `1px solid ${colors.borderSubtle}` }}>
          <span style={{ fontSize: 10, color: colors.red }}>{sessionState.errorMessage}</span>
        </div>
      )}

      {/* Controls */}
      <div style={{
        padding: "8px 12px",
        display: "flex",
        gap: 6,
        borderTop: `1px solid ${colors.borderSubtle}`
      }}>
        {isIdle ? (
          <Button onClick={handleStartCall} variant="accent">
            🎤 Start Call
          </Button>
        ) : (
          <Button onClick={handleEndCall} variant="danger">
            ⏹ End Call
          </Button>
        )}

        {hasTranscript && (
          <Button
            onClick={isGeneratingScorecard ? () => {} : handleGenerateScorecard}
            disabled={isGeneratingScorecard}
            small
          >
            {isGeneratingScorecard ? "Scoring..." : "Scorecard"}
          </Button>
        )}

        {scorecard && (
          <Button onClick={() => dispatch({ type: "TOGGLE_SCORECARD" })} small>
            {showScorecard ? "Hide" : "Show"}
          </Button>
        )}
      </div>

    </div>
  );
}

// ─── Mount ────────────────────────────────────────────────────────────────────

createRoot(document.getElementById("root")!).render(<Overlay />);
```

- [ ] **Step 2: Build and run dev mode**

```bash
cd windows-shell
npm run dev
```

Expected:
- Electron window launches with the transparent overlay.
- Status badge shows `idle`.
- Mode selector shows `⚡ Direct` and `🎙 Agora Bot` buttons.
- `Control+Alt+Space` or the `🎤 Start Call` button triggers the call flow.
- When a suggestion arrives, the whisper card renders below the header.
- `End Call` and `Scorecard` controls appear contextually.

- [ ] **Step 3: Commit**

```bash
git add windows-shell/src/overlay.tsx
git commit -m "feat: build full react overlay with call controls and whisper card"
```

---

## Task 12: End-to-End Manual Verification

Perform these steps in order on the target Windows machine with valid credentials configured in `windows-shell/.env` and the Worker deployed with all secrets set.

- [ ] **Step 1: Verify Worker routes**

```bash
# Test token generation
curl -X POST https://your-worker.workers.dev/agora/channel \
  -H "content-type: application/json" \
  -d '{"repId": "rep-test"}'

# Expected: {"channelName":"call-rep-test-abc1234"}

curl -X POST https://your-worker.workers.dev/agora/rtc-token \
  -H "content-type: application/json" \
  -d '{"channelName":"call-rep-test-abc1234","uid":1001,"role":"publisher"}'

# Expected: {"token":"007eJx...","appId":"...","channelName":"...","uid":1001,"expiresAt":...}

curl -X POST https://your-worker.workers.dev/realtime/session \
  -H "content-type: application/json"

# Expected: {"ephemeralKey":"ek_...","sessionId":"sess_...","expiresAt":...}
```

- [ ] **Step 2: Verify OpenAI Realtime mode (Direct)**

1. Run `npm run dev` in `windows-shell`.
2. Confirm the overlay appears in the top-right corner of the screen.
3. Confirm mode selector shows `⚡ Direct` and `🎙 Agora Bot`.
4. Select `⚡ Direct`.
5. Click `🎤 Start Call` or press `Control+Alt+Space`.
6. Confirm the status badge transitions: `idle → joining → live`.
7. Speak a price objection clearly: `"I think the price is a bit too high for us right now."`
8. Wait 2–4 seconds for the Realtime API to process and respond.
9. Confirm a whisper card appears with `price objection` label, a `sayThis` response, and a `nextAction`.
10. Click `End Call`.
11. Click `Scorecard`. Confirm a scorecard panel appears with a summary and follow-up.

- [ ] **Step 3: Verify Agora Bot mode**

1. In the overlay, select `🎙 Agora Bot`.
2. Click `🎤 Start Call`.
3. Confirm the status badge transitions: `idle → joining → live → bot_starting → bot_live`.
4. Speak a competitor mention: `"We're also looking at your competitor who offers a lower price."`
5. Wait 3–6 seconds for the bot to transcribe, process, and push via RTM signaling.
6. Confirm a competitor objection whisper card appears.
7. Click `End Call`.
8. Confirm the Worker `/agora/bot/stop` route is called and the agent stops cleanly.

- [ ] **Step 4: Verify scorecard generation**

1. Complete a mock call with at least 3 utterances.
2. Click `End Call`.
3. Click `Scorecard`.
4. Confirm the scorecard panel shows `summary`, `objections`, `buyingSignals`, `recommendedFollowUp`, and `repCoaching`.
5. Click `Hide` to toggle the panel off.
6. Click `Show` to toggle it back on.

- [ ] **Step 5: Run all tests**

```bash
cd worker
npm test

cd ../windows-shell
npm test
npm run typecheck
```

Expected: all tests pass with no TypeScript errors.

---

## Verification Checklist

- [ ] Worker deploys with `/agora/channel`, `/agora/rtc-token`, `/agora/rtm-token`, `/agora/bot/start`, `/agora/bot/stop`, `/realtime/session`, `/call/suggest`, `/call/scorecard` routes.
- [ ] All Worker secrets are set: `AGORA_APP_ID`, `AGORA_APP_CERTIFICATE`, `AGORA_CUSTOMER_ID`, `AGORA_CUSTOMER_SECRET`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`.
- [ ] Worker tests pass.
- [ ] Windows shell builds without errors.
- [ ] Windows shell tests pass.
- [ ] Windows shell TypeScript check passes.
- [ ] Electron overlay renders in transparent always-on-top window.
- [ ] System tray icon appears with correct context menu.
- [ ] `Control+Alt+Space` global shortcut toggles call start/end.
- [ ] `⚡ Direct` mode connects to OpenAI Realtime API and streams mic audio.
- [ ] Whisper card appears within 3 seconds of a detectable customer utterance in Direct mode.
- [ ] `🎙 Agora Bot` mode joins a channel, starts the AI bot, and subscribes to the RTM signaling channel.
- [ ] Whisper card appears within 6 seconds of a detectable utterance in Agora Bot mode.
- [ ] `End Call` stops mic, leaves RTC channel, stops bot, and disconnects RTM signaling.
- [ ] Scorecard generates correctly from accumulated transcript.
- [ ] Scorecard panel toggles show/hide without re-fetching.
- [ ] No API keys are present in any Electron renderer code or committed to source control.
- [ ] `.env` is in `.gitignore`.

---

## Architecture Notes for AI Implementers

**Why two voice paths exist:**
- `openai_direct` is lower latency for demos and single-person capture. The WebSocket to OpenAI processes audio in ~300ms after voice activity detection.
- `agora_bot` is production-grade for real sales calls where both the rep and customer are on the same Agora channel. The bot listens to both sides and can diarize speakers.

**ScriptProcessorNode deprecation:**
The `ScriptProcessorNode` in `realtimeVoice.ts` is deprecated in favor of `AudioWorklet`. It is used here because `AudioWorklet` requires a separate `.js` worker file that complicates the Vite bundling for Electron. Migrate to `AudioWorklet` before shipping to production.

**Token expiry:**
RTC and RTM tokens expire after 3600 seconds (1 hour). Implement token refresh logic in `AgoraVoiceClient` if calls may exceed 1 hour. The OpenAI Realtime ephemeral token expires in 60 seconds and must be used immediately — the `connect()` call must happen within 60 seconds of the `/realtime/session` Worker response.

**Agora App ID is public-safe:**
The `AGORA_APP_ID` can be embedded in the Electron app via `VITE_AGORA_APP_ID` environment variable. It is not a secret. Only the App Certificate, Customer Secret, and OpenAI key must stay in the Worker.

**Signaling channel naming:**
The RTM signaling channel for bot suggestions is named `suggestions-{channelName}`. The Worker bot start payload passes this as `signalingUid`. Both the bot and the Electron RTM client must use the same channel name or suggestions will not be received.
