"""Device resolution utility."""
from __future__ import annotations
import torch

def resolve_device(device: str = "auto") -> str:
    """Resolve a device string, choosing the best available for 'auto'."""
    if device == "auto":
        if torch.cuda.is_available():
            return "cuda"
        if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            return "mps"
        return "cpu"
    return device
