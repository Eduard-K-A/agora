import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  requestCallSuggestion,
  requestScorecard,
  requestTranscription
} from "./callCopilotClient";
import {
  LIVE_AUDIO_CHUNK_DURATION_MS,
  createTranscriptEntry,
  startLiveAudioCapture,
  type LiveAudioCaptureSession,
  type LiveAudioCaptureStatus,
  type LiveAudioChunk,
  type LiveAudioSourceStatus
} from "./liveAudioCapture";
import type {
  CallCustomerType,
  CallScorecard,
  CallSuggestion,
  CallTranscriptEntry
} from "./types";

declare global {
  interface Window {
    clickySales?: {
      getWorkerBaseUrl: () => string;
    };
  }
}

type VoiceState = "idle" | "starting" | "listening" | "transcribing" | "suggesting" | "error";

const initialCaptureStatus: LiveAudioCaptureStatus = {
  mic: "idle",
  system: "idle",
  warnings: []
};

const customerTypeLabels: Record<CallCustomerType, string> = {
  buyer: "Buyer",
  inquirer: "Inquirer",
  price_sensitive_lead: "Price-sensitive lead",
  comparison_shopper: "Comparison shopper",
  needs_approval_lead: "Needs-approval lead",
  timing_constrained_lead: "Timing-constrained lead",
  support_existing_customer: "Existing customer",
  not_qualified: "Not qualified",
  unknown: "Unknown"
};

function statusColor(status: LiveAudioSourceStatus): string {
  if (status === "active") return "#5ee28a";
  if (status === "starting") return "#ffd166";
  if (status === "blocked" || status === "error") return "#ff7b72";
  return "rgba(255,255,255,0.55)";
}

function speakerLabel(entry: CallTranscriptEntry): string {
  if (entry.speaker === "agent") return "You";
  if (entry.speaker === "customer") return "Customer";
  return "Unknown";
}

