import { describe, expect, it } from "vitest";
import {
  MIN_TRANSCRIBABLE_AUDIO_BYTES,
  calculateRms,
  createTranscriptEntry,
  isLikelySpeech,
  shouldTranscribeChunk,
  speakerForAudioSource
} from "./liveAudioCapture";

describe("liveAudioCapture helpers", () => {
  it("creates a transcript entry from trimmed text and a stable timestamp", () => {
    const entry = createTranscriptEntry(
      "agent",
      "  We can book the demo now.  ",
      new Date("2026-05-27T06:15:00.000Z")
    );

    expect(entry).toEqual({
      speaker: "agent",
      text: "We can book the demo now.",
      timestampISO: "2026-05-27T06:15:00.000Z"
    });
  });

  it("tags microphone chunks as agent and system chunks as customer", () => {
    expect(speakerForAudioSource("mic")).toBe("agent");
    expect(speakerForAudioSource("system")).toBe("customer");
    expect(speakerForAudioSource("unknown")).toBe("unknown");
  });

  it("filters empty and tiny chunks before transcription", () => {
    expect(shouldTranscribeChunk(new Blob([]))).toBe(false);
    expect(shouldTranscribeChunk(new Blob(["x".repeat(32)]))).toBe(false);
    expect(shouldTranscribeChunk(new Blob(["x".repeat(MIN_TRANSCRIBABLE_AUDIO_BYTES + 1)]))).toBe(true);
  });

  it("detects likely speech from sample energy", () => {
    expect(calculateRms(new Float32Array([0, 0, 0]))).toBe(0);
    expect(isLikelySpeech(new Float32Array([0.001, -0.001, 0.001]))).toBe(false);
    expect(isLikelySpeech(new Float32Array([0.05, -0.04, 0.03]))).toBe(true);
  });
});
