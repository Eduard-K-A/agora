import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { requestCallSuggestion, requestCallSummary, requestTranscription } from "./callCopilotClient";
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
  LiveConversationState,
  SaveCallSummaryRequest,
  SaveCallSummaryResponse,
  ScreenContextItem
} from "./types";

type ElySalesBridge = {
  getWorkerBaseUrl: () => string;
  hideOverlay?: () => Promise<void>;
  resizeOverlay?: (width: number, height: number) => Promise<void>;
  getInventoryContext?: (text: string) => Promise<ScreenContextItem[]>;
  saveCallSummary?: (payload: SaveCallSummaryRequest) => Promise<SaveCallSummaryResponse>;
};

declare global {
  interface Window {
    elySales?: ElySalesBridge;
  }
}

type VoiceState = "idle" | "starting" | "listening" | "transcribing" | "suggesting" | "summarizing" | "error";
type UIState = "DASHBOARD" | "BUBBLE_LISTENING" | "BUBBLE_EXPANDED";
type AppRegionStyle = React.CSSProperties & {
  WebkitAppRegion?: "drag" | "no-drag";
};

const dragRegionStyle: AppRegionStyle = {
  WebkitAppRegion: "drag"
};

const noDragRegionStyle: AppRegionStyle = {
  WebkitAppRegion: "no-drag"
};

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
  if (status === "active") return "#16a34a";
  if (status === "starting") return "#b45309";
  if (status === "blocked" || status === "error") return "#dc2626";
  return "#6b7280";
}

function speakerLabel(entry: CallTranscriptEntry): string {
  if (entry.speaker === "agent") return "Agent";
  if (entry.speaker === "customer") return "Customer";
  return "Unknown";
}

