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
  const transcription = await client.audio.transcriptions.create({
    file,
    model: "whisper-large-v3-turbo",
    response_format: "text",
    temperature: 0
  });

  return {
    text: typeof transcription === "string" ? transcription : String(transcription)
  };
}