function Overlay() {
  const workerBaseUrl = window.clickySales?.getWorkerBaseUrl() ?? "";
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [isListening, setIsListening] = useState(false);
  const [captureStatus, setCaptureStatus] = useState<LiveAudioCaptureStatus>(initialCaptureStatus);
  const [latestSuggestion, setLatestSuggestion] = useState<CallSuggestion | null>(null);
  const [scorecard, setScorecard] = useState<CallScorecard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [transcript, setTranscript] = useState<CallTranscriptEntry[]>([]);
  const [latestUtterance, setLatestUtterance] = useState("");

  const captureSessionRef = useRef<LiveAudioCaptureSession | null>(null);
  const captureStatusRef = useRef<LiveAudioCaptureStatus>(initialCaptureStatus);
  const isListeningRef = useRef(false);
  const transcriptRef = useRef<CallTranscriptEntry[]>([]);
  const processingQueueRef = useRef<Promise<void>>(Promise.resolve());

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

  const canListen = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
  const transcriptPreview = useMemo(() => transcript.slice(-8), [transcript]);

  function updateTranscript(entries: CallTranscriptEntry[]) {
    transcriptRef.current = entries;
    setTranscript(entries);
  }

  function updateCaptureStatus(status: LiveAudioCaptureStatus) {
    captureStatusRef.current = status;
    setCaptureStatus(status);
  }

  async function processAudioChunk(chunk: LiveAudioChunk) {
    try {
      setError(null);
      setVoiceState("transcribing");

      const text = await requestTranscription({
        workerBaseUrl,
        file: chunk.blob
      });

      const trimmed = text.trim();
      if (!trimmed) {
        setVoiceState(isListeningRef.current ? "listening" : "idle");
        return;
      }

      setLatestUtterance(trimmed);
      const entry = createTranscriptEntry(chunk.speaker, trimmed, new Date(chunk.recordedAtISO));
      const updatedTranscript = [...transcriptRef.current, entry].slice(-30);
      updateTranscript(updatedTranscript);

      setVoiceState("suggesting");
      const suggestion = await requestCallSuggestion({
        workerBaseUrl,
        mode: "call_copilot",
        latestUtterance: trimmed,
        recentTranscript: updatedTranscript,
        screenContext: [
          {
            label: "Live call listening",
            summary: `Latest chunk came from ${chunk.source === "mic" ? "microphone" : "system audio"}.`
          },
          {
            label: "Capture status",
            summary: `Mic: ${captureStatusRef.current.mic}. System audio: ${captureStatusRef.current.system}.`
          }
        ],
        salesContext
      });
      setLatestSuggestion(suggestion);
      setVoiceState(isListeningRef.current ? "listening" : "idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Live call processing failed");
      setVoiceState("error");
    }
  }

  function enqueueAudioChunk(chunk: LiveAudioChunk) {
    processingQueueRef.current = processingQueueRef.current
      .then(() => processAudioChunk(chunk))
      .catch(() => undefined);
  }

  async function handleStartListening() {
    setError(null);
    setWarnings([]);
    setLatestSuggestion(null);
    setScorecard(null);
    setLatestUtterance("");
    updateTranscript([]);

    if (!canListen) {
      setError("Microphone capture is not available in this environment.");
      setVoiceState("error");
      return;
    }

    try {
      setVoiceState("starting");
      setIsListening(true);
      isListeningRef.current = true;

      const session = await startLiveAudioCapture({
        chunkDurationMs: LIVE_AUDIO_CHUNK_DURATION_MS,
        onChunk: enqueueAudioChunk,
        onStatusChange: updateCaptureStatus,
        onWarning: (warning) => setWarnings((current) => [...current, warning]),
        onError: (source, sourceError) => {
          setWarnings((current) => [
            ...current,
            `${source === "mic" ? "Microphone" : "System audio"} warning: ${sourceError.message}`
          ]);
        }
      });

      captureSessionRef.current = session;
      updateCaptureStatus(session.status());
      setVoiceState("listening");
    } catch (err) {
      isListeningRef.current = false;
      setIsListening(false);
      captureSessionRef.current?.stop();
      captureSessionRef.current = null;
      setError(err instanceof Error ? err.message : "Unable to start live call listening");
      setVoiceState("error");
    }
  }

  function handleStopListening() {
    isListeningRef.current = false;
    setIsListening(false);
    captureSessionRef.current?.stop();
    captureSessionRef.current = null;
    setVoiceState("idle");
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
      isListeningRef.current = false;
      captureSessionRef.current?.stop();
    };
  }, []);

  return (
    <div style={{
      width: 360,
      maxHeight: 536,
      overflowY: "auto",
      margin: 12,
      padding: 12,
      borderRadius: 12,
      background: "rgba(8, 12, 18, 0.94)",
      color: "white",
      border: "1px solid rgba(64,156,255,0.45)",
      fontFamily: "Segoe UI, system-ui, sans-serif"
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
        <strong>Clicky Sales</strong>
        <span style={{ fontSize: 12, opacity: 0.8 }}>Live call</span>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <button onClick={handleStartListening} disabled={isListening || voiceState === "starting"}>
          {voiceState === "starting" ? "Starting..." : "Start live listening"}
        </button>
        <button onClick={handleStopListening} disabled={!isListening}>
          Stop
        </button>
        <button onClick={handleGenerateScorecard} disabled={transcript.length === 0}>
          Scorecard
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 10, fontSize: 12 }}>
        <div>
          <span style={{ opacity: 0.7 }}>Mic </span>
          <strong style={{ color: statusColor(captureStatus.mic) }}>{captureStatus.mic}</strong>
        </div>
        <div>
          <span style={{ opacity: 0.7 }}>System </span>
          <strong style={{ color: statusColor(captureStatus.system) }}>{captureStatus.system}</strong>
        </div>
      </div>

      <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 8 }}>
        Status: {voiceState}
      </div>

      {latestSuggestion && (
        <div style={{ marginTop: 10, fontSize: 13 }}>
          <div style={{ opacity: 0.72, marginBottom: 2 }}>Customer type</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
            {customerTypeLabels[latestSuggestion.customerType]}
            <span style={{ fontSize: 12, opacity: 0.72, marginLeft: 6 }}>
              {Math.round(latestSuggestion.customerTypeConfidence * 100)}%
            </span>
          </div>

          <div style={{ opacity: 0.72 }}>Intent</div>
          <div style={{ marginBottom: 6 }}>{latestSuggestion.customerIntent}</div>

          <div style={{ opacity: 0.72 }}>Tell next</div>
          <div style={{ marginBottom: 6 }}>{latestSuggestion.recommendedInfo}</div>

          <div style={{ opacity: 0.72 }}>Persuasion tip</div>
          <div style={{ marginBottom: 6 }}>{latestSuggestion.persuasionTip}</div>

          <div style={{ opacity: 0.72 }}>Say this</div>
          <div style={{ marginBottom: 6 }}>{latestSuggestion.sayThis}</div>

          <div style={{ opacity: 0.72 }}>Next action</div>
          <div>{latestSuggestion.nextAction}</div>
        </div>
      )}

      {latestUtterance && (
        <div style={{ marginTop: 10, fontSize: 13 }}>
          <div style={{ opacity: 0.7 }}>Latest transcript</div>
          <div>{latestUtterance}</div>
        </div>
      )}

      {transcriptPreview.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 12 }}>
          <div style={{ opacity: 0.75, marginBottom: 4 }}>Rolling transcript</div>
          {transcriptPreview.map((entry, index) => (
            <div key={`${entry.timestampISO}-${index}`} style={{ marginBottom: 3 }}>
              <strong>{speakerLabel(entry)}:</strong> {entry.text}
            </div>
          ))}
        </div>
      )}

      {scorecard && (
        <div style={{ marginTop: 10, fontSize: 13 }}>
          <div style={{ opacity: 0.7 }}>Scorecard</div>
          <div>{scorecard.summary}</div>
          <div style={{ opacity: 0.7, marginTop: 4 }}>{scorecard.recommendedFollowUp}</div>
        </div>
      )}

      {warnings.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 12, color: "#ffd166" }}>
          {warnings.slice(-2).map((warning, index) => (
            <div key={`${warning}-${index}`}>{warning}</div>
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
