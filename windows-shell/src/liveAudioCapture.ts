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
  mimeType: string;
  recordedAtISO: string;
};

export type LiveAudioCaptureSession = {
  stop: () => void;
  status: () => LiveAudioCaptureStatus;
};

export type StartLiveAudioCaptureOptions = {
  chunkDurationMs?: number;
  audioFocus?: "microphone" | "customer" | "both";
  onChunk: (chunk: LiveAudioChunk) => void | Promise<void>;
  onStatusChange?: (status: LiveAudioCaptureStatus) => void;
  onWarning?: (warning: string) => void;
  onError?: (source: LiveAudioSource, error: Error) => void;
};

type CaptureHandle = {
  source: LiveAudioSource;
  stream: MediaStream;
  audioContext: AudioContext;
  sourceNode: MediaStreamAudioSourceNode;
  processor: ScriptProcessorNode;
  muteNode: GainNode;
  sampleRate: number;
  samplesPerChunk: number;
  bufferedSamples: number;
  buffers: Float32Array[];
};

export const LIVE_AUDIO_CHUNK_DURATION_MS = 2500;
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

function createInitialStatus(): LiveAudioCaptureStatus {
  return {
    mic: "idle",
    system: "idle",
    warnings: []
  };
}

function writeString(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function interleaveChannels(buffers: Float32Array[]): Float32Array {
  if (buffers.length === 1) {
    return buffers[0];
  }

  const frameCount = Math.min(...buffers.map((buffer) => buffer.length));
  const result = new Float32Array(frameCount);

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    let total = 0;
    for (const buffer of buffers) {
      total += buffer[frameIndex] ?? 0;
    }
    result[frameIndex] = total / buffers.length;
  }

  return result;
}

function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample;
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, samples.length * bytesPerSample, true);

  let offset = 44;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index] ?? 0));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += bytesPerSample;
  }

  return buffer;
}

function collectChannelData(event: AudioProcessingEvent): Float32Array {
  const inputBuffer = event.inputBuffer;
  const channelCount = inputBuffer.numberOfChannels;

  if (channelCount <= 1) {
    return new Float32Array(inputBuffer.getChannelData(0));
  }

  const channels: Float32Array[] = [];
  for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
    channels.push(new Float32Array(inputBuffer.getChannelData(channelIndex)));
  }

  return interleaveChannels(channels);
}

function combineBuffers(buffers: Float32Array[], totalSamples: number): Float32Array {
  const output = new Float32Array(totalSamples);
  let offset = 0;

  for (const buffer of buffers) {
    output.set(buffer, offset);
    offset += buffer.length;
  }

  return output;
}

function stopHandle(handle: CaptureHandle) {
  try {
    if (handle.processor) {
      handle.processor.disconnect();
    }
  } catch {
    // Ignore disconnect failures during shutdown.
  }

  try {
    if (handle.sourceNode) {
      handle.sourceNode.disconnect();
    }
  } catch {
    // Ignore disconnect failures during shutdown.
  }

  try {
    if (handle.muteNode) {
      handle.muteNode.disconnect();
    }
  } catch {
    // Ignore disconnect failures during shutdown.
  }

  handle.stream.getTracks().forEach((track) => track.stop());
  void handle.audioContext.close().catch(() => undefined);
}

export async function startLiveAudioCapture(
  options: StartLiveAudioCaptureOptions
): Promise<LiveAudioCaptureSession> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("Microphone capture is not available in this environment.");
  }

  if (typeof AudioContext === "undefined") {
    throw new Error("AudioContext is not available in this environment.");
  }

  const chunkDurationMs = options.chunkDurationMs ?? LIVE_AUDIO_CHUNK_DURATION_MS;
  const audioFocus = options.audioFocus ?? "both";
  const captureHandles: CaptureHandle[] = [];
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

  const emitChunk = (source: LiveAudioSource, blob: Blob) => {
    if (stopped || !shouldTranscribeChunk(blob)) {
      return;
    }

    const chunk: LiveAudioChunk = {
      source,
      speaker: speakerForAudioSource(source),
      blob,
      mimeType: "audio/wav",
      recordedAtISO: new Date().toISOString()
    };

    void Promise.resolve(options.onChunk(chunk)).catch((error: unknown) => {
      options.onError?.(source, error instanceof Error ? error : new Error("Audio chunk processing failed."));
    });
  };

  const flushHandle = (handle: CaptureHandle) => {
    if (handle.buffers.length === 0 || handle.bufferedSamples === 0) {
      return;
    }

    const combinedSamples = combineBuffers(handle.buffers, handle.bufferedSamples);
    handle.buffers = [];
    handle.bufferedSamples = 0;

    const wavBuffer = encodeWav(combinedSamples, handle.sampleRate);
    emitChunk(handle.source, new Blob([wavBuffer], { type: "audio/wav" }));
  };

  const appendSamples = (handle: CaptureHandle, samples: Float32Array) => {
    if (samples.length === 0) {
      return;
    }

    handle.buffers.push(samples);
    handle.bufferedSamples += samples.length;

    if (handle.bufferedSamples >= handle.samplesPerChunk) {
      flushHandle(handle);
    }
  };

  const startCapture = async (source: LiveAudioSource, stream: MediaStream) => {
    const audioContext = new AudioContext();
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    const sourceNode = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    const muteNode = audioContext.createGain();
    muteNode.gain.value = 0;

    const handle: CaptureHandle = {
      source,
      stream,
      audioContext,
      sourceNode,
      processor,
      muteNode,
      sampleRate: audioContext.sampleRate,
      samplesPerChunk: Math.max(4096, Math.round(audioContext.sampleRate * (chunkDurationMs / 1000))),
      bufferedSamples: 0,
      buffers: []
    };

    processor.onaudioprocess = (event) => {
      if (stopped) {
        return;
      }

      appendSamples(handle, collectChannelData(event));
    };

    sourceNode.connect(processor);
    processor.connect(muteNode);
    muteNode.connect(audioContext.destination);

    captureHandles.push(handle);
  };

  status.mic = audioFocus === "customer" ? "blocked" : "starting";
  status.system = audioFocus === "microphone" ? "blocked" : "starting";
  publishStatus();

  if (audioFocus !== "customer") {
    try {
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      await startCapture("mic", micStream);
      status.mic = "active";
      publishStatus();
    } catch (error) {
      status.mic = "error";
      publishStatus();
      throw error instanceof Error ? error : new Error("Unable to access the microphone.");
    }
  }

  if (audioFocus !== "microphone") {
    if (!navigator.mediaDevices.getDisplayMedia) {
      status.system = "blocked";
      warn("System audio capture is not available in this environment. Continuing with microphone only.");
      return {
        stop() {
          stopped = true;
          captureHandles.forEach(stopHandle);
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
        video: false
      });

      const audioTracks = displayStream.getAudioTracks();
      if (audioTracks.length === 0) {
        displayStream.getTracks().forEach((track) => track.stop());
        status.system = "blocked";
        warn("System audio was not provided by the OS or meeting app. Continuing with microphone only.");
      } else {
        await startCapture("system", new MediaStream(audioTracks));
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
  }

  return {
    stop() {
      stopped = true;
      captureHandles.forEach((handle) => flushHandle(handle));
      captureHandles.forEach(stopHandle);
      status.mic = "idle";
      status.system = "idle";
      publishStatus();
    },
    status: () => ({ mic: status.mic, system: status.system, warnings: [...status.warnings] })
  };
}
