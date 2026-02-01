import type { TTSProvider, TTSOptions } from "./types";
import { getKeychainPassword } from "../keychain";

export class CartesiaTTSProvider implements TTSProvider {
  name = "cartesia";
  private apiKey: string | null = null;

  async isAvailable(): Promise<boolean> {
    this.apiKey = await getKeychainPassword("cartesia-api-key");
    if (!this.apiKey) {
      this.apiKey = process.env.CARTESIA_API_KEY || null;
    }
    return this.apiKey !== null;
  }

  async speak(text: string, options?: TTSOptions): Promise<void> {
    if (!this.apiKey) {
      throw new Error("CARTESIA_API_KEY not set");
    }

    const voiceId = options?.voice || "f9836c6e-a0bd-460e-9d3c-f7299fa60f94"; // Caroline default

    const response = await fetch("https://api.cartesia.ai/tts/bytes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cartesia-Version": "2024-11-13",
        "X-API-Key": this.apiKey,
      },
      body: JSON.stringify({
        model_id: "sonic-3",
        transcript: text,
        voice: {
          mode: "id",
          id: voiceId,
        },
        output_format: {
          container: "wav",
          sample_rate: 44100,
          encoding: "pcm_s16le",
        },
        language: "en",
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Cartesia API error: ${error}`);
    }

    const audioBuffer = await response.arrayBuffer();

    // Write to temp file and play with afplay
    const tempFile = `/tmp/outloud-cartesia-${Date.now()}.wav`;
    await Bun.write(tempFile, audioBuffer);

    const proc = Bun.spawn(["afplay", tempFile], {
      stdio: ["ignore", "ignore", "ignore"],
    });
    await proc.exited;

    // Clean up
    await Bun.$`rm -f ${tempFile}`.quiet();
  }

  async stop(): Promise<void> {
    await Bun.$`pkill -9 afplay`.quiet();
  }
}

// Some popular Cartesia voices for reference
export const CARTESIA_VOICES: Record<string, string> = {
  caroline: "f9836c6e-a0bd-460e-9d3c-f7299fa60f94",
};
