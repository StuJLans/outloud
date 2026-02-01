import type { TTSProvider, TTSOptions } from "./types";

export class MacOSTTSProvider implements TTSProvider {
  name = "macos";
  private currentProcess: Bun.Subprocess | null = null;

  async isAvailable(): Promise<boolean> {
    // Check if we're on macOS and `say` command exists
    if (process.platform !== "darwin") {
      return false;
    }

    try {
      const result = await Bun.$`which say`.quiet();
      return result.exitCode === 0;
    } catch {
      return false;
    }
  }

  async speak(text: string, options?: TTSOptions): Promise<void> {
    // Stop any current speech
    await this.stop();

    const args: string[] = [];

    if (options?.voice) {
      args.push("-v", options.voice);
    }

    if (options?.rate) {
      args.push("-r", String(options.rate));
    }

    // Use spawn for async speech (non-blocking)
    this.currentProcess = Bun.spawn(["say", ...args, text], {
      stdout: "ignore",
      stderr: "ignore",
    });

    // Wait for completion
    await this.currentProcess.exited;
    this.currentProcess = null;
  }

  async stop(): Promise<void> {
    if (this.currentProcess) {
      this.currentProcess.kill();
      this.currentProcess = null;
    }

    // Also kill any other say processes (in case of orphans)
    try {
      await Bun.$`pkill -x say`.quiet();
    } catch {
      // Ignore if no process to kill
    }
  }
}

// List available voices
export async function listMacOSVoices(): Promise<string[]> {
  try {
    const result = await Bun.$`say -v ?`.text();
    const voices = result
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        const match = line.match(/^(\S+)/);
        return match ? match[1] : null;
      })
      .filter(Boolean) as string[];
    return voices;
  } catch {
    return [];
  }
}
