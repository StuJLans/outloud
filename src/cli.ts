#!/usr/bin/env bun
/**
 * outloud CLI
 *
 * Commands:
 *   install   - Install the Claude Code hook
 *   uninstall - Remove the Claude Code hook
 *   enable    - Enable TTS
 *   disable   - Disable TTS
 *   status    - Show current status
 *   config    - Show/edit configuration
 *   voices    - List available voices
 *   test      - Test TTS with a sample message
 */

import { homedir } from "os";
import { join, dirname } from "path";
import { loadConfig, loadGlobalConfig, saveConfig, getConfigPath, loadProjectConfig, saveProjectConfig, getProjectConfigPath } from "./config";
import { createProvider, ELEVENLABS_VOICES, HUME_VOICES, CARTESIA_VOICES, isChatterboxInstalled, isChatterboxServerRunning, stopChatterboxServer } from "./providers";
import { listMacOSVoices } from "./providers/macos";
import { processTextForSpeech } from "./text";
import { setKeychainPassword, deleteKeychainPassword, getKeychainPassword } from "./keychain";

const CLAUDE_SETTINGS_PATH = join(homedir(), ".claude", "settings.json");
const HOOK_SCRIPT_PATH = join(dirname(import.meta.dir), "src", "hook.ts");

interface ClaudeSettings {
  hooks?: {
    Stop?: Array<{
      hooks: Array<{
        type: string;
        command: string;
        timeout?: number;
      }>;
    }>;
    [key: string]: any;
  };
  [key: string]: any;
}

async function loadClaudeSettings(): Promise<ClaudeSettings> {
  try {
    const file = Bun.file(CLAUDE_SETTINGS_PATH);
    if (await file.exists()) {
      return await file.json();
    }
  } catch {
    // File doesn't exist or is invalid
  }
  return {};
}

