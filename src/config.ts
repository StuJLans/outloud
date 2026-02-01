import { homedir } from "os";
import { join } from "path";
import type { TTSConfig } from "./providers/types";
import { defaultConfig } from "./providers/types";

const CONFIG_DIR = join(homedir(), ".config", "outloud");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");
const PROJECT_CONFIG_FILE = ".outloud.json";

export async function ensureConfigDir(): Promise<void> {
  await Bun.$`mkdir -p ${CONFIG_DIR}`.quiet();
}

// Load global config only
export async function loadGlobalConfig(): Promise<TTSConfig> {
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

// Load config with optional project-level overrides
export async function loadConfig(cwd?: string): Promise<TTSConfig> {
  const globalConfig = await loadGlobalConfig();

  if (!cwd) {
    return globalConfig;
  }

  // Check for project-level config
  try {
    const projectConfigPath = join(cwd, PROJECT_CONFIG_FILE);
    const file = Bun.file(projectConfigPath);
    if (await file.exists()) {
      const projectConfig = await file.json();
      // Project config overrides global config
      return { ...globalConfig, ...projectConfig };
    }
  } catch {
    // No project config or invalid, use global
  }

  return globalConfig;
}

// Load project config only (for display purposes)
export async function loadProjectConfig(cwd: string): Promise<Partial<TTSConfig> | null> {
  try {
    const projectConfigPath = join(cwd, PROJECT_CONFIG_FILE);
    const file = Bun.file(projectConfigPath);
    if (await file.exists()) {
      return await file.json();
    }
  } catch {
    // No project config or invalid
  }
  return null;
}

// Save project-level config
export async function saveProjectConfig(cwd: string, config: Partial<TTSConfig>): Promise<void> {
  const projectConfigPath = join(cwd, PROJECT_CONFIG_FILE);
  await Bun.write(projectConfigPath, JSON.stringify(config, null, 2));
}

export async function saveConfig(config: TTSConfig): Promise<void> {
  await ensureConfigDir();
  await Bun.write(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export async function setEnabled(enabled: boolean): Promise<void> {
  const config = await loadGlobalConfig();
  config.enabled = enabled;
  await saveConfig(config);
}

export function getProjectConfigPath(cwd: string): string {
  return join(cwd, PROJECT_CONFIG_FILE);
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}

export function getConfigDir(): string {
  return CONFIG_DIR;
}
