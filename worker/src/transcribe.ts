import Groq from "groq-sdk";
import type { Env, TranscriptionResponse } from "./types";

function createGroqClient(env: Env): Groq {
  if (!env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is missing");
  }

  return new Groq({ apiKey: env.GROQ_API_KEY });
}

export async function transcribeAudio(file: File, env: Env): Promise<TranscriptionResponse> {
  const client = createGroqClient(env);
  const normalizedFile =
    file.type && file.type.startsWith("audio/")
      ? file
      : new File([file], file.name || "audio.webm", {
          type: file.type.includes("opus") ? "audio/webm;codecs=opus" : "audio/webm"
        });
  const transcription = await client.audio.transcriptions.create({
    file: normalizedFile,
    model: "whisper-large-v3-turbo",
    response_format: "text",
    temperature: 0
  });

  return {
    text: typeof transcription === "string" ? transcription : String(transcription)
  };
}
