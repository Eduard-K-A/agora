import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  requestCallSuggestion,
  requestScorecard,
  requestTranscription
} from "./callCopilotClient";
import type {
  CallScorecard,
  CallSpeaker,
  CallSuggestion,
  CallTranscriptEntry,
  RealtimeVoiceMode
} from "./types";

declare global {
  interface Window {
    clickySales?: {
      getWorkerBaseUrl: () => string;
    };
  }
}

type VoiceState = "idle" | "recording" | "transcribing" | "suggesting" | "error";

function Overlay() {
  const workerBaseUrl = window.clickySales?.getWorkerBaseUrl() ?? "";
  const [mode, setMode] = useState<RealtimeVoiceMode>("openai_direct");
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [latestSuggestion, setLatestSuggestion] = useState<CallSuggestion | null>(null);
  const [scorecard, setScorecard] = useState<CallScorecard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<CallTranscriptEntry[]>([]);
  const [latestUtterance, setLatestUtterance] = useState("");
  const salesContext = useMemo(
    () => ({
      companyName: "Clicky Sales Agent",
      productName: "Clicky Sales Agent",
      industry: "B2B software",
      prospectName: "Prospect",
      dealStage: "discovery",
      repGoal: "move the customer to a clear next step",
      targetCloseStep: "book a follow-up demo",
      knownObjections: [] as string[],
      notes: "Prototype/demo mode. Be specific, concise, and coach the rep toward the next step.",
      tone: "concise, warm, confident"
    }),
    []
  );

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const canRecord = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

  const transcriptPreview = useMemo(
    () => transcript.slice(-4),
    [transcript]
  );

  async function stopRecorder() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }

    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  }

  async function handleStartListening() {
    setError(null);
    setLatestSuggestion(null);
    setScorecard(null);

    if (!canRecord) {
      setError("Microphone capture is not available in this environment.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      chunksRef.current = [];

      const preferredMimeType =
        MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : MediaRecorder.isTypeSupported("audio/webm")
            ? "audio/webm"
            : "";

      const recorder = new MediaRecorder(
        stream,
        preferredMimeType ? { mimeType: preferredMimeType } : undefined
      );

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        try {
          setVoiceState("transcribing");
          const audioBlob = new Blob(chunksRef.current, {
            type: chunksRef.current[0]?.type || "audio/webm"
          });
          if (audioBlob.size === 0) {
            setVoiceState("idle");
            return;
          }

          const text = await requestTranscription({
            workerBaseUrl,
            file: audioBlob
          });

          const trimmed = text.trim();
          if (!trimmed) {
            setVoiceState("idle");
            return;
          }

          setLatestUtterance(trimmed);
          const entry: CallTranscriptEntry = {
            speaker: "customer" as CallSpeaker,
            text: trimmed,
            timestampISO: new Date().toISOString()
          };
          const updatedTranscript = [...transcript, entry];
          setTranscript(updatedTranscript);

          setVoiceState("suggesting");
          const suggestion = await requestCallSuggestion({
            workerBaseUrl,
            mode: mode === "openai_direct" ? "direct_coaching" : "call_copilot",
            latestUtterance: trimmed,
            recentTranscript: updatedTranscript,
            screenContext: [{ label: "Voice demo", summary: "Microphone capture active" }],
            salesContext
          });
          setLatestSuggestion(suggestion);
          setVoiceState("idle");
        } catch (err) {
          setError(err instanceof Error ? err.message : "Voice capture failed");
          setVoiceState("error");
        } finally {
          chunksRef.current = [];
        }
      };

      recorderRef.current = recorder;
      recorder.start();
      setVoiceState("recording");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to access the microphone");
      setVoiceState("error");
    }
  }

  async function handleStopListening() {
    await stopRecorder();
  }

  async function handleGenerateScorecard() {
    if (transcript.length === 0) return;

    setError(null);
    try {
      const result = await requestScorecard({
        workerBaseUrl,
        recentTranscript: transcript
      });
      setScorecard(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scorecard generation failed");
    }
  }

  useEffect(() => {
    return () => {
      void stopRecorder();
    };
  }, []);

  return (
    <div style={{
      width: 360,
      margin: 12,
      padding: 12,
      borderRadius: 12,
      background: "rgba(8, 12, 18, 0.94)",
      color: "white",
      border: "1px solid rgba(64,156,255,0.45)"
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
        <strong>Clicky Sales</strong>
        <span style={{ fontSize: 12, opacity: 0.8 }}>
          {mode === "openai_direct" ? "Direct" : "Agora"}
        </span>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <button onClick={() => setMode("openai_direct")}>Direct</button>
        <button onClick={() => setMode("agora_bot")}>Agora Bot</button>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <button onClick={handleStartListening} disabled={voiceState === "recording" || voiceState === "transcribing" || voiceState === "suggesting"}>
          {voiceState === "recording" ? "Listening..." : "Start Mic"}
        </button>
        <button onClick={handleStopListening} disabled={voiceState !== "recording"}>
          Stop
        </button>
        <button onClick={handleGenerateScorecard} disabled={transcript.length === 0}>
          Scorecard
        </button>
      </div>

      <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 8 }}>
        Status: {voiceState}
      </div>

      {latestUtterance && (
        <div style={{ marginBottom: 10, fontSize: 13 }}>
          <div style={{ opacity: 0.7 }}>Latest transcript</div>
          <div>{latestUtterance}</div>
        </div>
      )}

      {latestSuggestion && (
        <div style={{ marginTop: 10, fontSize: 13 }}>
          <div style={{ opacity: 0.7 }}>Suggestion</div>
          <div>{latestSuggestion.sayThis}</div>
          <div style={{ opacity: 0.7, marginTop: 4 }}>{latestSuggestion.nextAction}</div>
        </div>
      )}

      {scorecard && (
        <div style={{ marginTop: 10, fontSize: 13 }}>
          <div style={{ opacity: 0.7 }}>Scorecard</div>
          <div>{scorecard.summary}</div>
          <div style={{ opacity: 0.7, marginTop: 4 }}>{scorecard.recommendedFollowUp}</div>
        </div>
      )}

      {transcriptPreview.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>
          <div>Transcript</div>
          {transcriptPreview.map((entry, index) => (
            <div key={`${entry.timestampISO}-${index}`}>- {entry.text}</div>
          ))}
        </div>
      )}

      {error && (
        <div style={{ marginTop: 10, fontSize: 12, color: "#ff7b72" }}>
          {error}
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Overlay />);
