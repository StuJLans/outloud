export interface TTSProvider {
  name: string;
  isAvailable(): Promise<boolean>;
  speak(text: string, options?: TTSOptions): Promise<void>;
  stop(): Promise<void>;
}

export interface TTSOptions {
  voice?: string;
  rate?: number; // Words per minute or relative speed
  volume?: number; // 0-1
}

export interface TTSConfig {
  enabled: boolean;
  provider: "macos" | "elevenlabs" | "hume" | "cartesia";
  voice?: string;
  rate?: number;
  maxLength?: number; // Max characters to speak (for very long responses)
  excludeCodeBlocks?: boolean; // Skip code blocks in speech
  voices?: {
    macos?: string;
    elevenlabs?: string;
    hume?: string;
    cartesia?: string;
  };
}

export const defaultConfig: TTSConfig = {
  enabled: true,
  provider: "macos",
  rate: 200,
  maxLength: 5000,
  excludeCodeBlocks: true,
};
