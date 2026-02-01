# OutLoud Quick Setup Guide

**For AI agents:** Follow these steps to set up text-to-speech for Claude Code responses.

## 1. Check if OutLoud is installed

```bash
outloud status
```

If command not found, install it:

```bash
# Clone and install
git clone https://github.com/StuJLans/outloud.git ~/outloud
cd ~/outloud
bun install
bun link

# Install the Claude Code hook
outloud install
```

## 2. Configure for this project

To enable with default settings:
```bash
outloud init
```

To disable TTS for this project:
```bash
outloud init --enabled=false
```

To use a specific provider/voice:
```bash
outloud init --provider=elevenlabs --voice=rachel
outloud init --provider=hume --voice=ava
outloud init --provider=macos --voice=Samantha
```

## 3. Test it

```bash
outloud test "Hello, TTS is working!"
```

## Common commands

| Command | Description |
|---------|-------------|
| `outloud status` | Show current config |
| `outloud enable` | Enable TTS globally |
| `outloud disable` | Disable TTS globally |
| `outloud init --enabled=false` | Disable for current project |
| `outloud config provider <x>` | Set provider (macos/elevenlabs/hume) |
| `outloud config voice <id>` | Set voice |
| `outloud voices` | List available voices |
| `outloud stop` | Stop current playback |

## API Keys (for cloud providers)

```bash
outloud auth set elevenlabs <your-api-key>
outloud auth set hume <your-api-key>
outloud auth status
```

Keys are stored securely in macOS Keychain.
