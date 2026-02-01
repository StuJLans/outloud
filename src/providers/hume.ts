import type { TTSProvider, TTSOptions } from "./types";
import { getKeychainPassword } from "../keychain";

export class HumeProvider implements TTSProvider {
  name = "hume";
  private apiKey: string | null = null;

  async isAvailable(): Promise<boolean> {
    this.apiKey = await getKeychainPassword("hume-api-key");
    if (!this.apiKey) {
      this.apiKey = process.env.HUME_API_KEY || null;
    }
    return this.apiKey !== null;
  }

  async speak(text: string, options?: TTSOptions): Promise<void> {
    if (!this.apiKey) {
      throw new Error("HUME_API_KEY not set");
    }

    // Default to "Ava Song" - a calm, natural voice
    const voiceName = options?.voice || "Ava Song";

    // Determine if voice is an ID (UUID format) or name
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(voiceName);

    const voiceConfig = isUuid
      ? { id: voiceName }
      : { name: voiceName, provider: "HUME_AI" as const };

    const response = await fetch("https://api.hume.ai/v0/tts/stream/json", {
      method: "POST",
      headers: {
        "X-Hume-Api-Key": this.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        version: "2",
        utterances: [
          {
            text,
            voice: voiceConfig,
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Hume API error: ${error}`);
    }

    // Collect all audio chunks from streaming response
    const audioChunks: Buffer[] = [];
    const reader = response.body?.getReader();

    if (!reader) {
      throw new Error("No response body");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Parse NDJSON (newline-delimited JSON)
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const chunk = JSON.parse(line);
          if (chunk.audio) {
            audioChunks.push(Buffer.from(chunk.audio, "base64"));
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }

    // Process remaining buffer
    if (buffer.trim()) {
      try {
        const chunk = JSON.parse(buffer);
        if (chunk.audio) {
          audioChunks.push(Buffer.from(chunk.audio, "base64"));
        }
      } catch {
        // Skip
      }
    }

    if (audioChunks.length === 0) {
      throw new Error("No audio received from Hume");
    }

    // Combine and play audio
    const audioData = Buffer.concat(audioChunks);
    const tempFile = `/tmp/hume_${Date.now()}.mp3`;

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

// Some built-in Hume voices
export const HUME_VOICES = {
  "ava": "Ava Song",
  "donovan": "Donovan Sinclair",
  "vince": "Vince Douglas",
  "stella": "Stella Goldberg",
  "finn": "Finn Calloway",
};
