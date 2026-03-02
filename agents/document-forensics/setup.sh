#!/usr/bin/env bash
# Setup script for the document forensics service.
# Installs Python dependencies and downloads TruFor weights.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_DIR="$SCRIPT_DIR/python"
WEIGHTS_DIR="$PYTHON_DIR/weights/trufor"
WEIGHTS_FILE="$WEIGHTS_DIR/trufor.pth.tar"
WEIGHTS_URL="https://www.grip.unina.it/download/prog/TruFor/TruFor_weights.pth"

echo "=== Document Forensics Setup ==="

# Step 1: Install Python dependencies
echo ""
echo "Step 1: Installing Python dependencies..."
if command -v uv &> /dev/null; then
    cd "$PYTHON_DIR" && uv sync
    echo "  ✓ Python dependencies installed"
else
    echo "  ✗ uv not found. Install with: curl -LsSf https://astral.sh/uv/install.sh | sh"
    exit 1
fi

# Step 2: Download TruFor weights
echo ""
echo "Step 2: Checking TruFor weights..."
mkdir -p "$WEIGHTS_DIR"

if [ -f "$WEIGHTS_FILE" ]; then
    echo "  ✓ Weights already present at $WEIGHTS_FILE"
else
    echo "  Downloading TruFor weights (~281 MB)..."
    echo "  URL: $WEIGHTS_URL"
    if command -v curl &> /dev/null; then
        curl -L -o "$WEIGHTS_FILE" "$WEIGHTS_URL"
    elif command -v wget &> /dev/null; then
        wget -O "$WEIGHTS_FILE" "$WEIGHTS_URL"
    else
        echo "  ✗ Neither curl nor wget found. Download manually:"
        echo "    $WEIGHTS_URL → $WEIGHTS_FILE"
        exit 1
    fi
    echo "  ✓ Weights downloaded"
fi

echo ""
echo "=== Setup complete ==="
echo "  Python: $PYTHON_DIR"
echo "  Weights: $WEIGHTS_FILE"
