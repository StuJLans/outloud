import type { TTSProvider, TTSOptions } from "./types";
import { getKeychainPassword } from "../keychain";

export class ElevenLabsProvider implements TTSProvider {
  name = "elevenlabs";
  private apiKey: string | null = null;

  async isAvailable(): Promise<boolean> {
    // Try Keychain first, then fall back to environment variable
    this.apiKey = await getKeychainPassword("elevenlabs-api-key");
    if (!this.apiKey) {
      this.apiKey = process.env.ELEVEN_API_KEY || null;
    }
    return this.apiKey !== null;
  }

  async speak(text: string, options?: TTSOptions): Promise<void> {
    if (!this.apiKey) {
      throw new Error("ELEVEN_API_KEY not set");
    }

    // Resolve voice name to ID, or use ID directly
    let voiceId = options?.voice || "rachel";
    const voiceLower = voiceId.toLowerCase();
    if (voiceLower in ELEVENLABS_VOICES) {
      voiceId = ELEVENLABS_VOICES[voiceLower as keyof typeof ELEVENLABS_VOICES];
    }

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Eleven Labs API error: ${error}`);
    }

    // Get audio data and play it
    const audioData = await response.arrayBuffer();
    const tempFile = `/tmp/elevenlabs_${Date.now()}.mp3`;

    await Bun.write(tempFile, audioData);

    // Play with afplay (macOS)
    const proc = Bun.spawn(["afplay", tempFile], {
      stdout: "ignore",
      stderr: "ignore",
    });
    await proc.exited;

    // Cleanup
    await Bun.$`rm ${tempFile}`.quiet();
  }

  async stop(): Promise<void> {
    try {
      await Bun.$`pkill -x afplay`.quiet();
    } catch {
      // Ignore if no process to kill
    }
  }
}

// Common Eleven Labs voice IDs
export const ELEVENLABS_VOICES = {
  rachel: "21m00Tcm4TlvDq8ikWAM", // American female, calm
  domi: "AZnzlk1XvdvUeBnXmlld", // American female, strong
  bella: "EXAVITQu4vr4xnSDxMaL", // American female, soft
  antoni: "ErXwobaYiN019PkySvjV", // American male, well-rounded
  elli: "MF3mGyEYCl7XYWbV9V6O", // American female, young
  josh: "TxGEqnHWrfWFTfGW9XjX", // American male, deep
  arnold: "VR6AewLTigWG4xSOukaG", // American male, crisp
  adam: "pNInz6obpgDQGcFmaJgB", // American male, deep
  sam: "yoZ06aMxZJJ28mfd3POQ", // American male, raspy
};
