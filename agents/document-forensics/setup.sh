#!/usr/bin/env bash
# Setup script for the document forensics service.
# Installs Python dependencies and downloads TruFor weights.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_DIR="$SCRIPT_DIR/python"
WEIGHTS_DIR="$PYTHON_DIR/weights/trufor"
WEIGHTS_FILE="$WEIGHTS_DIR/trufor.pth.tar"
S3_WEIGHTS="s3://banyan-ml-weights/trufor/trufor.pth.tar"

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

# Step 2: Download TruFor weights from S3
echo ""
echo "Step 2: Checking TruFor weights..."
mkdir -p "$WEIGHTS_DIR"

if [ -f "$WEIGHTS_FILE" ]; then
    echo "  ✓ Weights already present at $WEIGHTS_FILE"
else
    echo "  Downloading TruFor weights from S3 (~268 MB)..."
    if command -v aws &> /dev/null; then
        aws s3 cp "$S3_WEIGHTS" "$WEIGHTS_FILE"
    else
        echo "  ✗ AWS CLI not found. Install with: brew install awscli"
        echo "  Or download manually: aws s3 cp $S3_WEIGHTS $WEIGHTS_FILE"
        exit 1
    fi
    echo "  ✓ Weights downloaded"
fi

echo ""
echo "=== Setup complete ==="
echo "  Python: $PYTHON_DIR"
echo "  Weights: $WEIGHTS_FILE"
