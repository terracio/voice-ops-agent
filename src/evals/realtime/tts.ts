import { REALTIME_RUNTIME_CONFIG } from "../../realtime/config/runtimeConfig";

export type OpenAiSpeechPcmOptions = {
  apiKey: string;
  input: string;
  instructions?: string;
  model: string;
  speed?: number;
  voice: string;
};

export async function synthesizeOpenAiSpeechPcm(
  options: OpenAiSpeechPcmOptions
): Promise<ArrayBuffer> {
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: options.model,
      voice: options.voice,
      input: options.input,
      instructions: options.instructions,
      response_format: REALTIME_RUNTIME_CONFIG.evalReplay.tts.responseFormat,
      speed: options.speed
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `OpenAI speech synthesis failed with ${response.status}: ${detail.slice(0, 240)}`
    );
  }

  return response.arrayBuffer();
}
