# OutLoud

Text-to-speech for AI coding assistants. Hear responses spoken aloud automatically.

Zero extra tokens - reads directly from the conversation transcript.

## Features

- **Zero token overhead** - Uses hooks to read the transcript directly
- **Multiple providers** - Chatterbox (local), macOS native, Eleven Labs, Hume AI, Cartesia
- **Chatterbox Turbo** - High-quality local TTS, free and open source
- **Secure API key storage** - Keys stored in macOS Keychain
- **Smart text processing** - Strips code blocks and markdown for natural speech
- **Auto-fallback** - Falls back to macOS if cloud provider fails
- **Easy toggle** - Enable/disable without reinstalling

## Requirements

- [Bun](https://bun.sh) runtime
- macOS (Apple Silicon recommended for Chatterbox)
- Python 3.11 (for Chatterbox only)

## Installation

```bash
# Clone the repo
git clone https://github.com/StuJLans/outloud.git
cd outloud

# Install dependencies
bun install

# Install the hook
bun run src/cli.ts install
```

## Provider Setup

### Chatterbox (Free, Local, High Quality) - Default

Chatterbox is a high-quality open-source TTS from Resemble AI that runs locally on Apple Silicon.

```bash
# Install Python 3.11 if needed
brew install python@3.11

# Install Chatterbox (one-time setup)
bun run src/cli.ts chatterbox install

# Login to HuggingFace for Turbo model access
# Get a token from https://huggingface.co/settings/tokens (read access)
.venv-chatterbox/bin/huggingface-cli login

# Test it
bun run src/cli.ts test "Hello from Chatterbox!"
```

The Chatterbox server starts automatically on first use and stays running for fast subsequent requests.

**Server management:**
```bash
bun run src/cli.ts chatterbox status  # Check if running
bun run src/cli.ts chatterbox stop    # Stop the server
bun run src/cli.ts chatterbox start   # Start manually
```

### macOS (Free, Local, Basic)

Works out of the box - no setup needed.

```bash
bun run src/cli.ts config provider macos
bun run src/cli.ts config voice Samantha  # or Karen, Daniel, Moira, etc.
```

### Eleven Labs (High Quality, Cloud)

```bash
# Store API key securely in Keychain
bun run src/cli.ts auth set elevenlabs YOUR_API_KEY

bun run src/cli.ts config provider elevenlabs
bun run src/cli.ts config voice rachel  # or use a custom voice ID
```

### Hume AI (Expressive, Octave 2)

```bash
# Store API key securely in Keychain
bun run src/cli.ts auth set hume YOUR_API_KEY

bun run src/cli.ts config provider hume
bun run src/cli.ts config voice ava  # or use a custom voice ID
```

### Cartesia (High Quality, Cloud)

```bash
# Store API key securely in Keychain
bun run src/cli.ts auth set cartesia YOUR_API_KEY

bun run src/cli.ts config provider cartesia
bun run src/cli.ts config voice caroline  # or use a custom voice ID
```

## Usage

Once installed, AI responses will automatically be spoken aloud.

### Turning TTS On and Off

**Quick toggle (recommended):**
```bash
bun run src/cli.ts disable   # Mute - hook stays installed but does nothing
bun run src/cli.ts enable    # Unmute - resume speaking responses
```

**Full removal:**
```bash
bun run src/cli.ts uninstall  # Remove hook entirely
bun run src/cli.ts install    # Re-add hook
```

### Other Commands

```bash
# Check current status
bun run src/cli.ts status

# Test TTS with your current settings
bun run src/cli.ts test
bun run src/cli.ts test "Custom message"

# Stop audio mid-playback
bun run src/cli.ts stop

# List available voices for current provider
bun run src/cli.ts voices

# Check which API keys are stored
bun run src/cli.ts auth status
```

## Configuration

Config is stored at `~/.config/outloud/config.json`:

| Option | Default | Description |
|--------|---------|-------------|
| `enabled` | `true` | Enable/disable TTS |
| `provider` | `"chatterbox"` | TTS provider (`chatterbox`, `macos`, `elevenlabs`, `hume`, `cartesia`) |
| `voice` | (provider default) | Voice name or ID |
| `rate` | `200` | Speech rate (words per minute, macOS only) |
| `maxLength` | `5000` | Max characters to speak |
| `excludeCodeBlocks` | `true` | Skip code blocks in speech |

## How It Works

1. A `Stop` hook fires after each AI response
2. The hook reads the conversation transcript (JSONL format)
3. Extracts the final text from the response
4. Processes text (strips code blocks, cleans markdown)
5. Sends to the configured TTS provider

**No extra tokens** - we read from the existing transcript file.

## Security

API keys are stored in macOS Keychain, not in plain text config files. The `auth status` command confirms keys are stored without revealing them.

## Error Handling

The hook **automatically falls back to macOS** if a cloud provider fails:

- **Credits exhausted** - Falls back to macOS `say`
- **Network issues** - Falls back to macOS `say`
- **Rate limits** - Falls back to macOS `say`
- **Invalid API key** - Falls back to macOS `say`

**The voice change is the signal.** If you suddenly hear the robotic macOS voice instead of your cloud voice, you know something went wrong with your cloud provider.

Errors are logged to stderr with `[outloud]` prefix for debugging.

## License

MIT
