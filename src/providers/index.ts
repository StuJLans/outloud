import type { TTSProvider, TTSConfig } from "./types";
import { MacOSTTSProvider } from "./macos";
import { ElevenLabsProvider } from "./elevenlabs";
import { HumeProvider } from "./hume";
import { CartesiaTTSProvider } from "./cartesia";
import { ChatterboxProvider } from "./chatterbox";

export * from "./types";
export * from "./macos";
export * from "./elevenlabs";
export * from "./hume";
export * from "./cartesia";
export * from "./chatterbox";

export function createProvider(config: TTSConfig): TTSProvider {
  switch (config.provider) {
    case "macos":
      return new MacOSTTSProvider();
    case "elevenlabs":
      return new ElevenLabsProvider();
    case "hume":
      return new HumeProvider();
    case "cartesia":
      return new CartesiaTTSProvider();
    case "chatterbox":
      return new ChatterboxProvider();
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}
