#!/usr/bin/env bun
/**
 * Claude Code Stop Hook Handler
 *
 * This script is called by Claude Code's Stop hook after each response.
 * It reads the transcript, extracts the last assistant message, and speaks it.
 *
 * Hook input (via stdin):
 * {
 *   "session_id": "...",
 *   "transcript_path": "/path/to/transcript.jsonl",
 *   "cwd": "...",
 *   ...
 * }
 */

import { loadConfig } from "./config";
import { createProvider } from "./providers";
import { MacOSTTSProvider } from "./providers/macos";
import { processTextForSpeech, extractLastAssistantMessage } from "./text";

interface HookInput {
  session_id: string;
  transcript_path: string;
  cwd: string;
  hook_event_name: string;
}

async function main() {
  try {
    // Load config first to check if enabled
    const config = await loadConfig();

    if (!config.enabled) {
      process.exit(0);
    }

    // Read hook input from stdin
    const input = await Bun.stdin.text();
    if (!input.trim()) {
      console.error("[outloud] No input received");
      process.exit(0);
    }

    const hookInput: HookInput = JSON.parse(input);

    // Read transcript file
    const transcriptFile = Bun.file(hookInput.transcript_path);
    if (!(await transcriptFile.exists())) {
      console.error("[outloud] Transcript file not found");
      process.exit(0);
    }

    const transcriptContent = await transcriptFile.text();
    const lines = transcriptContent.split("\n");

    // Extract last assistant message
    const lastMessage = extractLastAssistantMessage(lines);
    if (!lastMessage) {
      // No assistant message to speak (might be tool-only response)
      process.exit(0);
    }

    // Process text for speech
    const textToSpeak = processTextForSpeech(lastMessage, {
      excludeCodeBlocks: config.excludeCodeBlocks,
      maxLength: config.maxLength,
    });

    if (!textToSpeak.trim()) {
      process.exit(0);
    }

    // Create TTS provider and speak
    const provider = createProvider(config);
    const isCloudProvider = config.provider !== "macos";

    const available = await provider.isAvailable();
    if (!available) {
      if (isCloudProvider) {
        // Cloud provider not available (no API key), fall back to macOS
        console.error(`[outloud] ${config.provider} not available, falling back to macOS`);
        const fallback = new MacOSTTSProvider();
        await fallback.speak(textToSpeak, { rate: config.rate });
      }
      process.exit(0);
    }

    try {
      await provider.speak(textToSpeak, {
        voice: config.voice,
        rate: config.rate,
      });
    } catch (speakError: any) {
      // Cloud provider failed - fall back to macOS
      // The different voice signals to the user that something went wrong
      console.error(`[outloud] ${config.provider} failed: ${speakError?.message || speakError}`);

      if (isCloudProvider) {
        try {
          const fallback = new MacOSTTSProvider();
          await fallback.speak(textToSpeak, { rate: config.rate });
        } catch {
          // Even macOS failed, give up silently
        }
      }
      process.exit(0);
    }
  } catch (error: any) {
    // Unexpected error - try macOS as last resort
    console.error(`[outloud] Error: ${error?.message || error}`);
    try {
      const fallback = new MacOSTTSProvider();
      const config = await loadConfig();
      await fallback.speak("Text to speech encountered an error", { rate: config.rate });
    } catch {
      // Give up
    }
    process.exit(0);
  }
}

main();
