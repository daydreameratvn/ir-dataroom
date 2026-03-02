"""Preprocessing pipeline for TruFor method."""

from typing import Any, Dict, Union

import numpy as np
import torch
from numpy.typing import NDArray
from torch import Tensor


class ZeroOneRange:
    """
    Changes the image range from [0, 255] to [0, 1].
    """

    def __call__(self, image: Union[Tensor, NDArray], **kwargs) -> Dict[str, Any]:
        """
        Args:
            image: Image to be normalized.
            **kwargs: Additional keyword arguments to passthrough.

        Returns:
            Dict[str, Any]: A dictionary with the following key-value pairs:
                - "image": The normalized image.
                - **kwargs: The additional keyword arguments passed through unchanged.
        """
        if isinstance(image, np.ndarray):
            if image.dtype == np.uint8 or image.max() > 1:
                image = image.astype(np.float32) / 255.0
        elif isinstance(image, Tensor):
            if image.dtype == torch.uint8 or image.max() > 1:
                image = image.float() / 255.0
        return {"image": image, **kwargs}


class ToTensor:
    """
    Converts a numpy array to a PyTorch tensor.
    """

    def __call__(self, image: Union[NDArray, Tensor], **kwargs) -> Dict[str, Any]:
        """
        Args:
            image: Image to be converted to a tensor.
            **kwargs: Additional keyword arguments to passthrough.

        Returns:
            Dict[str, Any]: A dictionary with the following key-value pairs:
                - "image": The input image as a PyTorch tensor.
                - **kwargs: The additional keyword arguments passed through unchanged.
        """
        if isinstance(image, np.ndarray):
            t_image = torch.from_numpy(image)
            if t_image.ndim == 3:
                t_image = t_image.permute(2, 0, 1)
        elif isinstance(image, Tensor):
            t_image = image
        else:
            raise ValueError(f"image type {type(image)} isn't handled by ToTensor")

        return {"image": t_image.float(), **kwargs}


class PreProcessingPipeline:
    """Preprocessing pipeline that applies transforms in sequence."""

    def __init__(self, inputs, outputs_keys, transforms):
        self.inputs = inputs
        self.outputs_keys = outputs_keys
        self.transforms = transforms

    def __call__(self, **kwargs) -> Dict[str, Any]:
        result = kwargs
        for transform in self.transforms:
            result = transform(**result)
        return {key: result[key] for key in self.outputs_keys if key in result}


# Default preprocessing pipeline for TruFor
trufor_preprocessing = PreProcessingPipeline(
    inputs=["image"],
    outputs_keys=["image"],
    transforms=[ZeroOneRange(), ToTensor()],
)
