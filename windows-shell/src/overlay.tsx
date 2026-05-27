import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { requestCallSuggestion, requestScorecard, requestTranscription } from "./callCopilotClient";
import {
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
  CallTranscriptEntry,
  LiveConversationState
} from "./types";

declare global {
  interface Window {
    clickySales?: {
      getWorkerBaseUrl: () => string;
      resizeOverlay?: (width: number, height: number) => Promise<void>;
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
  if (entry.speaker === "agent") return "Agent";
  if (entry.speaker === "customer") return "Customer";
  return "Unknown";
}

function Overlay() {
  const workerBaseUrl = window.clickySales?.getWorkerBaseUrl() ?? "";
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [isListening, setIsListening] = useState(false);
  const [captureStatus, setCaptureStatus] = useState<LiveAudioCaptureStatus>(initialCaptureStatus);
  const [latestSuggestion, setLatestSuggestion] = useState<CallSuggestion | null>(null);
  const [scorecard, setScorecard] = useState<CallScorecard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [transcript, setTranscript] = useState<CallTranscriptEntry[]>([]);
  const [latestUtterance, setLatestUtterance] = useState("");
  const [analysisDebug, setAnalysisDebug] = useState<{
    transcriptText: string;
    source: "mic" | "system";
    speaker: "agent" | "customer";
    speakerConfidence: number;
    reason: string;
    ignored: boolean;
    transcriptEntry?: CallTranscriptEntry;
  } | null>(null);

  const captureSessionRef = useRef<LiveAudioCaptureSession | null>(null);
  const isListeningRef = useRef(false);
  const transcriptRef = useRef<CallTranscriptEntry[]>([]);
  const conversationStateRef = useRef<LiveConversationState | null>(null);
  const processingQueueRef = useRef<Promise<void>>(Promise.resolve());
  const customerSuggestionRequestIdRef = useRef(0);

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
      notes: "Customer-only live call mode. Keep only customer turns and coach the rep toward the next step.",
      tone: "concise, warm, confident"
    }),
    []
  );

  const canListen =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    !!navigator.mediaDevices?.getDisplayMedia;
  const transcriptPreview = useMemo(() => transcript.slice(-5), [transcript]);

  function updateTranscript(entries: CallTranscriptEntry[]) {
    transcriptRef.current = entries;
    setTranscript(entries);
  }

  function updateCaptureStatus(status: LiveAudioCaptureStatus) {
    setCaptureStatus(status);
  }

  async function generateCustomerFeedback(latestUtteranceText: string) {
    const requestId = customerSuggestionRequestIdRef.current + 1;
    customerSuggestionRequestIdRef.current = requestId;

    try {
      setVoiceState("suggesting");
      const suggestion = await requestCallSuggestion({
        workerBaseUrl,
        mode: "call_copilot",
        latestUtterance: latestUtteranceText,
        recentTranscript: transcriptRef.current,
        screenContext: [
          {
            label: "Listening mode",
            summary: "Customer-only call stream."
          },
          {
            label: "Feedback cadence",
            summary: "One coaching suggestion per completed customer message."
          }
        ],
        salesContext,
        conversationState: conversationStateRef.current
      });

      if (customerSuggestionRequestIdRef.current !== requestId || !isListeningRef.current) {
        return;
      }

      conversationStateRef.current = {
        summary: `${suggestion.customerType}: ${suggestion.customerIntent}`,
        lastCustomerUtterance: latestUtteranceText,
        lastCustomerIntent: suggestion.customerIntent,
        lastCustomerNeedCategory: "unclear",
        lastCustomerType: suggestion.customerType,
        confidence: suggestion.customerTypeConfidence,
        lastUpdatedISO: new Date().toISOString()
      };
      setLatestSuggestion(suggestion);
    } catch (err) {
      if (customerSuggestionRequestIdRef.current === requestId) {
        setError(err instanceof Error ? err.message : "Customer feedback generation failed");
      }
    } finally {
      if (customerSuggestionRequestIdRef.current === requestId) {
        setVoiceState(isListeningRef.current ? "listening" : "idle");
      }
    }
  }

  async function processAudioChunk(chunk: LiveAudioChunk) {
    try {
      setError(null);
      setVoiceState("transcribing");

      const transcription = await requestTranscription({
        workerBaseUrl,
        file: chunk.blob,
        mimeType: chunk.mimeType
      });

      const text = transcription.text.trim();
      const speaker = chunk.source === "mic" ? "agent" : "customer";
      const transcriptEntry = text
        ? createTranscriptEntry(speaker, text)
        : undefined;

      setAnalysisDebug({
        transcriptText: text,
        source: chunk.source === "mic" ? "mic" : "system",
        speaker,
        speakerConfidence: text ? 1 : 0,
        reason:
          chunk.source === "mic"
            ? "Device microphone mapped to representative speech."
            : "System audio mapped to customer speech.",
        ignored: !text,
        transcriptEntry
      });

      if (!text || !transcriptEntry) {
        setVoiceState(isListeningRef.current ? "listening" : "idle");
        return;
      }

      setLatestUtterance(transcriptEntry.text);
      const updatedTranscript = [...transcriptRef.current, transcriptEntry].slice(-30);
      updateTranscript(updatedTranscript);

      if (speaker === "customer") {
        await generateCustomerFeedback(transcriptEntry.text);
      }

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
    setAnalysisDebug(null);
    updateTranscript([]);
    conversationStateRef.current = null;
    customerSuggestionRequestIdRef.current = 0;

    if (!canListen) {
      setError("Customer audio capture is not available in this environment.");
      setVoiceState("error");
      return;
    }

    try {
      setVoiceState("starting");
      setIsListening(true);
      isListeningRef.current = true;

      const session = await startLiveAudioCapture({
        audioFocus: "both",
        onChunk: enqueueAudioChunk,
        onStatusChange: updateCaptureStatus,
        onWarning: (warning) => setWarnings((current) => [...current, warning]),
        onError: (_source, sourceError) => {
          setWarnings((current) => [...current, `Customer audio warning: ${sourceError.message}`]);
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
    customerSuggestionRequestIdRef.current += 1;
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

  useEffect(() => {
    const resize = () => {
      if (!shellRef.current || !window.clickySales?.resizeOverlay) {
        return;
      }

      const rect = shellRef.current.getBoundingClientRect();
      const width = Math.ceil(Math.max(420, rect.width + 24));
      const height = Math.ceil(Math.max(560, shellRef.current.scrollHeight + 24));
      void window.clickySales.resizeOverlay(width, height);
    };

    resize();

    const observer = typeof ResizeObserver !== "undefined" && shellRef.current
      ? new ResizeObserver(() => resize())
      : null;

    if (observer && shellRef.current) {
      observer.observe(shellRef.current);
    }

    return () => {
      observer?.disconnect();
    };
  }, [captureStatus, error, latestSuggestion, latestUtterance, scorecard, transcript, warnings, voiceState]);

  return (
    <div
      ref={shellRef}
      style={{
        width: 420,
        maxWidth: 420,
        margin: 12,
        padding: 14,
        borderRadius: 18,
        background: "rgba(11, 15, 23, 0.96)",
        color: "white",
        border: "1px solid rgba(64,156,255,0.4)",
        boxShadow: "0 24px 64px rgba(0,0,0,0.35)",
        fontFamily: "Segoe UI, system-ui, sans-serif"
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Clicky Sales</div>
          <div style={{ fontSize: 12, opacity: 0.72 }}>Customer-only live listening</div>
        </div>
        <div
          style={{
            fontSize: 11,
            padding: "4px 8px",
            borderRadius: 999,
            background: voiceState === "starting" || voiceState === "transcribing" || voiceState === "suggesting"
              ? "rgba(248,113,113,0.16)"
              : "rgba(255,255,255,0.08)",
            color: voiceState === "starting" || voiceState === "transcribing" || voiceState === "suggesting"
              ? "#fca5a5"
              : "rgba(255,255,255,0.78)"
          }}
        >
          {voiceState === "starting" || voiceState === "transcribing" || voiceState === "suggesting"
            ? "Listening"
            : voiceState}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto auto auto",
          gap: 8,
          marginBottom: 10
        }}
      >
        <button
          onClick={handleStartListening}
          disabled={isListening || voiceState === "starting" || voiceState === "transcribing" || voiceState === "suggesting"}
          style={{
            padding: "9px 12px",
            borderRadius: 12,
            border: "1px solid rgba(96,165,250,0.5)",
            background: "rgba(64,156,255,0.14)",
            color: "white",
            fontWeight: 700,
            cursor: "pointer",
            opacity:
              isListening || voiceState === "starting" || voiceState === "transcribing" || voiceState === "suggesting"
                ? 0.7
                : 1
          }}
        >
          {voiceState === "starting" ? "Starting..." : isListening ? "Listening..." : "Start Listening"}
        </button>
        <button
          onClick={handleStopListening}
          disabled={!isListening}
          style={{
            padding: "9px 12px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.06)",
            color: "white",
            cursor: "pointer",
            opacity: !isListening ? 0.55 : 1
          }}
        >
          Stop
        </button>
        <button
          onClick={handleGenerateScorecard}
          disabled={transcript.length === 0}
          style={{
            padding: "9px 12px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.06)",
            color: "white",
            cursor: "pointer",
            opacity: transcript.length === 0 ? 0.55 : 1
          }}
        >
          Scorecard
        </button>
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 10,
          fontSize: 12,
          opacity: 0.82
        }}
      >
        <div>
          Rep mic: <span style={{ color: statusColor(captureStatus.mic), fontWeight: 600 }}>{captureStatus.mic}</span>
        </div>
        <div>
          Customer stream:{" "}
          <span style={{ color: statusColor(captureStatus.system), fontWeight: 600 }}>{captureStatus.system}</span>
        </div>
      </div>

      {latestSuggestion && (
        <div
          style={{
            padding: 12,
            borderRadius: 14,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.08)",
            marginBottom: 10
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 12, opacity: 0.72 }}>Customer type</div>
              <div style={{ fontWeight: 700 }}>{customerTypeLabels[latestSuggestion.customerType]}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 12, opacity: 0.72 }}>Confidence</div>
              <div style={{ fontWeight: 700 }}>{Math.round(latestSuggestion.customerTypeConfidence * 100)}%</div>
            </div>
          </div>

          <div style={{ fontSize: 12, opacity: 0.72 }}>Intent</div>
          <div style={{ marginBottom: 8, lineHeight: 1.45 }}>{latestSuggestion.customerIntent}</div>

          <div style={{ fontSize: 12, opacity: 0.72 }}>Recommended info</div>
          <div style={{ marginBottom: 8, lineHeight: 1.45 }}>{latestSuggestion.recommendedInfo}</div>

          <div style={{ fontSize: 12, opacity: 0.72 }}>Say this</div>
          <div style={{ marginBottom: 8, lineHeight: 1.45 }}>{latestSuggestion.sayThis}</div>

          <div style={{ fontSize: 12, opacity: 0.72 }}>Next action</div>
          <div style={{ lineHeight: 1.45 }}>{latestSuggestion.nextAction}</div>
        </div>
      )}

      {latestUtterance && (
        <div style={{ marginBottom: 10, fontSize: 13, lineHeight: 1.45 }}>
          <div style={{ fontSize: 12, opacity: 0.72 }}>Latest customer transcript</div>
          <div>{latestUtterance}</div>
        </div>
      )}

      {analysisDebug && (
        <div
          style={{
            marginBottom: 10,
            padding: 10,
            borderRadius: 12,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.06)",
            fontSize: 12,
            lineHeight: 1.45
          }}
        >
          <div style={{ fontSize: 12, opacity: 0.72, marginBottom: 4 }}>Live analysis</div>
          <div style={{ marginBottom: 4 }}>
            <strong>Transcript:</strong> {analysisDebug.transcriptText || "No speech detected"}
          </div>
          <div style={{ marginBottom: 4 }}>
            <strong>Speaker:</strong> {analysisDebug.speaker} ({Math.round(analysisDebug.speakerConfidence * 100)}%)
          </div>
          <div>
            <strong>Reason:</strong> {analysisDebug.reason}
          </div>
        </div>
      )}

      {transcriptPreview.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, opacity: 0.72, marginBottom: 4 }}>Customer transcript</div>
          {transcriptPreview.map((entry, index) => (
            <div key={`${entry.timestampISO}-${index}`} style={{ fontSize: 12, marginBottom: 4, opacity: 0.88 }}>
              <strong>{speakerLabel(entry)}:</strong> {entry.text}
            </div>
          ))}
        </div>
      )}

      {scorecard && (
        <div
          style={{
            padding: 12,
            borderRadius: 14,
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
            marginBottom: 10
          }}
        >
          <div style={{ fontSize: 12, opacity: 0.72, marginBottom: 4 }}>Scorecard</div>
          <div style={{ lineHeight: 1.45 }}>{scorecard.summary}</div>
          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.78, lineHeight: 1.45 }}>
            {scorecard.recommendedFollowUp}
          </div>
        </div>
      )}

      {warnings.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 12, color: "#ffd166" }}>
          {warnings.slice(-2).map((warning, index) => (
            <div key={`${warning}-${index}`}>{warning}</div>
          ))}
        </div>
      )}

      {error && (
        <div style={{ marginTop: 8, fontSize: 12, color: "#ff7b72" }}>
          {error}
        </div>
      )}

      <div style={{ marginTop: 8, fontSize: 11, opacity: 0.68, lineHeight: 1.45 }}>
        Live call listens to the rep microphone and customer system audio, keeps both transcript turns, and preserves the last recognized customer need across turns.
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Overlay />);
