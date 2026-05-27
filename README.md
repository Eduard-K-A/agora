# Agora Copilot

Desktop voice sales assistant prototype built from a Cloudflare Worker and a Windows Electron shell.

## What It Does

- Records microphone input from the Electron overlay
- Sends audio to the Worker for transcription
- Uses Groq for structured sales suggestions and scorecards
- Displays whisper-style coaching cards in the overlay
- Includes demo mode selectors for `Direct` and `Agora Bot`

## Current AI And Voice Stack

- Groq for transcription, sales suggestions, and scorecards
- Agora reserved for future live-call transport and signaling
- No Anthropic dependency
- No OpenAI dependency in the current prototype

## Project Structure

- `worker` - Cloudflare Worker for transcription, suggestion, and scorecard routes
- `windows-shell` - Electron overlay and push-to-talk microphone UI
- `shared` - shared TypeScript contracts between the Worker and shell

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

Start the Electron shell in a second terminal:

```bash
npm run dev -w windows-shell
```

## How To Test

1. Click `Start Mic`
2. Speak a short utterance such as `the price is too high`
3. Click `Stop`
4. Wait for the transcript and suggestion card
5. Click `Scorecard` after at least one transcript entry exists

## Mode Buttons

- `Direct`
  - demo coaching mode
  - sends the request as a direct coaching scenario

- `Agora Bot`
  - live-call-style mode label
  - currently affects the request mode only
  - real Agora call orchestration is still future work

## Notes

- This is a prototype/demo build, not a production sales system.
- The current voice flow is push-to-talk, not continuous streaming.
- The app currently transcribes actual microphone input, not hardcoded text.

