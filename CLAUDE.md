# OutLoud

Text-to-speech for AI coding assistants. Automatically speaks responses aloud using a Stop hook.

## Quick Reference

```bash
# All commands run from the project root
cd outloud

# Installation
bun run src/cli.ts install     # Install the hook
bun run src/cli.ts uninstall   # Remove the hook

# Enable/Disable (quick toggle - hook stays installed)
bun run src/cli.ts disable    # Mute TTS
bun run src/cli.ts enable     # Unmute TTS

# Provider setup
bun run src/cli.ts config provider macos       # Free, local, basic quality
bun run src/cli.ts config provider elevenlabs  # High quality, requires API key
bun run src/cli.ts config provider hume        # High quality (Octave 2), requires API key

# API key management (stored in macOS Keychain)
bun run src/cli.ts auth set elevenlabs <key>
bun run src/cli.ts auth set hume <key>
bun run src/cli.ts auth status
bun run src/cli.ts auth remove

# Voice configuration
bun run src/cli.ts voices                      # List voices for current provider
bun run src/cli.ts config voice <name-or-id>

# Testing
bun run src/cli.ts test                        # Test with default message
bun run src/cli.ts test "Custom message"
bun run src/cli.ts stop                        # Stop playback

# Status
bun run src/cli.ts status
```

## Architecture

```
src/
├── cli.ts           # CLI commands
├── hook.ts          # Stop hook handler
├── config.ts        # Config (~/.config/outloud/config.json)
├── keychain.ts      # macOS Keychain for API keys
├── text.ts          # Text processing (strips code blocks, markdown)
└── providers/
    ├── types.ts     # TTSProvider interface, TTSConfig
    ├── macos.ts     # macOS `say` command
    ├── elevenlabs.ts # Eleven Labs API
    └── hume.ts      # Hume AI API (Octave 2)
```

## How It Works

1. A `Stop` hook fires after each AI response
2. Hook reads `transcript_path` from stdin (JSONL format)
3. Extracts the **final** text block from all assistant messages (ignores intermediate "Let me check..." messages)
4. Processes text (strips code blocks, cleans markdown)
5. Sends to configured TTS provider (falls back to macOS if cloud fails)
6. Plays audio via `afplay` (macOS)

**Zero extra tokens** - reads directly from transcript file.

**Auto-fallback** - if cloud provider fails (rate limits, credits exhausted, network issues), automatically falls back to macOS `say`. The voice change signals the error to the user.

## Adding a New Provider

1. Create `src/providers/newprovider.ts` implementing `TTSProvider`
2. Add to union type in `src/providers/types.ts`
3. Export from `src/providers/index.ts`
4. Add case in `createProvider()` function
5. Update CLI validation and help text
6. Add Keychain support if API key needed

## Config File

Location: `~/.config/outloud/config.json`

```json
{
  "enabled": true,
  "provider": "elevenlabs",
  "voice": "rachel",
  "rate": 200,
  "maxLength": 5000,
  "excludeCodeBlocks": true
}
```

## Hook Configuration

Location: `~/.claude/settings.json`

The hook entry looks like:
```json
{
  "hooks": {
    "Stop": [{
      "hooks": [{
        "type": "command",
        "command": "bun run \"/path/to/outloud/src/hook.ts\"",
        "timeout": 60
      }]
    }]
  }
}
```
