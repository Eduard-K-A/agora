# Ely Sales Agent

Desktop voice sales assistant prototype built from a Cloudflare Worker and a cross-platform Electron shell.

## What It Does

- Captures live call/system audio from the Electron overlay
- Sends audio chunks to the Worker for server-side transcription and speaker-turn classification
- Keeps only customer turns for coaching context
- Uses Groq for transcription, structured sales suggestions, and post-call summaries
- Reads local SQLite mock inventory context before generating live suggestions
- Saves generated call summaries to SQLite
- Displays whisper-style coaching cards in the overlay

## Current AI And Voice Stack

- Groq for transcription, speaker-turn classification, sales suggestions, and post-call summaries
- The Worker owns the customer-only stream processing step
- Agora scaffolding is present for live-call transport, signaling, and token generation

## Agora SDK Use Cases

Agora is the planned real-time communication layer for this project. The current demo still captures local microphone and system audio directly from the Electron overlay, but the repo already separates the Agora responsibilities so the SDK integration can be completed without changing the AI coaching flow.

- `Agora RTC` will carry the live voice call between the representative and customer. The Electron shell has a voice-session wrapper in `windows-shell/src/agoraVoice.ts` for joining and leaving an Agora voice channel.
- `Agora RTM / Signaling` will publish lightweight call events and AI whisper payloads. The placeholder lives in `windows-shell/src/agoraSignaling.ts`.
- `agora-token` is installed in the Worker workspace for server-side token minting. The Worker currently exposes `/agora/channel`, `/agora/rtc-token`, and `/agora/rtm-token` routes, with token generation stubbed in `worker/src/agoraToken.ts`.
- The intended production flow is: the Worker mints Agora RTC/RTM tokens, the Electron shell joins the Agora channel, call audio flows through Agora RTC, and AI suggestions can be sent back to the representative through the overlay or Agora signaling.

Current status: Agora SDK integration is scaffolded but not fully wired. The working demo path still uses local audio capture plus Worker-based transcription and coaching.

## Project Structure

- `worker` - Cloudflare Worker for audio ingest, speaker classification, suggestion, and summary routes
- `windows-shell` - Electron overlay that captures live call audio and streams it to the Worker
- `shared` - shared TypeScript contracts between the Worker and shell
- `mock-data` - standalone SQLite database and seed data for inventory and saved summaries

## Setup

1. Install dependencies

```bash
npm install
npm install -w worker
npm install -w windows-shell
```

2. Add Worker secrets

Copy `worker/.dev.vars.example` to `worker/.dev.vars` and fill in:

- `GROQ_API_KEY`
- `AGORA_APP_ID`
- `AGORA_APP_CERTIFICATE`
- `AGORA_CUSTOMER_ID`
- `AGORA_CUSTOMER_SECRET`

3. Add shell config

Copy `windows-shell/.env.example` to `windows-shell/.env` and set:

- `VITE_WORKER_BASE_URL=http://localhost:8787`
- optionally `VITE_AGORA_APP_ID`

## Run

Start the Worker:

```bash
npm run dev -w worker
```

Start the Electron shell in a second terminal on Windows or macOS:

```bash
npm run dev -w windows-shell
```

## How To Test

1. Click `Start Listening`
2. Speak into the active call stream or play a customer call clip
3. Click `Stop`
4. Wait for the customer transcript and suggestion card
5. Stop listening, then click `Summary` after at least one transcript entry exists

## macOS Notes

- The Electron shell runs on macOS without code changes.
- If you want packaged Mac builds later, you can add an Electron builder step for `darwin`.
- The current dev command is the same on macOS:

```bash
npm run dev -w windows-shell
```

## Notes

- This is a prototype/demo build, not a production sales system.
- The current voice flow is chunked live capture, not continuous streaming.
- The Worker filters out non-customer turns before generating coaching.
