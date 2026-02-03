#!/usr/bin/env bash

# Chatterbox TTS on macOS 14+/Apple Silicon with Python 3.11
# Based on: https://github.com/resemble-ai/chatterbox/issues/336

set -euo pipefail

# Quieter installs and logs
export HF_HUB_DISABLE_TELEMETRY=1
export HF_HUB_DISABLE_PROGRESS_BARS=1
export TOKENIZERS_PARALLELISM=false
export TQDM_DISABLE=1
export PYTHONWARNINGS="ignore::FutureWarning"

PY_BIN="${PY_BIN:-python3.11}"

echo "=== Chatterbox TTS Installer for Apple Silicon ==="
echo

[[ "$(uname -s)" == "Darwin" ]] || { echo "Error: macOS only"; exit 1; }
[[ "$(uname -m)" == "arm64"   ]] || { echo "Error: Apple Silicon only"; exit 1; }
command -v "$PY_BIN" >/dev/null || { echo "Error: Python 3.11 not found. Install with: brew install python@3.11"; exit 1; }

echo "Using $("$PY_BIN" -V)"
echo

# Create virtual environment in outloud directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="$SCRIPT_DIR/../.venv-chatterbox"

if [[ -d "$VENV_DIR" ]]; then
  echo "Virtual environment already exists at $VENV_DIR"
  echo "To reinstall, remove it first: rm -rf $VENV_DIR"
  exit 0
fi

echo "Creating virtual environment..."
"$PY_BIN" -m venv "$VENV_DIR"

# Activate venv
source "$VENV_DIR/bin/activate"
PIP=( python -m pip )

export PIP_NO_INPUT=1
export PIP_DEFAULT_TIMEOUT=120

echo "Installing dependencies (this may take a few minutes)..."
echo

# 0) Tools
echo "[1/7] Upgrading pip, setuptools, wheel..."
"${PIP[@]}" -qq install --upgrade pip setuptools wheel

# 1) Core ML stack (Apple Silicon)
echo "[2/7] Installing PyTorch for Apple Silicon..."
"${PIP[@]}" -qq install torch==2.6.0 torchaudio==2.6.0

# 2) Preinstall numpy so pkuseg's setup.py can import it
echo "[3/7] Installing numpy..."
"${PIP[@]}" -qq install numpy==1.25.2

# 3) Chatterbox pinned runtime deps
echo "[4/7] Installing Chatterbox dependencies..."
"${PIP[@]}" -qqq install \
  transformers==4.46.3 \
  diffusers==0.29.0 \
  conformer==0.3.2 \
  resemble-perth==1.0.1 \
  safetensors==0.5.3 \
  librosa==0.11.0 \
  pykakasi==2.3.0 \
  flask==3.1.0

# 4) s3tokenizer + its declared requirements
echo "[5/7] Installing s3tokenizer..."
"${PIP[@]}" -qq install onnx==1.16.2 pre-commit==3.7.1
"${PIP[@]}" -qq install --no-deps s3tokenizer==0.2.0

# 5) pkuseg (needs numpy visible and Cython for building)
echo "[6/7] Installing pkuseg..."
"${PIP[@]}" -qq install cython setuptools
"${PIP[@]}" install --no-build-isolation pkuseg==0.0.25

# 6) Chatterbox itself
echo "[7/7] Installing chatterbox-tts..."
"${PIP[@]}" -qq install --no-deps chatterbox-tts==0.1.4

echo
echo "Installation complete!"
echo
echo "Virtual environment: $VENV_DIR"
echo
echo "To test, run: outloud config provider chatterbox && outloud test"
