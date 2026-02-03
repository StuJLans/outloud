import type { TTSProvider, TTSOptions } from "./types";
import { join, dirname } from "path";
import { homedir } from "os";

const CHATTERBOX_PORT = 7865;
const CHATTERBOX_URL = `http://127.0.0.1:${CHATTERBOX_PORT}`;
const PID_FILE = join(homedir(), ".config", "outloud", "chatterbox.pid");
const VENV_DIR = join(dirname(dirname(import.meta.dir)), ".venv-chatterbox");
const SERVER_SCRIPT = join(dirname(dirname(import.meta.dir)), "scripts", "chatterbox_server.py");

export class ChatterboxProvider implements TTSProvider {
  name = "chatterbox";
  private currentProcess: Bun.Subprocess | null = null;

  async isAvailable(): Promise<boolean> {
    // Check if venv exists
    const venvExists = await Bun.file(join(VENV_DIR, "bin", "python")).exists();
    if (!venvExists) {
      return false;
    }

    // Check if server is running, start if not
    const running = await this.isServerRunning();
    if (!running) {
      await this.startServer();
    }

    return true;
  }

  private async isServerRunning(): Promise<boolean> {
    try {
      const response = await fetch(`${CHATTERBOX_URL}/health`, {
        signal: AbortSignal.timeout(1000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private async startServer(): Promise<void> {
    console.error("Starting Chatterbox server (first request may take a moment)...");

    const pythonPath = join(VENV_DIR, "bin", "python");

    // Start server in background
    const proc = Bun.spawn([pythonPath, SERVER_SCRIPT], {
      env: {
        ...process.env,
        CHATTERBOX_PORT: String(CHATTERBOX_PORT),
      },
      stdout: "ignore",
      stderr: "pipe",
    });

    // Wait for server to be ready (up to 120 seconds for model loading on first run)
    const maxWait = 120000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      if (await this.isServerRunning()) {
        return;
      }
      await Bun.sleep(500);
    }

    throw new Error("Chatterbox server failed to start");
  }

  async speak(text: string, _options?: TTSOptions): Promise<void> {
    // Stop any current playback
    await this.stop();

    // Ensure server is running
    if (!(await this.isServerRunning())) {
      await this.startServer();
    }

    // Send text to server
    const response = await fetch(`${CHATTERBOX_URL}/speak`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Chatterbox error: ${error.error || "Unknown error"}`);
    }

    const result = await response.json();
    const audioPath = result.audio_path;

    // Play with afplay (macOS)
    this.currentProcess = Bun.spawn(["afplay", audioPath], {
      stdout: "ignore",
      stderr: "ignore",
    });
    await this.currentProcess.exited;
    this.currentProcess = null;

    // Cleanup temp file
    try {
      await Bun.$`rm ${audioPath}`.quiet();
    } catch {
      // Ignore cleanup errors
    }
  }

  async stop(): Promise<void> {
    if (this.currentProcess) {
      this.currentProcess.kill();
      this.currentProcess = null;
    }

    // Kill any afplay processes
    try {
      await Bun.$`pkill -x afplay`.quiet();
    } catch {
      // Ignore if no process to kill
    }
  }
}

// Check if Chatterbox is installed
export async function isChatterboxInstalled(): Promise<boolean> {
  return await Bun.file(join(VENV_DIR, "bin", "python")).exists();
}

// Stop the Chatterbox server
export async function stopChatterboxServer(): Promise<boolean> {
  try {
    const response = await fetch(`${CHATTERBOX_URL}/shutdown`, {
      method: "POST",
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    // Try killing by PID
    try {
      const pidFile = Bun.file(PID_FILE);
      if (await pidFile.exists()) {
        const pid = await pidFile.text();
        await Bun.$`kill ${pid.trim()}`.quiet();
        await Bun.$`rm ${PID_FILE}`.quiet();
        return true;
      }
    } catch {
      // Ignore
    }
    return false;
  }
}

// Check if server is running
export async function isChatterboxServerRunning(): Promise<boolean> {
  try {
    const response = await fetch(`${CHATTERBOX_URL}/health`, {
      signal: AbortSignal.timeout(1000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
