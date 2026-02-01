import { homedir } from "os";
import { join } from "path";
import type { TTSConfig } from "./providers/types";
import { defaultConfig } from "./providers/types";

const CONFIG_DIR = join(homedir(), ".config", "outloud");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export async function ensureConfigDir(): Promise<void> {
  await Bun.$`mkdir -p ${CONFIG_DIR}`.quiet();
}

export async function loadConfig(): Promise<TTSConfig> {
  try {
    const file = Bun.file(CONFIG_FILE);
    if (await file.exists()) {
      const content = await file.json();
      return { ...defaultConfig, ...content };
    }
  } catch {
    // Config doesn't exist or is invalid, use defaults
  }
  return { ...defaultConfig };
}

export async function saveConfig(config: TTSConfig): Promise<void> {
  await ensureConfigDir();
  await Bun.write(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export async function setEnabled(enabled: boolean): Promise<void> {
  const config = await loadConfig();
  config.enabled = enabled;
  await saveConfig(config);
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}

export function getConfigDir(): string {
  return CONFIG_DIR;
}