function CaptureStatusBadge({ label, status }: { label: string; status: LiveAudioSourceStatus }) {
  const isLoading = status === "starting";
  const isError = status === "blocked" || status === "error";
  const isActive = status === "active";

  return (
    <div
      className={`capture-status${isLoading ? " is-loading" : ""}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        minHeight: 29,
        padding: "6px 10px",
        borderRadius: 999,
        background: isError
          ? "rgba(254,226,226,0.72)"
          : isLoading
            ? "rgba(254,243,199,0.66)"
            : "rgba(255,255,255,0.55)",
        border: isError
          ? "1px solid rgba(248,113,113,0.2)"
          : "1px solid rgba(255,255,255,0.62)",
        color: "#64748b",
        fontSize: 12,
        lineHeight: 1.2,
        fontWeight: 500
      }}
    >
      <span
        className="capture-status-dot"
        style={{
          width: 7,
          height: 7,
          flexShrink: 0,
          borderRadius: 999,
          background: statusColor(status),
          boxShadow: isActive
            ? "0 0 8px rgba(34,197,94,0.72)"
            : isLoading
              ? "0 0 8px rgba(245,158,11,0.38)"
              : isError
                ? "0 0 7px rgba(239,68,68,0.32)"
                : "none"
        }}
      />
      <span>{label}:</span>
      <span style={{ color: isError ? "#b91c1c" : "#334155", fontWeight: 600, textTransform: "capitalize" }}>
        {status}
      </span>
    </div>
  );
}

function Overlay() {
  const appBridge = window.elySales;
  const workerBaseUrl = appBridge?.getWorkerBaseUrl() ?? "";
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [isListening, setIsListening] = useState(false);
  const [captureStatus, setCaptureStatus] = useState<LiveAudioCaptureStatus>(initialCaptureStatus);
  const [latestSuggestion, setLatestSuggestion] = useState<CallSuggestion | null>(null);
  const [callSummary, setCallSummary] = useState<CallScorecard | null>(null);
  const [savedSummary, setSavedSummary] = useState<SaveCallSummaryResponse | null>(null);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
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
      companyName: "Ely Sales Agent",
      productName: "Ely Sales Agent",
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
  const statusLabel =
    voiceState === "starting" || voiceState === "transcribing" || voiceState === "suggesting"
      ? "Listening"
      : voiceState === "summarizing"
        ? "Summarizing"
        : voiceState;
  const statusIsActive = voiceState !== "idle" && voiceState !== "error";
  const UI_STATE: UIState = !isListening
    ? "DASHBOARD"
    : latestSuggestion || callSummary || error || warnings.length > 0
      ? "BUBBLE_EXPANDED"
      : "BUBBLE_LISTENING";
  const isSphereActive = captureStatus.mic === "active" || captureStatus.system === "active";

  function updateTranscript(entries: CallTranscriptEntry[]) {
    transcriptRef.current = entries;
    setTranscript(entries);
  }

  function updateCaptureStatus(status: LiveAudioCaptureStatus) {
    setCaptureStatus(status);
  }

  function handleHideWindow() {
    void appBridge?.hideOverlay?.();
  }

  async function loadInventoryContext(text: string): Promise<ScreenContextItem[]> {
    if (!appBridge?.getInventoryContext) {
      return [];
    }

    try {
      return await appBridge.getInventoryContext(text);
    } catch (err) {
      setWarnings((current) => [
        ...current,
        err instanceof Error ? `Inventory context unavailable: ${err.message}` : "Inventory context unavailable."
      ]);
      return [];
    }
  }

  async function generateCustomerFeedback(latestUtteranceText: string) {
    const requestId = customerSuggestionRequestIdRef.current + 1;
    customerSuggestionRequestIdRef.current = requestId;

    try {
      setVoiceState("suggesting");
      const inventoryContext = await loadInventoryContext(latestUtteranceText);
      const screenContext: ScreenContextItem[] = [
        {
          label: "Listening mode",
          summary: "Customer-only call stream."
        },
        {
          label: "Feedback cadence",
          summary: "One coaching suggestion per completed customer message."
        },
        ...inventoryContext
      ];
      const suggestion = await requestCallSuggestion({
        workerBaseUrl,
        mode: "call_copilot",
        latestUtterance: latestUtteranceText,
        recentTranscript: transcriptRef.current,
        screenContext,
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
    setCallSummary(null);
    setSavedSummary(null);
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

  async function handleGenerateSummary() {
    if (transcript.length === 0 || isListening || isGeneratingSummary) return;

    setError(null);
    setIsGeneratingSummary(true);
    setVoiceState("summarizing");
    try {
      const result = await requestCallSummary({
        workerBaseUrl,
        recentTranscript: transcript
      });
      setCallSummary(result);

      if (appBridge?.saveCallSummary) {
        const saved = await appBridge.saveCallSummary({
          summary: result,
          transcript,
          createdAtISO: new Date().toISOString()
        });
        setSavedSummary(saved);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Summary generation failed");
    } finally {
      setIsGeneratingSummary(false);
      setVoiceState(isListeningRef.current ? "listening" : "idle");
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
      if (!shellRef.current || !appBridge?.resizeOverlay) {
        return;
      }

      const rect = shellRef.current.getBoundingClientRect();
      const width = Math.ceil(Math.max(420, rect.width + 24));
      const height = Math.ceil(Math.max(560, shellRef.current.scrollHeight + 24));
      void appBridge.resizeOverlay(width, height);
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
  }, [callSummary, captureStatus, error, latestSuggestion, latestUtterance, transcript, warnings, voiceState]);

  return (
    <div
      ref={shellRef}
      className={`overlay-shell ${UI_STATE === "DASHBOARD" ? "is-dashboard" : "is-bubble"}`}
      data-ui-state={UI_STATE}
      style={{
        width: UI_STATE === "DASHBOARD" ? 420 : UI_STATE === "BUBBLE_EXPANDED" ? 352 : 124,
        maxWidth: UI_STATE === "DASHBOARD" ? 420 : UI_STATE === "BUBBLE_EXPANDED" ? 352 : 124,
        height: "auto",
        minHeight: "fit-content",
        margin: 12,
        padding: UI_STATE === "DASHBOARD" ? 24 : 0,
        paddingBottom: UI_STATE === "DASHBOARD" ? 28 : 0,
        borderRadius: UI_STATE === "DASHBOARD" ? 20 : 999,
        background: UI_STATE === "DASHBOARD" ? "rgba(255, 255, 255, 0.6)" : "transparent",
        color: "#1f2937",
        border: UI_STATE === "DASHBOARD" ? "1px solid rgba(255,255,255,0.4)" : "1px solid transparent",
        boxShadow: UI_STATE === "DASHBOARD" ? "0 10px 30px rgba(0,0,0,0.08)" : "none",
        backdropFilter: UI_STATE === "DASHBOARD" ? "blur(20px)" : "none",
        WebkitBackdropFilter: UI_STATE === "DASHBOARD" ? "blur(20px)" : "none",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        overflowWrap: "break-word",
        transition: "all 0.4s cubic-bezier(0.25, 1, 0.5, 1)"
      }}
    >
      {UI_STATE === "DASHBOARD" ? (
        <div className="dashboard-view">
      <div style={{
        display: "grid",
        gridTemplateColumns: "34px minmax(0, 1fr) auto",
        alignItems: "center",
        gap: 12,
        marginBottom: 18,
        ...dragRegionStyle
      }}>
        <button
          type="button"
          className="ui-button"
          style={{
            width: 32,
            height: 32,
            padding: 0,
            border: "1px solid rgba(255,255,255,0.68)",
            borderRadius: 999,
            background: "rgba(255,255,255,0.46)",
            color: "#6b7280",
            boxShadow: "0 3px 12px rgba(15,23,42,0.06)",
            cursor: "pointer",
            fontSize: 19,
            lineHeight: 1,
            ...noDragRegionStyle
          }}
          aria-label="Menu"
          title="Menu"
        >
          {"\u2261"}
        </button>
        <div style={{ minWidth: 0, overflowWrap: "break-word" }}>
          <div style={{ fontSize: 18, lineHeight: 1.25, fontWeight: 700, color: "#334155" }}>
            Ely Sales Agent
          </div>
          <div style={{ marginTop: 2, fontSize: 12, lineHeight: 1.35, color: "#94a3b8" }}>
            Customer-only live listening
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, ...noDragRegionStyle }}>
          <div
            style={{
              marginRight: 2,
              padding: "5px 9px",
              borderRadius: 999,
              background: statusIsActive ? "rgba(219,234,254,0.7)" : voiceState === "error" ? "rgba(254,226,226,0.84)" : "rgba(229,231,235,0.7)",
              color: statusIsActive ? "#2563eb" : voiceState === "error" ? "#dc2626" : "#4b5563",
              fontSize: 11,
              lineHeight: 1,
              fontWeight: 600,
              textTransform: "capitalize",
              whiteSpace: "nowrap",
              transition: "all 0.25s cubic-bezier(0.25, 0.8, 0.25, 1)"
            }}
          >
            {statusLabel}
          </div>
          <button
            type="button"
            className="ui-button"
            onClick={handleHideWindow}
            style={{
              width: 28,
              height: 28,
              padding: 0,
              border: "1px solid rgba(255,255,255,0.68)",
              borderRadius: 999,
              background: "rgba(255,255,255,0.48)",
              color: "#64748b",
              boxShadow: "0 3px 12px rgba(15,23,42,0.06)",
              cursor: "pointer",
              lineHeight: 1,
              ...noDragRegionStyle
            }}
            aria-label="Minimize to tray"
            title="Minimize to tray"
          >
            -
          </button>
          <button
            type="button"
            className="ui-button window-close-button"
            onClick={handleHideWindow}
            style={{
              width: 28,
              height: 28,
              padding: 0,
              border: "1px solid rgba(255,255,255,0.68)",
              borderRadius: 999,
              background: "rgba(255,255,255,0.48)",
              color: "#64748b",
              boxShadow: "0 3px 12px rgba(15,23,42,0.06)",
              cursor: "pointer",
              lineHeight: 1,
              ...noDragRegionStyle
            }}
            aria-label="Close to tray"
            title="Close to tray"
          >
            x
          </button>
        </div>
      </div>

      <div
        style={{
          marginBottom: 14,
          padding: 12,
          borderRadius: 16,
          background: "rgba(255,255,255,0.34)",
          border: "1px solid rgba(255,255,255,0.5)",
          boxShadow: "inset 0 1px 2px rgba(255,255,255,0.72), 0 6px 18px rgba(15,23,42,0.04)",
          ...noDragRegionStyle
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.45fr) minmax(0, 0.9fr)",
            gap: 8,
            marginBottom: 12
          }}
        >
          <button
            type="button"
            className={`ui-button primary-control listening-toggle${isListening ? " is-active" : ""}`}
            onClick={isListening ? handleStopListening : handleStartListening}
            disabled={voiceState === "starting" || voiceState === "transcribing" || voiceState === "suggesting"}
            aria-pressed={isListening}
            style={{
              minHeight: 40,
              padding: "9px 12px",
              borderRadius: 12,
              border: "1px solid rgba(147,197,253,0.46)",
              background: "rgba(239,246,255,0.9)",
              color: "#2563eb",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.94), 0 7px 18px rgba(59,130,246,0.12)",
              fontWeight: 650,
              cursor: "pointer",
              opacity:
                voiceState === "starting" || voiceState === "transcribing" || voiceState === "suggesting"
                  ? 0.66
                  : 1,
              ...noDragRegionStyle
            }}
          >
            {voiceState === "starting" ? "Starting..." : isListening ? "Stop Listening" : "Start Listening"}
          </button>
          <button
            type="button"
            className="ui-button secondary-control"
            onClick={handleGenerateSummary}
            disabled={transcript.length === 0 || isListening || isGeneratingSummary}
            style={{
              minHeight: 40,
              padding: "9px 12px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.62)",
              background: "rgba(241,245,249,0.54)",
              color: "#475569",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.72)",
              cursor: "pointer",
              opacity: transcript.length === 0 || isListening || isGeneratingSummary ? 0.48 : 1,
              ...noDragRegionStyle
            }}
          >
            {isGeneratingSummary ? "Summarizing..." : "Summary"}
          </button>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <CaptureStatusBadge label="Rep mic" status={captureStatus.mic} />
          <CaptureStatusBadge label="Customer stream" status={captureStatus.system} />
        </div>
      </div>

      {latestSuggestion && (
        <div
          style={{
            padding: 12,
            borderRadius: 14,
            background: "rgba(255,255,255,0.48)",
            border: "1px solid rgba(255,255,255,0.62)",
            boxShadow: "0 5px 16px rgba(15,23,42,0.04)",
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
            background: "rgba(248,250,252,0.48)",
            border: "1px solid rgba(255,255,255,0.58)",
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

      {callSummary && (
        <div
          style={{
            padding: 12,
            borderRadius: 14,
            background: "rgba(255,255,255,0.48)",
            border: "1px solid rgba(255,255,255,0.62)",
            boxShadow: "0 5px 16px rgba(15,23,42,0.04)",
            marginBottom: 10
          }}
        >
          <div style={{ fontSize: 12, opacity: 0.72, marginBottom: 4 }}>Call summary</div>
          <div style={{ lineHeight: 1.45 }}>{callSummary.summary}</div>
          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.78, lineHeight: 1.45 }}>
            {callSummary.recommendedFollowUp}
          </div>
          {savedSummary && (
            <div style={{ marginTop: 8, fontSize: 11, opacity: 0.62 }}>
              Saved to SQLite summary #{savedSummary.id}
            </div>
          )}
        </div>
      )}

      {warnings.length > 0 && (
        <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 10, background: "rgba(254,243,199,0.54)", fontSize: 12, color: "#92400e" }}>
          {warnings.slice(-2).map((warning, index) => (
            <div key={`${warning}-${index}`}>{warning}</div>
          ))}
        </div>
      )}

      {error && (
        <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 10, background: "rgba(254,226,226,0.68)", fontSize: 12, color: "#b91c1c" }}>
          {error}
        </div>
      )}

      <div style={{ marginTop: 8, fontSize: 11, opacity: 0.68, lineHeight: 1.45 }}>
        Live call listens to the rep microphone and customer system audio, keeps both transcript turns, and preserves the last recognized customer need across turns.
      </div>
        </div>
      ) : (
        <div className={`bubble-stage ${UI_STATE === "BUBBLE_EXPANDED" ? "is-expanded" : ""}`}>
          <div
            className={`floating-sphere ${isSphereActive ? "is-active" : "is-idle"}`}
            style={dragRegionStyle}
          >
            <div className="sphere-aura" />
            <div className="sphere-core">
              <span className="sphere-status-dot" />
              <span className="sphere-label">Ely</span>
              <span className="sphere-state">{statusLabel}</span>
            </div>
            <button
              type="button"
              className="ui-button sphere-stop listening-toggle is-active"
              style={noDragRegionStyle}
              onClick={isListening ? handleStopListening : handleStartListening}
              aria-pressed={isListening}
              aria-label="Stop listening"
              title="Stop listening"
            >
              Stop
            </button>
          </div>

          {UI_STATE === "BUBBLE_EXPANDED" && (
            <div className="bubble-response-panel" style={noDragRegionStyle}>
              <div className="response-header">
                <div>
                  <div className="response-eyebrow">Live insight</div>
                  <div className="response-title">Customer guidance</div>
                </div>
              </div>

              {latestSuggestion && (
                <div key={`${latestSuggestion.sayThis}-${latestSuggestion.nextAction}`} className="response-stack response-refresh">
                  <div className="response-meta">
                    <span className="response-chip">{customerTypeLabels[latestSuggestion.customerType]}</span>
                    <span className="response-confidence">
                      {Math.round(latestSuggestion.customerTypeConfidence * 100)}% confidence
                    </span>
                  </div>
                  <div className="response-block">
                    <span>Intent</span>
                    <p>{latestSuggestion.customerIntent}</p>
                  </div>
                  <div className="response-block">
                    <span>Talking point</span>
                    <p>{latestSuggestion.recommendedInfo}</p>
                  </div>
                  <div className="response-block is-highlight">
                    <span>Say this</span>
                    <p>{latestSuggestion.sayThis}</p>
                  </div>
                  <div className="response-block">
                    <span>Next action</span>
                    <p>{latestSuggestion.nextAction}</p>
                  </div>
                </div>
              )}

              {callSummary && (
                <div key={callSummary.summary} className="response-block is-summary response-refresh">
                  <span>Scorecard summary</span>
                  <p>{callSummary.summary}</p>
                  <p>{callSummary.recommendedFollowUp}</p>
                </div>
              )}

              {warnings.length > 0 && (
                <div className="response-alert is-warning">{warnings.slice(-2).join(" ")}</div>
              )}
              {error && <div className="response-alert is-error">{error}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Overlay />);
