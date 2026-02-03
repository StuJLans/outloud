#!/usr/bin/env python3
"""
Chatterbox TTS HTTP Server

Loads the model once and serves TTS requests via HTTP.
Designed to run in the background and be started automatically by the outloud CLI.
"""

import os
import sys
import io
import tempfile
import warnings
import contextlib
import signal
import json
from pathlib import Path

# Suppress verbose logging
os.environ["TQDM_DISABLE"] = "1"
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
os.environ["TOKENIZERS_PARALLELISM"] = "false"
warnings.filterwarnings("ignore", category=FutureWarning)

from flask import Flask, request, jsonify, send_file

app = Flask(__name__)

# Global TTS instance (loaded once)
tts = None
device = None

def load_model():
    """Load the Chatterbox model."""
    global tts, device

    if tts is not None:
        return

    print("Loading Chatterbox model...", file=sys.stderr)

    # Suppress import noise
    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
        import torch
        from transformers.utils import logging as hf_logging
        from diffusers.utils import logging as df_logging
        hf_logging.set_verbosity_error()
        df_logging.set_verbosity_error()

        warnings.filterwarnings(
            "ignore", r"pkg_resources is deprecated.*", category=UserWarning, module=r"perth\.perth_net"
        )

        from chatterbox.tts_turbo import ChatterboxTurboTTS

        device = "mps" if torch.backends.mps.is_available() else "cpu"
        tts = ChatterboxTurboTTS.from_pretrained(device=device)

    print(f"Chatterbox Turbo loaded on {device}", file=sys.stderr)

@app.route("/health", methods=["GET"])
def health():
    """Health check endpoint."""
    return jsonify({"status": "ok", "model_loaded": tts is not None, "device": device})

def split_text_into_chunks(text: str, max_chars: int = 200) -> list:
    """Split text into chunks at sentence boundaries."""
    import re

    # Split by sentence endings
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())

    chunks = []
    current_chunk = ""

    for sentence in sentences:
        if len(current_chunk) + len(sentence) + 1 <= max_chars:
            current_chunk = (current_chunk + " " + sentence).strip()
        else:
            if current_chunk:
                chunks.append(current_chunk)
            # If single sentence is too long, split by comma or just take it
            if len(sentence) > max_chars:
                # Split long sentences by comma
                parts = re.split(r',\s*', sentence)
                for part in parts:
                    if len(part) <= max_chars:
                        chunks.append(part.strip())
                    else:
                        # Just take it as is
                        chunks.append(part.strip())
            else:
                current_chunk = sentence

    if current_chunk:
        chunks.append(current_chunk)

    return chunks if chunks else [text]

@app.route("/speak", methods=["POST"])
def speak():
    """Generate speech from text with chunking for long text."""
    global tts

    if tts is None:
        load_model()

    data = request.get_json()
    text = data.get("text", "")
    max_chunk_size = data.get("max_chunk_size", 200)

    if not text:
        return jsonify({"error": "No text provided"}), 400

    try:
        import torch
        import torchaudio as ta

        # Split text into chunks for better handling of long text
        chunks = split_text_into_chunks(text, max_chunk_size)

        # Generate audio for each chunk
        audio_segments = []
        for chunk in chunks:
            if chunk.strip():
                wav = tts.generate(chunk)
                audio_segments.append(wav)

        if not audio_segments:
            return jsonify({"error": "No audio generated"}), 500

        # Add small silence between chunks (0.2 seconds)
        silence_samples = int(0.2 * tts.sr)
        silence = torch.zeros(1, silence_samples)

        # Concatenate all segments with silence
        combined_segments = []
        for i, segment in enumerate(audio_segments):
            combined_segments.append(segment)
            if i < len(audio_segments) - 1:
                combined_segments.append(silence)

        combined_audio = torch.cat(combined_segments, dim=1)

        # Save to temp file
        temp_file = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
        ta.save(temp_file.name, combined_audio, tts.sr)
        temp_file.close()

        return jsonify({
            "audio_path": temp_file.name,
            "sample_rate": tts.sr,
            "chunks": len(chunks)
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route("/shutdown", methods=["POST"])
def shutdown():
    """Shutdown the server."""
    os.kill(os.getpid(), signal.SIGTERM)
    return jsonify({"status": "shutting down"})

def write_pid_file():
    """Write PID file for process management."""
    pid_dir = Path.home() / ".config" / "outloud"
    pid_dir.mkdir(parents=True, exist_ok=True)
    pid_file = pid_dir / "chatterbox.pid"
    pid_file.write_text(str(os.getpid()))

def main():
    port = int(os.environ.get("CHATTERBOX_PORT", "7865"))

    # Preload model before starting server
    load_model()

    write_pid_file()

    print(f"Chatterbox server running on http://127.0.0.1:{port}", file=sys.stderr)

    # Run with minimal logging
    import logging
    log = logging.getLogger('werkzeug')
    log.setLevel(logging.ERROR)

    app.run(host="127.0.0.1", port=port, threaded=False)

if __name__ == "__main__":
    main()
