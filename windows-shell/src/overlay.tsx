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
      minimizeOverlay?: () => Promise<void>;
      hideOverlay?: () => Promise<void>;
      resizeOverlay?: (width: number, height: number) => Promise<void>;
    };
    __TAURI__?: unknown;
  }
}

type VoiceState = "idle" | "recording" | "transcribing" | "suggesting" | "error";
type AppRegionStyle = React.CSSProperties & {
  WebkitAppRegion?: "drag" | "no-drag";
};

const noDragRegionStyle: AppRegionStyle = {
  WebkitAppRegion: "no-drag"
};

const dragRegionStyle: AppRegionStyle = {
  WebkitAppRegion: "drag"
};

function Overlay() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const workerBaseUrl = window.clickySales?.getWorkerBaseUrl() ?? "";
  const [mode, setMode] = useState<RealtimeVoiceMode>("openai_direct");
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [latestSuggestion, setLatestSuggestion] = useState<CallSuggestion | null>(null);
  const [scorecard, setScorecard] = useState<CallScorecard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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

  function handleMinimize(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    void (window.clickySales?.hideOverlay?.() ?? window.clickySales?.minimizeOverlay?.());
  }

  function handleClose(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    void (window.clickySales?.hideOverlay?.() ?? window.clickySales?.minimizeOverlay?.());
  }

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
    setNotice(null);
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
          setNotice("Suggestion ready.");
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

  async function handleMicToggle() {
    if (voiceState === "recording") {
      await handleStopListening();
      return;
    }

    if (voiceState === "idle" || voiceState === "error") {
      await handleStartListening();
    }
  }

  async function handleGenerateScorecard() {
    if (transcript.length === 0) return;

    setError(null);
    setNotice(null);
    try {
      const result = await requestScorecard({
        workerBaseUrl,
        recentTranscript: transcript
      });
      setScorecard(result);
      setNotice("Scorecard generated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scorecard generation failed");
    }
  }

  useEffect(() => {
    return () => {
      void stopRecorder();
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const resizeOverlay = window.clickySales?.resizeOverlay;
    if (!container || !resizeOverlay) return;

    const currentContainer: HTMLDivElement = container;
    const syncWindowSize = () => {
      const rect = currentContainer.getBoundingClientRect();
      void resizeOverlay(rect.width + 24, rect.height + 24);
    };

    const observer = new ResizeObserver(syncWindowSize);
    observer.observe(currentContainer);
    syncWindowSize();

    return () => observer.disconnect();
  }, [latestUtterance, latestSuggestion, scorecard, transcriptPreview.length, error, notice, voiceState]);

  return (
    <div ref={containerRef} className="overlay-shell" style={{
      width: 380,
      maxWidth: "calc(100vw - 24px)",
      height: "fit-content",
      minHeight: "fit-content",
      margin: 12,
      padding: 16,
      paddingBottom: 32,
      borderRadius: 22,
      background: "rgba(240, 240, 242, 0.95)",
      color: "#111827",
      border: "1px solid rgba(255,255,255,0.72)",
      boxShadow: "0 24px 60px rgba(15,23,42,0.16), inset 0 1px 0 rgba(255,255,255,0.9)",
      backdropFilter: "blur(30px) saturate(180%)",
      WebkitBackdropFilter: "blur(30px) saturate(180%)",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      overflowX: "hidden",
      overflowY: "auto",
      transition: "all 0.2s ease-in-out"
    }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: "44px 1fr auto",
        alignItems: "center",
        gap: 10,
        minHeight: 34,
        marginBottom: 16,
        cursor: "grab",
        ...dragRegionStyle
      }}>
        <button
          type="button"
          className="ui-button"
          style={{
            width: 30,
            height: 30,
            border: 0,
            borderRadius: 999,
            background: "rgba(255,255,255,0.42)",
            color: "#6b7280",
            cursor: "pointer",
            fontSize: 20,
            lineHeight: 1,
            boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.7)",
            ...noDragRegionStyle
          }}
          aria-label="Open menu"
          title="Menu"
        >
          ≡
        </button>
        <strong style={{
          justifySelf: "center",
          minWidth: 0,
          color: "#374151",
          fontSize: 17,
          fontWeight: 650,
          lineHeight: 1.2,
          letterSpacing: 0,
          whiteSpace: "nowrap"
        }}>
          Clicky Sales
        </strong>
        <div style={{ display: "flex", alignItems: "center", gap: 8, ...noDragRegionStyle }}>
          <button
            type="button"
            className="ui-button"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={handleMinimize}
            style={{
              width: 28,
              height: 28,
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.72)",
              background: "rgba(255,255,255,0.58)",
              color: "#6b7280",
              cursor: "pointer",
              lineHeight: 1,
              boxShadow: "0 4px 12px rgba(15,23,42,0.08)",
              ...noDragRegionStyle
            }}
            aria-label="Minimize"
            title="Minimize"
          >
            -
          </button>
          <button
            type="button"
            className="ui-button"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={handleClose}
            style={{
              width: 28,
              height: 28,
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.72)",
              background: "rgba(255,255,255,0.58)",
              color: "#6b7280",
              cursor: "pointer",
              lineHeight: 1,
              boxShadow: "0 4px 12px rgba(15,23,42,0.08)",
              ...noDragRegionStyle
            }}
            aria-label="Close to tray"
            title="Close to tray"
          >
            x
          </button>
        </div>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 3,
        marginBottom: 14,
        padding: 3,
        borderRadius: 999,
        background: "rgba(229,231,235,0.72)",
        boxShadow: "inset 0 1px 2px rgba(15,23,42,0.08)",
        ...noDragRegionStyle
      }}>
        <button
          type="button"
          className="ui-button"
          style={{
            minHeight: 30,
            border: 0,
            borderRadius: 999,
            background: mode === "openai_direct" ? "rgba(255,255,255,0.96)" : "transparent",
            color: mode === "openai_direct" ? "#111827" : "#6b7280",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: mode === "openai_direct" ? 650 : 500,
            boxShadow: mode === "openai_direct" ? "0 4px 14px rgba(15,23,42,0.12)" : "none",
            transition: "all 0.2s ease-in-out",
            ...noDragRegionStyle
          }}
          onClick={() => setMode("openai_direct")}
        >
          Direct
        </button>
        <button
          type="button"
          className="ui-button"
          style={{
            minHeight: 30,
            border: 0,
            borderRadius: 999,
            background: mode === "agora_bot" ? "rgba(255,255,255,0.96)" : "transparent",
            color: mode === "agora_bot" ? "#111827" : "#6b7280",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: mode === "agora_bot" ? 650 : 500,
            boxShadow: mode === "agora_bot" ? "0 4px 14px rgba(15,23,42,0.12)" : "none",
            transition: "all 0.2s ease-in-out",
            ...noDragRegionStyle
          }}
          onClick={() => setMode("agora_bot")}
        >
          Agora Bot
        </button>
      </div>

      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 14,
        marginBottom: 14,
        padding: "22px 18px",
        paddingBottom: 24,
        height: "fit-content",
        minHeight: "fit-content",
        borderRadius: 18,
        background: "rgba(255,255,255,0.86)",
        border: "1px solid rgba(255,255,255,0.86)",
        boxShadow: "inset 0 1px 2px rgba(255,255,255,0.92), 0 10px 28px rgba(15,23,42,0.08)",
        overflow: "visible",
        ...noDragRegionStyle
      }}>
        <button
          type="button"
          className={`ui-button mic-toggle${voiceState === "recording" ? " is-recording" : ""}`}
          style={{
            minWidth: 160,
            minHeight: 44,
            padding: "0 24px",
            border: voiceState === "recording" ? "1px solid rgba(248,113,113,0.5)" : "1px solid rgba(147,197,253,0.7)",
            borderRadius: 999,
            background: voiceState === "recording"
              ? "linear-gradient(180deg, rgba(254,242,242,1), rgba(229,231,235,0.96))"
              : "linear-gradient(180deg, rgba(239,246,255,1), rgba(219,234,254,0.96))",
            color: voiceState === "recording" ? "#b91c1c" : "#1d4ed8",
            cursor: voiceState === "transcribing" || voiceState === "suggesting" ? "not-allowed" : "pointer",
            fontSize: 15,
            fontWeight: 700,
            boxShadow: voiceState === "recording"
              ? "0 10px 24px rgba(248,113,113,0.24), inset 0 1px 0 rgba(255,255,255,0.9)"
              : "0 10px 24px rgba(96,165,250,0.34), inset 0 1px 0 rgba(255,255,255,0.9)",
            opacity: voiceState === "transcribing" || voiceState === "suggesting" ? 0.76 : 1,
            transition: "all 0.2s ease-in-out",
            ...noDragRegionStyle
          }}
          onClick={handleMicToggle}
          disabled={voiceState === "transcribing" || voiceState === "suggesting"}
        >
          {voiceState === "recording" ? "Stop Mic" : "Start Mic"}
        </button>

        <div style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          padding: "6px 11px",
          borderRadius: 999,
          background: "rgba(243,244,246,0.92)",
          color: "#6b7280",
          fontSize: 12,
          fontWeight: 600,
          textTransform: "capitalize",
          boxShadow: "inset 0 0 0 1px rgba(229,231,235,0.9)",
          transition: "all 0.2s ease-in-out"
        }}>
          <span style={{
            width: 7,
            height: 7,
            borderRadius: 999,
            background: voiceState === "recording" || voiceState === "error" ? "#ef4444" : "#22c55e",
            boxShadow: voiceState === "recording" || voiceState === "error" ? "0 0 0 3px rgba(239,68,68,0.12)" : "0 0 0 3px rgba(34,197,94,0.12)",
            transition: "all 0.2s ease-in-out"
          }} />
          Status: {voiceState === "recording" ? "Recording" : "Idle"}
        </div>

        <div style={{
          width: "100%",
          color: "#4b5563",
          fontSize: 13,
          lineHeight: 1.5,
          textAlign: "center",
          overflowWrap: "break-word"
        }}>
          {latestUtterance || "Start mic to capture a transcript and get live coaching."}
        </div>

        <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 8 }}>
          <button style={{
            padding: "7px 12px",
            border: "1px solid rgba(209,213,219,0.9)",
            borderRadius: 999,
            background: "rgba(249,250,251,0.86)",
            color: "#6b7280",
            cursor: transcript.length === 0 ? "not-allowed" : "pointer",
            opacity: transcript.length === 0 ? 0.5 : 1,
            ...noDragRegionStyle
          }} className="ui-button" onClick={handleGenerateScorecard} disabled={transcript.length === 0}>
            Scorecard
          </button>
        </div>
      </div>

      {latestSuggestion && (
        <div style={{ marginTop: 10, fontSize: 13 }}>
          <div style={{ opacity: 0.7 }}>Suggestion</div>
          <div style={{ lineHeight: 1.45, overflowWrap: "anywhere" }}>{latestSuggestion.sayThis}</div>
          <div style={{ opacity: 0.75, marginTop: 6, overflowWrap: "anywhere" }}>{latestSuggestion.nextAction}</div>
        </div>
      )}

      {scorecard && (
        <div style={{ marginTop: 10, fontSize: 13 }}>
          <div style={{ opacity: 0.7 }}>Scorecard</div>
          <div style={{ lineHeight: 1.45, overflowWrap: "anywhere" }}>{scorecard.summary}</div>
          <div style={{ opacity: 0.75, marginTop: 6, overflowWrap: "anywhere" }}>{scorecard.recommendedFollowUp}</div>
        </div>
      )}

      {transcriptPreview.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>
          <div>Transcript</div>
          {transcriptPreview.map((entry, index) => (
            <div key={`${entry.timestampISO}-${index}`} style={{ overflowWrap: "break-word" }}>- {entry.text}</div>
          ))}
        </div>
      )}
      {transcriptPreview.length === 0 && !latestUtterance && !latestSuggestion && !scorecard && !error && (
        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.65 }}>
          Start mic to capture a transcript and get live coaching.
        </div>
      )}

      {(voiceState === "transcribing" || voiceState === "suggesting") && (
        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
          Processing...
        </div>
      )}

      {notice && (
        <div style={{ marginTop: 10, fontSize: 12, color: "#6ee7b7" }}>
          {notice}
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