async function saveClaudeSettings(settings: ClaudeSettings): Promise<void> {
  // Ensure .claude directory exists
  await Bun.$`mkdir -p ${join(homedir(), ".claude")}`.quiet();
  await Bun.write(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

function getHookCommand(): string {
  return `bun run "${HOOK_SCRIPT_PATH}"`;
}

function isHookInstalled(settings: ClaudeSettings): boolean {
  const stopHooks = settings.hooks?.Stop;
  if (!stopHooks) return false;

  return stopHooks.some((entry) =>
    entry.hooks.some(
      (hook) => hook.type === "command" && hook.command.includes("outloud")
    )
  );
}

async function install(): Promise<void> {
  console.log("Installing Claude Code TTS hook...\n");

  const settings = await loadClaudeSettings();

  if (isHookInstalled(settings)) {
    console.log("Hook is already installed.");
    return;
  }

  // Initialize hooks structure if needed
  if (!settings.hooks) {
    settings.hooks = {};
  }
  if (!settings.hooks.Stop) {
    settings.hooks.Stop = [];
  }

  // Add our hook
  settings.hooks.Stop.push({
    hooks: [
      {
        type: "command",
        command: getHookCommand(),
        timeout: 60,
      },
    ],
  });

  await saveClaudeSettings(settings);

  console.log("Hook installed successfully!");
  console.log(`\nSettings file: ${CLAUDE_SETTINGS_PATH}`);
  console.log(`Hook script: ${HOOK_SCRIPT_PATH}`);
  console.log("\nNote: Restart Claude Code for the hook to take effect.");
}

async function uninstall(): Promise<void> {
  console.log("Uninstalling Claude Code TTS hook...\n");

  const settings = await loadClaudeSettings();

  if (!isHookInstalled(settings)) {
    console.log("Hook is not installed.");
    return;
  }

  // Remove our hook entries
  if (settings.hooks?.Stop) {
    settings.hooks.Stop = settings.hooks.Stop.filter(
      (entry) =>
        !entry.hooks.some(
          (hook) =>
            hook.type === "command" && hook.command.includes("outloud")
        )
    );

    // Clean up empty arrays
    if (settings.hooks.Stop.length === 0) {
      delete settings.hooks.Stop;
    }
    if (Object.keys(settings.hooks).length === 0) {
      delete settings.hooks;
    }
  }

  await saveClaudeSettings(settings);

  console.log("Hook uninstalled successfully!");
  console.log("\nNote: Restart Claude Code for the change to take effect.");
}

async function enable(): Promise<void> {
  const config = await loadGlobalConfig();
  config.enabled = true;
  await saveConfig(config);
  console.log("TTS enabled (globally).");
}

async function disable(): Promise<void> {
  const config = await loadGlobalConfig();
  config.enabled = false;
  await saveConfig(config);
  console.log("TTS disabled (globally).");
}

async function status(): Promise<void> {
  const globalConfig = await loadGlobalConfig();
  const cwd = process.cwd();
  const projectConfig = await loadProjectConfig(cwd);
  const effectiveConfig = await loadConfig(cwd);
  const settings = await loadClaudeSettings();
  const hookInstalled = isHookInstalled(settings);

  console.log("OutLoud Status\n");
  console.log(`Hook installed: ${hookInstalled ? "Yes" : "No"}`);
  console.log(`TTS enabled: ${effectiveConfig.enabled ? "Yes" : "No"}`);
  console.log(`Provider: ${effectiveConfig.provider}`);
  console.log(`Voice: ${effectiveConfig.voice || "(default)"}`);
  console.log(`Rate: ${effectiveConfig.rate || "(default)"}`);
  console.log(`Max length: ${effectiveConfig.maxLength || "unlimited"}`);
  console.log(`Exclude code blocks: ${effectiveConfig.excludeCodeBlocks ? "Yes" : "No"}`);

  // Show saved voices per provider
  if (globalConfig.voices && Object.keys(globalConfig.voices).length > 0) {
    console.log("\nSaved voices:");
    if (globalConfig.voices.macos) console.log(`  macOS:      ${globalConfig.voices.macos}`);
    if (globalConfig.voices.elevenlabs) console.log(`  ElevenLabs: ${globalConfig.voices.elevenlabs}`);
    if (globalConfig.voices.hume) console.log(`  Hume:       ${globalConfig.voices.hume}`);
    if (globalConfig.voices.cartesia) console.log(`  Cartesia:   ${globalConfig.voices.cartesia}`);
    if (globalConfig.voices.chatterbox) console.log(`  Chatterbox: ${globalConfig.voices.chatterbox}`);
  }

  // Chatterbox status
  if (effectiveConfig.provider === "chatterbox") {
    const installed = await isChatterboxInstalled();
    const serverRunning = installed ? await isChatterboxServerRunning() : false;
    console.log(`\nChatterbox: ${installed ? "installed" : "not installed"}`);
    if (installed) {
      console.log(`Server: ${serverRunning ? "running" : "stopped"}`);
    }
  }

  // Show project config if present
  if (projectConfig) {
    console.log("\nProject config (.outloud.json):");
    if (projectConfig.enabled !== undefined) console.log(`  enabled: ${projectConfig.enabled}`);
    if (projectConfig.provider) console.log(`  provider: ${projectConfig.provider}`);
    if (projectConfig.voice) console.log(`  voice: ${projectConfig.voice}`);
    if (projectConfig.rate) console.log(`  rate: ${projectConfig.rate}`);
  }

  console.log(`\nGlobal config: ${getConfigPath()}`);
  if (projectConfig) {
    console.log(`Project config: ${getProjectConfigPath(cwd)}`);
  }
  console.log(`Claude settings: ${CLAUDE_SETTINGS_PATH}`);
}

async function showConfig(): Promise<void> {
  const config = await loadGlobalConfig();
  console.log(JSON.stringify(config, null, 2));
}

async function setConfig(key: string, value: string): Promise<void> {
  const config = await loadGlobalConfig();

  switch (key) {
    case "voice":
      config.voice = value;
      // Also save to per-provider voices
      if (!config.voices) config.voices = {};
      config.voices[config.provider] = value;
      break;
    case "rate":
      config.rate = parseInt(value, 10);
      break;
    case "maxLength":
      config.maxLength = parseInt(value, 10);
      break;
    case "excludeCodeBlocks":
      config.excludeCodeBlocks = value === "true";
      break;
    case "provider":
      if (!["macos", "elevenlabs", "hume", "cartesia", "chatterbox"].includes(value)) {
        console.error('Invalid provider. Use "macos", "elevenlabs", "hume", "cartesia", or "chatterbox".');
        process.exit(1);
      }
      const newProvider = value as "macos" | "elevenlabs" | "hume" | "cartesia" | "chatterbox";
      config.provider = newProvider;
      // Restore saved voice for this provider (if any)
      if (config.voices?.[newProvider]) {
        config.voice = config.voices[newProvider];
        console.log(`Restored voice: ${config.voice}`);
      } else {
        // Clear voice so provider uses its default
        config.voice = undefined;
      }
      break;
    default:
      console.error(`Unknown config key: ${key}`);
      process.exit(1);
  }

  await saveConfig(config);
  console.log(`Set ${key} = ${value}`);
}

async function voices(): Promise<void> {
  const config = await loadConfig(process.cwd());

  if (config.provider === "elevenlabs") {
    console.log("Eleven Labs voices:\n");
    for (const [name, id] of Object.entries(ELEVENLABS_VOICES)) {
      console.log(`  ${name.padEnd(10)} (${id})`);
    }
    console.log('\nSet voice with: outloud config voice <name or id>');
    console.log("Example: outloud config voice rachel");
  } else if (config.provider === "hume") {
    console.log("Hume AI voices:\n");
    for (const [shortName, fullName] of Object.entries(HUME_VOICES)) {
      console.log(`  ${shortName.padEnd(10)} → ${fullName}`);
    }
    console.log('\nSet voice with: outloud config voice <name>');
    console.log("Example: outloud config voice ava");
    console.log("You can also use custom voice IDs from your Hume account.");
  } else if (config.provider === "cartesia") {
    console.log("Cartesia voices:\n");
    for (const [name, id] of Object.entries(CARTESIA_VOICES)) {
      console.log(`  ${name.padEnd(10)} (${id})`);
    }
    console.log('\nSet voice with: outloud config voice <name or id>');
    console.log("Example: outloud config voice caroline");
    console.log("You can also use custom voice IDs from your Cartesia account.");
  } else if (config.provider === "chatterbox") {
    console.log("Chatterbox uses a single high-quality voice.");
    console.log("Voice cloning is not yet supported in this integration.");
  } else {
    console.log("Available macOS voices:\n");
    const voiceList = await listMacOSVoices();
    for (const voice of voiceList) {
      console.log(`  ${voice}`);
    }
    console.log(`\nTotal: ${voiceList.length} voices`);
    console.log('\nSet voice with: outloud config voice <name>');
  }
}

async function test(message?: string): Promise<void> {
  const config = await loadConfig(process.cwd());
  const testMessage =
    message ||
    "Hello! This is a test of Claude TTS. If you can hear this, the text to speech integration is working correctly.";

  console.log(`Testing TTS with provider: ${config.provider}`);
  console.log(`Voice: ${config.voice || "(default)"}`);
  console.log(`Rate: ${config.rate || "(default)"}\n`);

  const provider = createProvider(config);

  const available = await provider.isAvailable();
  if (!available) {
    console.error(`Provider '${config.provider}' is not available.`);
    process.exit(1);
  }

  console.log("Speaking...\n");
  await provider.speak(testMessage, {
    voice: config.voice,
    rate: config.rate,
  });
  console.log("Done!");
}

async function stop(): Promise<void> {
  const config = await loadGlobalConfig();
  const provider = createProvider(config);
  await provider.stop();
  console.log("Stopped TTS playback.");
}

async function init(options?: { enabled?: boolean; provider?: string; voice?: string }): Promise<void> {
  const cwd = process.cwd();
  const existingConfig = await loadProjectConfig(cwd);

  if (existingConfig && !options) {
    console.log("Project config already exists:");
    console.log(JSON.stringify(existingConfig, null, 2));
    console.log(`\nFile: ${getProjectConfigPath(cwd)}`);
    console.log("\nTo modify, use: outloud init --enabled=true/false --provider=<provider> --voice=<voice>");
    return;
  }

  const projectConfig: Partial<typeof existingConfig> = existingConfig || {};

  if (options?.enabled !== undefined) {
    projectConfig.enabled = options.enabled;
  } else if (!existingConfig) {
    projectConfig.enabled = true;
  }

  if (options?.provider) {
    if (!["macos", "elevenlabs", "hume", "cartesia", "chatterbox"].includes(options.provider)) {
      console.error('Invalid provider. Use "macos", "elevenlabs", "hume", "cartesia", or "chatterbox".');
      process.exit(1);
    }
    projectConfig.provider = options.provider as "macos" | "elevenlabs" | "hume" | "cartesia" | "chatterbox";
  }

  if (options?.voice) {
    projectConfig.voice = options.voice;
  }

  await saveProjectConfig(cwd, projectConfig);
  console.log("Project config saved:");
  console.log(JSON.stringify(projectConfig, null, 2));
  console.log(`\nFile: ${getProjectConfigPath(cwd)}`);
}

async function projectDisable(): Promise<void> {
  await init({ enabled: false });
}

async function projectEnable(): Promise<void> {
  await init({ enabled: true });
}

async function chatterbox(action?: string): Promise<void> {
  const scriptDir = dirname(import.meta.dir);
  const installScript = join(scriptDir, "scripts", "install_chatterbox.sh");

  switch (action) {
    case "install":
      console.log("Installing Chatterbox TTS...\n");
      const proc = Bun.spawn(["bash", installScript], {
        stdout: "inherit",
        stderr: "inherit",
      });
      await proc.exited;
      break;

    case "start":
      const installed = await isChatterboxInstalled();
      if (!installed) {
        console.error("Chatterbox is not installed. Run: outloud chatterbox install");
        process.exit(1);
      }
      const running = await isChatterboxServerRunning();
      if (running) {
        console.log("Chatterbox server is already running.");
      } else {
        console.log("Starting Chatterbox server...");
        // The provider will start it automatically on first use
        const config = await loadConfig(process.cwd());
        config.provider = "chatterbox";
        const provider = createProvider(config);
        await provider.isAvailable();
        console.log("Chatterbox server started.");
      }
      break;

    case "stop":
      const stopped = await stopChatterboxServer();
      if (stopped) {
        console.log("Chatterbox server stopped.");
      } else {
        console.log("Chatterbox server is not running.");
      }
      break;

    case "status":
      const isInstalled = await isChatterboxInstalled();
      const isRunning = isInstalled ? await isChatterboxServerRunning() : false;
      console.log(`Chatterbox installed: ${isInstalled ? "Yes" : "No"}`);
      if (isInstalled) {
        console.log(`Server running: ${isRunning ? "Yes" : "No"}`);
      }
      if (!isInstalled) {
        console.log("\nTo install: outloud chatterbox install");
      }
      break;

    default:
      console.log(`
Chatterbox - Local TTS powered by Resemble AI

Usage: outloud chatterbox <command>

Commands:
  install   Install Chatterbox (requires Python 3.11)
  start     Start the Chatterbox server
  stop      Stop the Chatterbox server
  status    Check installation and server status

The server starts automatically on first TTS request and stays running
for fast subsequent requests.

Requirements:
  - macOS 14+ on Apple Silicon
  - Python 3.11 (brew install python@3.11)
`);
  }
}

async function auth(action: string, arg2?: string, arg3?: string): Promise<void> {
  // Support both: auth set <key> (uses current provider) and auth set elevenlabs <key>
  let provider: string | undefined;
  let apiKey: string | undefined;

  if (arg3) {
    // auth set elevenlabs <key>
    provider = arg2;
    apiKey = arg3;
  } else if (arg2 && action === "set") {
    // auth set <key> - use current provider
    const config = await loadConfig();
    provider = config.provider;
    apiKey = arg2;
  } else {
    provider = arg2;
  }

  const keychainKey = provider === "hume" ? "hume-api-key" : provider === "cartesia" ? "cartesia-api-key" : "elevenlabs-api-key";
  const providerName = provider === "hume" ? "Hume" : provider === "cartesia" ? "Cartesia" : "Eleven Labs";

  switch (action) {
    case "set":
      if (!apiKey) {
        console.error("Usage: outloud auth set [provider] <api-key>");
        console.error("Examples:");
        console.error("  outloud auth set <key>              # Uses current provider");
        console.error("  outloud auth set elevenlabs <key>");
        console.error("  outloud auth set hume <key>");
        process.exit(1);
      }
      const success = await setKeychainPassword(keychainKey, apiKey);
      if (success) {
        console.log(`${providerName} API key stored securely in macOS Keychain.`);
      } else {
        console.error("Failed to store API key.");
        process.exit(1);
      }
      break;

    case "remove":
      if (!provider) {
        // Remove all
        const r1 = await deleteKeychainPassword("elevenlabs-api-key");
        const r2 = await deleteKeychainPassword("hume-api-key");
        const r3 = await deleteKeychainPassword("cartesia-api-key");
        console.log(r1 ? "Eleven Labs API key removed." : "No Eleven Labs key found.");
        console.log(r2 ? "Hume API key removed." : "No Hume key found.");
        console.log(r3 ? "Cartesia API key removed." : "No Cartesia key found.");
      } else {
        const removed = await deleteKeychainPassword(keychainKey);
        if (removed) {
          console.log(`${providerName} API key removed from Keychain.`);
        } else {
          console.log(`No ${providerName} API key found in Keychain.`);
        }
      }
      break;

    case "status":
      const elevenKey = await getKeychainPassword("elevenlabs-api-key");
      const humeKey = await getKeychainPassword("hume-api-key");
      const cartesiaKey = await getKeychainPassword("cartesia-api-key");

      console.log("API Key Status:\n");
      console.log(`  Eleven Labs: ${elevenKey ? "✓ stored in Keychain" : "✗ not set"}`);
      console.log(`  Hume:        ${humeKey ? "✓ stored in Keychain" : "✗ not set"}`);
      console.log(`  Cartesia:    ${cartesiaKey ? "✓ stored in Keychain" : "✗ not set"}`);
      break;

    default:
      console.log(`
Usage: outloud auth <action> [provider] [api-key]

Actions:
  set [provider] <key>  Store API key in macOS Keychain
  remove [provider]     Remove API key(s) from Keychain
  status                Check which API keys are stored

Providers: elevenlabs, hume, cartesia

Examples:
  outloud auth set sk_xxxxx           # Set key for current provider
  outloud auth set elevenlabs sk_xxx  # Set Eleven Labs key
  outloud auth set hume xxx           # Set Hume key
  outloud auth set cartesia xxx       # Set Cartesia key
  outloud auth status                 # Show all stored keys
`);
  }
}

function printHelp(): void {
  console.log(`
outloud - Text-to-speech for Claude Code

Usage: outloud <command> [options]

Commands:
  install             Install the Claude Code hook
  uninstall           Remove the Claude Code hook
  enable              Enable TTS globally
  disable             Disable TTS globally
  status              Show current status
  config              Show current configuration
  config <key> <val>  Set configuration value

  Chatterbox (local TTS, default provider):
  chatterbox install  Install Chatterbox (requires Python 3.11)
  chatterbox start    Start the Chatterbox server
  chatterbox stop     Stop the Chatterbox server
  chatterbox status   Check Chatterbox installation status

  Project-level config (per working directory):
  init                Create .outloud.json in current directory
  init --enabled=false    Disable TTS for this project
  init --provider=hume    Set provider for this project
  init --voice=<id>       Set voice for this project

  auth set [provider] <key>  Store API key in macOS Keychain
  auth remove [provider]     Remove API key(s) from Keychain
  auth status                Check which API keys are stored
  voices              List available voices for current provider
  test [message]      Test TTS with optional custom message
  stop                Stop current TTS playback
  help                Show this help message

Configuration keys:
  voice               Voice name or ID (e.g., "Samantha", "rachel", "ava", "caroline")
  rate                Speech rate in words per minute (default: 200)
  maxLength           Max characters to speak (default: 5000)
  excludeCodeBlocks   Skip code blocks (true/false, default: true)
  provider            TTS provider (chatterbox, macos, elevenlabs, hume, cartesia)

Examples:
  # Quick start with Chatterbox (free, local, high-quality):
  outloud chatterbox install
  outloud install
  outloud test "Hello world"

  # Or use cloud providers:
  outloud auth set elevenlabs sk_xxxxx
  outloud config provider elevenlabs
  outloud config voice rachel

  # Disable TTS for a specific project:
  cd ~/projects/quiet-project
  outloud init --enabled=false
`);
}

// Main CLI handler
const command = process.argv[2];

switch (command) {
  case "install":
    await install();
    break;
  case "uninstall":
    await uninstall();
    break;
  case "enable":
    await enable();
    break;
  case "disable":
    await disable();
    break;
  case "status":
    await status();
    break;
  case "config":
    if (process.argv[3] && process.argv[4]) {
      await setConfig(process.argv[3], process.argv[4]);
    } else {
      await showConfig();
    }
    break;
  case "voices":
    await voices();
    break;
  case "test":
    await test(process.argv.slice(3).join(" ") || undefined);
    break;
  case "stop":
    await stop();
    break;
  case "auth":
    await auth(process.argv[3], process.argv[4], process.argv[5]);
    break;
  case "init": {
    // Parse --enabled, --provider, --voice flags
    const args = process.argv.slice(3);
    const options: { enabled?: boolean; provider?: string; voice?: string } = {};
    for (const arg of args) {
      if (arg.startsWith("--enabled=")) {
        options.enabled = arg.split("=")[1] === "true";
      } else if (arg.startsWith("--provider=")) {
        options.provider = arg.split("=")[1];
      } else if (arg.startsWith("--voice=")) {
        options.voice = arg.split("=")[1];
      }
    }
    await init(Object.keys(options).length > 0 ? options : undefined);
    break;
  }
  case "chatterbox":
    await chatterbox(process.argv[3]);
    break;
  case "help":
  case "--help":
  case "-h":
  case undefined:
    printHelp();
    break;
  default:
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exit(1);
}
