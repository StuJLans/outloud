#!/usr/bin/env bun
/**
 * OutLoud - Stop Hook Handler
 *
 * Claude Code writes the transcript BEFORE the Stop hook fires.
 * We simply read the last text block and speak it (if not already spoken).
 * Spawns a background process to avoid blocking Claude Code.
 */

import { loadConfig, getConfigDir } from "./config";
import { createProvider } from "./providers";
import { MacOSTTSProvider } from "./providers/macos";
import { processTextForSpeech } from "./text";
import { join } from "path";
import { createHash } from "crypto";

interface HookInput {
  session_id: string;
  transcript_path: string;
  cwd: string;
}

interface LastAssistantInfo {
  text: string | null;
  hasToolUse: boolean;
}

// Get the last assistant message info from transcript
function getLastAssistantInfo(lines: string[]): LastAssistantInfo {
  let lastText: string | null = null;
  let lastHasToolUse = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const entry = JSON.parse(trimmed);
      if (entry.type === "assistant" && entry.message?.content) {
        // Reset for each new assistant message
        let msgText: string | null = null;
        let msgHasToolUse = false;

        for (const block of entry.message.content) {
          if (block.type === "text" && block.text) {
            msgText = block.text;
          }
          if (block.type === "tool_use") {
            msgHasToolUse = true;
          }
        }

        // Update last known values
        if (msgText) {
          lastText = msgText;
          lastHasToolUse = msgHasToolUse;
        }
      }
    } catch {
      continue;
    }
  }

  return { text: lastText, hasToolUse: lastHasToolUse };
}

// Hash text content for comparison
function hashText(text: string): string {
  return createHash("md5").update(text).digest("hex");
}

// Check if we're running as the background speaker process
const isBackgroundProcess = process.env.OUTLOUD_BACKGROUND === "1";

// Debug log to file
const DEBUG = true;
const debugLog = async (msg: string) => {
  if (!DEBUG) return;
  const logFile = join(getConfigDir(), "debug.log");
  const timestamp = new Date().toISOString();
  const file = Bun.file(logFile);
  const existing = await file.exists() ? await file.text() : "";
  await Bun.write(logFile, existing + `${timestamp}: ${msg}\n`);
};

async function backgroundSpeaker() {
  const transcriptPath = process.env.OUTLOUD_TRANSCRIPT_PATH!;
  const sessionId = process.env.OUTLOUD_SESSION_ID!;
  const cwd = process.env.OUTLOUD_CWD || undefined;

  await debugLog(`Background started: transcript=${transcriptPath}, session=${sessionId}, cwd=${cwd}`);

  // Wait a moment for the full message to be written (including tool_use blocks)
  // This prevents speaking text that's followed by tool calls
  await Bun.sleep(800);

  // Load config with project-level overrides if available
  const config = await loadConfig(cwd);
  const stateFile = join(getConfigDir(), `state-${sessionId}.json`);

  // Read transcript and get last text block
  const transcriptFile = Bun.file(transcriptPath);
  if (!(await transcriptFile.exists())) {
    await debugLog(`Transcript not found, exiting`);
    process.exit(0);
  }

  const content = await transcriptFile.text();
  const lines = content.split("\n");
  const { text: lastText, hasToolUse } = getLastAssistantInfo(lines);

  if (!lastText) {
    await debugLog(`No text blocks found, exiting`);
    process.exit(0);
  }

  // Skip if the message has tool_use - more output is coming
  if (hasToolUse) {
    await debugLog(`Last message has tool_use, skipping (more coming)`);
    process.exit(0);
  }

  // Check if we already spoke this exact text
  const textHash = hashText(lastText);
  let lastSpokenHash = "";

  const stateFileHandle = Bun.file(stateFile);
  if (await stateFileHandle.exists()) {
    try {
      const state = JSON.parse(await stateFileHandle.text());
      lastSpokenHash = state.lastSpokenHash || "";
    } catch {
      // ignore
    }
  }

  if (textHash === lastSpokenHash) {
    await debugLog(`Already spoke this text (hash=${textHash}), exiting`);
    process.exit(0);
  }

  await debugLog(`Speaking: ${lastText.substring(0, 100)}...`);

  // Process and speak
  const textToSpeak = processTextForSpeech(lastText, {
    excludeCodeBlocks: config.excludeCodeBlocks,
    maxLength: config.maxLength,
  });

  if (!textToSpeak.trim()) {
    await debugLog(`No speakable text after processing, exiting`);
    process.exit(0);
  }

  // Save state before speaking
  await Bun.write(stateFile, JSON.stringify({ lastSpokenHash: textHash }));

  // Speak
  const provider = createProvider(config);
  const isCloudProvider = config.provider !== "macos";
  await debugLog(`Provider: ${config.provider}`);

  const available = await provider.isAvailable();
  if (!available && isCloudProvider) {
    await debugLog(`Provider not available, falling back to macOS`);
    const fallback = new MacOSTTSProvider();
    await fallback.speak(textToSpeak, { rate: config.rate });
    process.exit(0);
  }

  if (!available) {
    await debugLog(`Provider not available, exiting`);
    process.exit(0);
  }

  try {
    await provider.speak(textToSpeak, {
      voice: config.voice,
      rate: config.rate,
    });
    await debugLog(`Speak complete`);
  } catch (err: any) {
    await debugLog(`Speak error: ${err?.message || err}`);
    if (isCloudProvider) {
      const fallback = new MacOSTTSProvider();
      await fallback.speak(textToSpeak, { rate: config.rate });
    }
  }
}

async function main() {
  try {
    // If we're the background process, do the speaking
    if (isBackgroundProcess) {
      await backgroundSpeaker();
      process.exit(0);
    }

    // Main hook: read input, spawn background, exit immediately
    const input = await Bun.stdin.text();
    if (!input.trim()) {
      process.exit(0);
    }

    const hookInput: HookInput = JSON.parse(input);

    // Load config with project-level overrides
    const config = await loadConfig(hookInput.cwd);
    if (!config.enabled) {
      process.exit(0);
    }

    await debugLog(`Hook fired: transcript=${hookInput.transcript_path}, cwd=${hookInput.cwd}`);

    // Spawn background process
    const scriptPath = import.meta.path;
    Bun.spawn(["nohup", "bun", "run", scriptPath], {
      stdio: ["ignore", "ignore", "ignore"],
      env: {
        ...process.env,
        OUTLOUD_BACKGROUND: "1",
        OUTLOUD_TRANSCRIPT_PATH: hookInput.transcript_path,
        OUTLOUD_SESSION_ID: hookInput.session_id,
        OUTLOUD_CWD: hookInput.cwd,
      },
    });

    process.exit(0);
  } catch (error: any) {
    console.error(`[outloud] Error: ${error?.message || error}`);
    process.exit(0);
  }
}

main();
