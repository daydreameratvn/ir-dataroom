"""TruForPredictor: high-level path-based wrapper around the TruFor model.

Used by advanced-forensics-tools.ts via:
    from methods.trufor.predictor import TruForPredictor
    pred = TruForPredictor(device=device)
    out  = pred.predict('/path/to/image.jpg')
    # out.heatmap  — numpy float32 H×W array, values in [0, 1]
    # out.score    — float, mean anomaly score
    # out.detection — float or None, global detection score
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import numpy as np
from PIL import Image

from .method import TruFor
from .config import get_default_weights
from .preprocessing import trufor_preprocessing


@dataclass
class TruForResult:
    """Result returned by TruForPredictor.predict()."""

    heatmap: np.ndarray       # H×W float32 array, values in [0, 1]
    score: float              # mean heatmap score (proxy for global anomaly)
    detection: Optional[float]  # sigmoid detection score or None


class TruForPredictor:
    """
    High-level TruFor predictor.  Accepts an image file path, preprocesses
    it into a tensor, runs inference, and returns a TruForResult.

    Args:
        device:  'cpu', 'cuda', 'mps', or 'auto' (auto-resolved by the caller).
        weights: Path to model checkpoint.  Defaults to weights/trufor/trufor.pth.tar.
    """

    def __init__(self, device: str = "cpu", weights: Optional[str] = None) -> None:
        self.device = device
        weights_path = weights or get_default_weights()
        self.model = TruFor.from_config({"weights": str(weights_path), "device": device})
        self.model.eval()

    def predict(self, image_path: str) -> TruForResult:
        """
        Run TruFor on an image file.

        Args:
            image_path: Absolute path to the image (JPG, PNG, WebP).

        Returns:
            TruForResult with heatmap, score and detection fields.
        """
        img = np.array(Image.open(image_path).convert("RGB"))
        proc = trufor_preprocessing(image=img)
        # preprocessing returns CHW tensor; add batch dim → [1, C, H, W]
        tensor = proc["image"].unsqueeze(0).to(self.device)

        heatmap_t, conf_t, det_t, _ = self.model.predict(tensor)

        hm = heatmap_t.cpu().numpy()
        if conf_t is not None:
            hm = hm * conf_t.cpu().numpy()

        score = float(hm.mean())
        detection = float(det_t.item()) if det_t is not None else None

        return TruForResult(heatmap=hm, score=score, detection=detection)
