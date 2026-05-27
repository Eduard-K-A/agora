import type {
  CallScorecard,
  CallScorecardRequest,
  CallSuggestion,
  CallSuggestionRequest
} from "./types";

export type RequestCallSuggestionInput = CallSuggestionRequest & {
  workerBaseUrl: string;
  fetchImpl?: typeof fetch;
};

export async function requestCallSuggestion(input: RequestCallSuggestionInput): Promise<CallSuggestion> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(`${input.workerBaseUrl}/call/suggest`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      mode: input.mode,
      latestUtterance: input.latestUtterance,
      recentTranscript: input.recentTranscript,
      screenContext: input.screenContext,
      salesContext: input.salesContext
    } satisfies CallSuggestionRequest)
  });

  if (!response.ok) {
    throw new Error(`Call suggestion failed with HTTP ${response.status}`);
  }

  return (await response.json()) as CallSuggestion;
}

export type RequestScorecardInput = CallScorecardRequest & {
  workerBaseUrl: string;
  fetchImpl?: typeof fetch;
};

export async function requestScorecard(input: RequestScorecardInput): Promise<CallScorecard> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(`${input.workerBaseUrl}/call/scorecard`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      recentTranscript: input.recentTranscript
    } satisfies CallScorecardRequest)
  });

  if (!response.ok) {
    throw new Error(`Call scorecard failed with HTTP ${response.status}`);
  }

  return (await response.json()) as CallScorecard;
}

export async function requestTranscription(input: {
  workerBaseUrl: string;
  file: Blob;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const formData = new FormData();
  formData.append("file", input.file, "recording.webm");

  const response = await fetchImpl(`${input.workerBaseUrl}/transcribe`, {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    throw new Error(`Transcription failed with HTTP ${response.status}`);
  }

  const result = (await response.json()) as { text?: string };
  return result.text ?? "";
}
