import type { CallSpeaker, CallTranscriptEntry } from "./types";

export type LiveAudioSource = "mic" | "system" | "unknown";
export type LiveAudioSourceStatus = "idle" | "starting" | "active" | "blocked" | "error";

export type LiveAudioCaptureStatus = {
  mic: LiveAudioSourceStatus;
  system: LiveAudioSourceStatus;
  warnings: string[];
};

export type LiveAudioChunk = {
  source: LiveAudioSource;
  speaker: CallSpeaker;
  blob: Blob;
  recordedAtISO: string;
};

export type LiveAudioCaptureSession = {
  stop: () => void;
  status: () => LiveAudioCaptureStatus;
};

export type StartLiveAudioCaptureOptions = {
  chunkDurationMs?: number;
  onChunk: (chunk: LiveAudioChunk) => void | Promise<void>;
  onStatusChange?: (status: LiveAudioCaptureStatus) => void;
  onWarning?: (warning: string) => void;
  onError?: (source: LiveAudioSource, error: Error) => void;
};

type RecorderHandle = {
  recorder: MediaRecorder;
  stream: MediaStream;
};

export const LIVE_AUDIO_CHUNK_DURATION_MS = 8000;
export const MIN_TRANSCRIBABLE_AUDIO_BYTES = 1024;

export function speakerForAudioSource(source: LiveAudioSource): CallSpeaker {
  if (source === "mic") return "agent";
  if (source === "system") return "customer";
  return "unknown";
}

export function createTranscriptEntry(
  speaker: CallSpeaker,
  text: string,
  timestamp: Date = new Date()
): CallTranscriptEntry {
  return {
    speaker,
    text: text.trim(),
    timestampISO: timestamp.toISOString()
  };
}

export function shouldTranscribeChunk(
  blob: Blob,
  minBytes: number = MIN_TRANSCRIBABLE_AUDIO_BYTES
): boolean {
  return blob.size >= minBytes;
}

function getPreferredAudioMimeType(): string {
  if (typeof MediaRecorder === "undefined") {
    return "";
  }

  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
    return "audio/webm;codecs=opus";
  }

  if (MediaRecorder.isTypeSupported("audio/webm")) {
    return "audio/webm";
  }

  return "";
}

function createInitialStatus(): LiveAudioCaptureStatus {
  return {
    mic: "idle",
    system: "idle",
    warnings: []
  };
}

export async function startLiveAudioCapture(
  options: StartLiveAudioCaptureOptions
): Promise<LiveAudioCaptureSession> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("Microphone capture is not available in this environment.");
  }

  if (typeof MediaRecorder === "undefined") {
    throw new Error("MediaRecorder is not available in this environment.");
  }

  const chunkDurationMs = options.chunkDurationMs ?? LIVE_AUDIO_CHUNK_DURATION_MS;
  const recorderHandles: RecorderHandle[] = [];
  const status = createInitialStatus();
  let stopped = false;

  const publishStatus = () => {
    options.onStatusChange?.({
      mic: status.mic,
      system: status.system,
      warnings: [...status.warnings]
    });
  };

  const warn = (message: string) => {
    status.warnings = [...status.warnings, message];
    options.onWarning?.(message);
    publishStatus();
  };

  const startRecorder = (source: LiveAudioSource, stream: MediaStream) => {
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error(`${source === "mic" ? "Microphone" : "System"} audio stream has no audio tracks.`);
    }

    const mimeType = getPreferredAudioMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

    recorder.ondataavailable = (event) => {
      if (stopped || !shouldTranscribeChunk(event.data)) {
        return;
      }

      const chunk: LiveAudioChunk = {
        source,
        speaker: speakerForAudioSource(source),
        blob: event.data,
        recordedAtISO: new Date().toISOString()
      };

      void Promise.resolve(options.onChunk(chunk)).catch((error: unknown) => {
        options.onError?.(source, error instanceof Error ? error : new Error("Audio chunk processing failed."));
      });
    };

    recorder.onerror = () => {
      options.onError?.(source, new Error(`${source === "mic" ? "Microphone" : "System"} recorder failed.`));
    };

    recorder.start(chunkDurationMs);
    recorderHandles.push({ recorder, stream });
  };

  status.mic = "starting";
  status.system = "starting";
  publishStatus();

  try {
    const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    startRecorder("mic", micStream);
    status.mic = "active";
    publishStatus();
  } catch (error) {
    status.mic = "error";
    publishStatus();
    throw error instanceof Error ? error : new Error("Unable to access the microphone.");
  }

  if (!navigator.mediaDevices.getDisplayMedia) {
    status.system = "blocked";
    warn("System audio capture is not available in this environment. Continuing with microphone only.");
    return {
      stop() {
        stopped = true;
        stopRecorders(recorderHandles);
        status.mic = "idle";
        status.system = "idle";
        publishStatus();
      },
      status: () => ({ mic: status.mic, system: status.system, warnings: [...status.warnings] })
    };
  }

  try {
    const displayStream = await navigator.mediaDevices.getDisplayMedia({
      audio: true,
      video: true
    });

    displayStream.getVideoTracks().forEach((track) => track.stop());

    const audioTracks = displayStream.getAudioTracks();
    if (audioTracks.length === 0) {
      displayStream.getTracks().forEach((track) => track.stop());
      status.system = "blocked";
      warn("System audio was not provided by the OS or meeting app. Continuing with microphone only.");
    } else {
      startRecorder("system", new MediaStream(audioTracks));
      status.system = "active";
      publishStatus();
    }
  } catch (error) {
    status.system = "blocked";
    warn(
      error instanceof Error && error.message
        ? `System audio capture was blocked: ${error.message}`
        : "System audio capture was blocked. Continuing with microphone only."
    );
  }

  return {
    stop() {
      stopped = true;
      stopRecorders(recorderHandles);
      status.mic = "idle";
      status.system = "idle";
      publishStatus();
    },
    status: () => ({ mic: status.mic, system: status.system, warnings: [...status.warnings] })
  };
}

function stopRecorders(recorderHandles: RecorderHandle[]) {
  for (const { recorder, stream } of recorderHandles) {
    if (recorder.state !== "inactive") {
      recorder.stop();
    }

    stream.getTracks().forEach((track) => track.stop());
  }
}
