import type {
  CallAudioAnalysisResponse,
  CallScorecard,
  CallSuggestion,
  CallTranscriptEntry,
  LiveConversationState,
  ScreenContextItem
} from "./types";

async function postJson<TResponse>(
  workerBaseUrl: string,
  path: string,
  body: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch
): Promise<TResponse> {
  const response = await fetchImpl(`${workerBaseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`Request to ${path} failed with HTTP ${response.status}`);
  }

  return response.json() as Promise<TResponse>;
}

function resolveAudioFile(input: { file: Blob; mimeType?: string }): File {
  const resolvedMimeType =
    input.mimeType?.startsWith("audio/")
      ? input.mimeType
      : input.file.type.startsWith("audio/")
        ? input.file.type
        : input.mimeType?.includes("opus")
          ? "audio/webm;codecs=opus"
          : "audio/wav";

  const filename = resolvedMimeType.includes("wav")
    ? "call.wav"
    : resolvedMimeType.includes("ogg")
      ? "call.ogg"
      : resolvedMimeType.includes("mp4")
        ? "call.m4a"
        : "call.webm";

  return new File([input.file], filename, { type: resolvedMimeType });
}

export async function requestCallSuggestion(input: {
  workerBaseUrl: string;
  mode: "direct_coaching" | "call_copilot";
  latestUtterance: string;
  recentTranscript: CallTranscriptEntry[];
  screenContext: ScreenContextItem[];
  salesContext: Record<string, unknown>;
  conversationState?: LiveConversationState | null;
  fetchImpl?: typeof fetch;
}): Promise<CallSuggestion> {
  const fetchImpl = input.fetchImpl ?? fetch;
  return postJson<CallSuggestion>(input.workerBaseUrl, "/call/suggest", {
    mode: input.mode,
    latestUtterance: input.latestUtterance,
    recentTranscript: input.recentTranscript,
    screenContext: input.screenContext,
    salesContext: input.salesContext,
    conversationState: input.conversationState ?? undefined
  }, fetchImpl);
}

export async function requestCallSummary(input: {
  workerBaseUrl: string;
  recentTranscript: CallTranscriptEntry[];
  fetchImpl?: typeof fetch;
}): Promise<CallScorecard> {
  const fetchImpl = input.fetchImpl ?? fetch;
  return postJson<CallScorecard>(
    input.workerBaseUrl,
    "/call/summary",
    {
      recentTranscript: input.recentTranscript
    },
    fetchImpl
  );
}

export async function requestScorecard(input: {
  workerBaseUrl: string;
  recentTranscript: CallTranscriptEntry[];
  fetchImpl?: typeof fetch;
}): Promise<CallScorecard> {
  return requestCallSummary(input);
}

export async function requestLiveCallAnalysis(input: {
  workerBaseUrl: string;
  source: "mic" | "system";
  file: Blob;
  mimeType?: string;
  recentTranscript: CallTranscriptEntry[];
  screenContext: ScreenContextItem[];
  salesContext: Record<string, unknown>;
  conversationState?: LiveConversationState | null;
  fetchImpl?: typeof fetch;
}): Promise<CallAudioAnalysisResponse> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const formData = new FormData();
  formData.append("source", input.source);
  formData.append("file", resolveAudioFile({ file: input.file, mimeType: input.mimeType }));
  formData.append("recentTranscript", JSON.stringify(input.recentTranscript));
  formData.append("screenContext", JSON.stringify(input.screenContext));
  formData.append("salesContext", JSON.stringify(input.salesContext));

  if (input.conversationState) {
    formData.append("conversationState", JSON.stringify(input.conversationState));
  }

  const response = await fetchImpl(`${input.workerBaseUrl}/call/ingest`, {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    throw new Error(`Live call analysis failed with HTTP ${response.status}`);
  }

  return response.json() as Promise<CallAudioAnalysisResponse>;
}

export async function requestTranscription(input: {
  workerBaseUrl: string;
  file: Blob;
  mimeType?: string;
  fetchImpl?: typeof fetch;
}): Promise<{ text: string }> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const formData = new FormData();
  formData.append("file", resolveAudioFile({ file: input.file, mimeType: input.mimeType }));

  const response = await fetchImpl(`${input.workerBaseUrl}/transcribe`, {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    throw new Error(`Transcription failed with HTTP ${response.status}`);
  }

  return response.json() as Promise<{ text: string }>;
}
