from typing import Any, Dict, List, Tuple, TypeVar, Union

import cv2
import numpy as np
import torch
import torch.nn.functional as F
from numpy.typing import NDArray
from PIL.Image import Image
from torch import Tensor

from .base import BasePreprocessing

T = TypeVar("T", Tensor, NDArray)


class ZeroOneRange(BasePreprocessing):
    """
    Changes the image range from [0, 255] to [0, 1].
    """

    def __call__(self, image: T, **kwargs) -> Dict[str, Any]:
        """
        Args:
            image (T): Image to be normalized.
            **kwargs: Additional keyword arguments to passthrough.

        Returns:
            Dict[str, Any]: A dictionary with the following key-value pairs:
                - "image": The normalized image.
                - **kwargs: The additional keyword arguments passed through unchanged.
        """
        if isinstance(image, Tensor):
            if image.dtype == torch.uint8:
                image = image.float() / 255.0
            elif image.max().item() > 1:
                image = image.float() / 255.0
        else:
            if image.dtype == np.uint8:
                image = image.astype(np.float32) / 255.0
            elif image.max() > 1:
                image = image.astype(np.float32) / 255.0
        return {"image": image, **kwargs}


class Normalize(BasePreprocessing):
    """
    Normalize an image. When called with an image with the mean and std of the class
    instance, it returns an image with mean 0 and std of 1.
    """

    def __init__(
        self,
        mean: Union[Tuple[float, ...], T],
        std: Union[Tuple[float, ...], T],
    ) -> None:
        """
        Args:
            mean (Union[Tuple[float, ...], T]): Mean value for each channel.
            std (Union[Tuple[float, ...], T]): Standard deviation for each channel.
        """
        if isinstance(mean, tuple):
            self.mean = np.array(mean)
        else:
            self.mean = mean
        if isinstance(std, tuple):
            self.std = np.array(std)
        else:
            self.std = std

    def __call__(self, image: T, **kwargs) -> Dict[str, Any]:
        """
        Args:
            image (T): Image to be normalized.
            **kwargs: Additional keyword arguments to passthrough.

        Returns:
            Dict[str, Any]: A dictionary with the following key-value pairs:
                - "image": The normalized image.
                - **kwargs: The additional keyword arguments passed through unchanged.
        """
        if isinstance(image, Tensor):
            mean = torch.as_tensor(self.mean, dtype=torch.float32, device=image.device)
            std = torch.as_tensor(self.std, dtype=torch.float32, device=image.device)

            if image.ndim == 3:
                mean = mean.view(3, 1, 1)
                std = std.view(3, 1, 1)

            t_image = (image.float() - mean) / std

        else:
            mean = self.mean
            std = self.std
            if image.ndim == 3:
                mean = mean.reshape((1, 1, -1))
                std = std.reshape((1, 1, -1))

            t_image = (image.astype(np.float32) - mean) / std

        return {"image": t_image, **kwargs}


class ToTensor(BasePreprocessing):
    """
    Converts a numpy array to a PyTorch tensor.
    """

    def __call__(self, image: NDArray, **kwargs) -> Dict[str, Any]:
        """
        Args:
            image (NDArray): Image to be converted to a tensor.
            **kwargs: Additional keyword arguments to passthrough.

        Returns:
            Dict[str, Any]: A dictionary with the following key-value pairs:
                - "image": The input image as a PyTorch tensor.
                - **kwargs: The additional keyword arguments passed through unchanged.
        """
        if isinstance(image, Image):
            t_image = torch.from_numpy(image)
            if t_image.ndim == 3:
                t_image = t_image.permute(2, 0, 1)
        elif isinstance(image, np.ndarray):
            t_image = torch.from_numpy(image)
            if t_image.ndim == 3:
                t_image = t_image.permute(2, 0, 1)
        elif isinstance(image, Tensor):
            t_image = image
        else:
            raise ValueError(f"image type {type(image)} isn't handled by ToTensor")

        for k in kwargs:
            if isinstance(kwargs[k], Tensor):
                continue
            elif isinstance(kwargs[k], list):
                kwargs[k] = np.array(kwargs[k])
            kwargs[k] = torch.from_numpy(kwargs[k])

        return {"image": t_image, **kwargs}


def img_to_numpy(image: Union[Tensor, NDArray, Image]) -> NDArray:
    t_image = None
    if isinstance(image, Tensor):
        t_image = image.permute(1, 2, 0).cpu().numpy()
    elif isinstance(image, np.ndarray):
        t_image = image.copy()
    else:
        t_image = np.array(image)
    return t_image


class ToNumpy(BasePreprocessing):
    """
    Converts inputs to numpy arrays. If input is already a numpy array,
    it leaves it as is.
    """

    def __init__(self, image_keys: List[str] = ["image"]) -> None:
        """
        Args:
            image_keys (List[str]): List of keys that have images.
        """
        self.image_keys = image_keys

    def __call__(self, **kwargs) -> Dict[str, Any]:
        """
        Args:
            image(Optional[Union[T, Image]]): Image to be converted to a tensor.
            **kwargs: Additional keyword arguments to passthrough.

        Returns:
            Dict[str, Any]: A dictionary with the following key-value pairs:
                - "image": The input image as a numpy array.
                - **kwargs: The additional keyword arguments passed through unchanged.
        """
        for k in self.image_keys:
            if k in kwargs:
                kwargs[k] = img_to_numpy(kwargs[k])

        for k, v in kwargs.items():
            if isinstance(v, np.ndarray):
                continue
            elif isinstance(v, Tensor):
                kwargs[k] = v.cpu().numpy()
            else:
                try:
                    kwargs[k] = np.array(v)
                except ValueError:
                    kwargs[k] = v

        return {**kwargs}


def rgb_to_gray(image: T) -> T:
    if isinstance(image, Tensor):
        image = 0.299 * image[0] + 0.587 * image[1] + 0.114 * image[2]
        image = image.unsqueeze(0)
    else:
        image = 0.299 * image[..., 0] + 0.587 * image[..., 1] + 0.114 * image[..., 2]
        image = image[..., np.newaxis]
    return image


class RGBtoGray(BasePreprocessing):
    """
    Converts an RGB image to grayscale, following the ITU-R BT.601 stardard.
    """

    def __init__(self, extra_image_keys: List[str] = []) -> None:
        """
        Args:
            extra_image_keys (List[str]): Extra image keys to convert to grayscale.
        """
        self.extra_image_keys = extra_image_keys

    def __call__(self, image: T, **kwargs) -> Dict[str, Any]:
        """
        Args:
            image (T): Image to be converted to grayscale.
            **kwargs: Additional keyword arguments to passthrough.

        Returns:
            Dict[str, Any]:A dictionary with the following key-value pairs:
                - "image": The input image as a grayscale numpy array or PyTorch tensor.
                - **kwargs: The additional keyword arguments passed through unchanged.
        """
        image = rgb_to_gray(image)
        for key in self.extra_image_keys:
            if key in kwargs:
                kwargs[key] = rgb_to_gray(kwargs[key])

        return {"image": image, **kwargs}


class RoundToUInt(BasePreprocessing):
    """
    Rounds the input float tensor and converts it to an unsigned integer.
    """

    def __init__(self, apply_on: List[str] = ["image"]) -> None:
        """
        Args:
            apply_on (List[str]): List of keys to apply the rounding to.
        """
        self.apply_on = apply_on

    def __call__(self, **kwargs) -> Dict[str, Any]:
        """
        Args:
            **kwargs: Additional keyword arguments to passthrough.

        Returns:
            Dict[str, Any]: A dictionary with the following key-value pairs:
                - "image": The input image rounded as a PyTorch tensor.
                - **kwargs: The additional keyword arguments passed through unchanged.
        """
        for k in self.apply_on:
            if k in kwargs:
                if isinstance(kwargs[k], Tensor):
                    kwargs[k] = torch.round(kwargs[k]).byte()
                elif isinstance(kwargs[k], np.ndarray):
                    kwargs[k] = np.round(kwargs[k]).astype(np.uint8)

        return kwargs


class GrayToRGB(BasePreprocessing):
    """
    Converts an grayscale image to RGB, done by repeating the image along the three channels.
    """

    def __call__(self, image: T, **kwargs):
        """
        Args:
            image (T): Image to be converted to grayscale.
            **kwargs: Additional keyword arguments to passthrough.

        Returns:
            Dict[str, Any]: A dictionary with the following key-value pairs:
                - "image": The input image as a grayscale numpy array or PyTorch tensor.
                - **kwargs: The additional keyword arguments passed through unchanged.
        """
        if isinstance(image, Tensor):
            if image.ndim == 2:
                image = image.unsqueeze(0).repeat(3, 1, 1)
            elif image.shape[0] == 1:
                image = image.repeat(3, 1, 1)
        elif isinstance(image, np.ndarray):
            if image.ndim == 2:
                image = np.repeat(image[:, :, np.newaxis], 3, axis=2)
            elif image.shape[2] == 1:
                image = np.repeat(image, 3, axis=2)
        return {"image": image, **kwargs}


class GetImageSize(BasePreprocessing):
    """
    Get the size of the image.
    """

    def __call__(self, image: T, **kwargs) -> Dict[str, Any]:
        """
        Args:
            image (T): Image to be converted to grayscale.
            **kwargs: Additional keyword arguments to passthrough.

        Returns:
            Dict[str, Any]: A dictionary with the following key-value pairs:
                - "image": The input image as a grayscale numpy array or PyTorch tensor.
                - "image_size": The size of the input image.
                - **kwargs: The additional keyword arguments passed through unchanged.
        """
        if isinstance(image, Tensor):
            size = tuple(image.shape[1:])
        elif isinstance(image, np.ndarray):
            size = image.shape[:2]
        elif isinstance(image, Image):
            size = image.size
        else:
            raise ValueError(f"Image type not supported: {type(image)}")
        return {"image": image, "image_size": size, **kwargs}


class RGBtoYCrCb(BasePreprocessing):
    """
    Converts RGB image to YCrCb color space.
    """

    def __call__(self, image: T, **kwargs) -> Dict[str, Any]:
        """
        Args:
            image (T): Image to be converted to YCrCb.
            **kwargs: Additional keyword arguments to passthrough.

        Returns:
            Dict[str, Any]: A dictionary with the following key-value pairs:
                - "image": The input image converted to YCrCb color space.
                - **kwargs: The additional keyword arguments passed through unchanged.
        """
        if isinstance(image, Tensor):
            # Convert from RGB [0,1] to YCrCb
            if image.max() <= 1.0:
                image = image * 255.0

            y = 0.299 * image[0] + 0.587 * image[1] + 0.114 * image[2]
            cr = 0.5 + (image[0] - y) * 0.713 / 255.0
            cb = 0.5 + (image[2] - y) * 0.564 / 255.0
            y = y / 255.0

            image = torch.stack([y, cr, cb], dim=0)
        else:
            # Convert from RGB to YCrCb
            if image.max() <= 1.0:
                image = image * 255.0

            y = 0.299 * image[..., 0] + 0.587 * image[..., 1] + 0.114 * image[..., 2]
            cr = 0.5 + (image[..., 0] - y) * 0.713 / 255.0
            cb = 0.5 + (image[..., 2] - y) * 0.564 / 255.0
            y = y / 255.0

            image = np.stack([y, cr, cb], axis=-1)

        return {"image": image, **kwargs}

class RGBtoBGR(BasePreprocessing):
    """
    Converts RGB image to BGR color space using OpenCV for numpy arrays
    and direct channel swapping for PyTorch tensors.
    """

    def __call__(self, image: T, **kwargs) -> Dict[str, Any]:
        """
        Args:
            image (T): Image to be converted from RGB to BGR.
            **kwargs: Additional keyword arguments to passthrough.

        Returns:
            Dict[str, Any]: A dictionary with the following key-value pairs:
                - "image": The input image converted to BGR color space.
                - **kwargs: The additional keyword arguments passed through unchanged.
        """
        if isinstance(image, Tensor):
            # For PyTorch tensors
            if image.ndim == 3 and image.shape[0] == 3:
                bgr_image = image[[2, 1, 0]]
            else:
                bgr_image = image
        else:
            if image.ndim == 3 and image.shape[2] == 3:
                bgr_image = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)
            else:
                bgr_image = image

        return {"image": bgr_image, **kwargs}


class Resize(BasePreprocessing):
    """
    Resizes an image to a target size.
    If target_size is an int:
        - Resize the longer side to this value while preserving aspect ratio.
        - If the longest side is already <= target_size, do nothing.
    If target_size is a tuple: resize directly to that size.
    """

    def __init__(self, target_size: Union[int, Tuple[int, int]]) -> None:
        self.target_size = target_size

    def __call__(self, image: Union[Tensor, np.ndarray], **kwargs) -> Dict[str, Any]:
        # --- PyTorch Tensor ---
        if isinstance(image, Tensor):
            if image.ndim == 3:
                original_size = (image.shape[1], image.shape[2])  # H, W
                image = image.unsqueeze(0)
                was_3d = True
            else:
                original_size = (image.shape[2], image.shape[3])  # H, W
                was_3d = False

            orig_h, orig_w = original_size

            if isinstance(self.target_size, int):
                max_side = max(orig_h, orig_w)
                if max_side <= self.target_size:
                    if was_3d:
                        image = image.squeeze(0)
                    return {"image": image, "original_size": original_size, **kwargs}

                if orig_h >= orig_w:
                    scale = self.target_size / orig_h
                    new_h = self.target_size
                    new_w = int(orig_w * scale)
                else:
                    scale = self.target_size / orig_w
                    new_w = self.target_size
                    new_h = int(orig_h * scale)

                size = (new_h, new_w)
            else:
                size = self.target_size

            image = F.interpolate(
                image,
                size=size,
                mode='bilinear',
                align_corners=True
            )

            if was_3d:
                image = image.squeeze(0)

        # --- NumPy Array ---
        elif isinstance(image, np.ndarray):
            orig_h, orig_w = image.shape[:2]
            original_size = (orig_h, orig_w)

            if isinstance(self.target_size, int):
                max_side = max(orig_h, orig_w)
                if max_side <= self.target_size:
                    return {"image": image, "original_size": original_size, **kwargs}

                if orig_h >= orig_w:
                    scale = self.target_size / orig_h
                    new_h = self.target_size
                    new_w = int(orig_w * scale)
                else:
                    scale = self.target_size / orig_w
                    new_w = self.target_size
                    new_h = int(orig_h * scale)

                size = (new_w, new_h)  # cv2 uses (W, H)
            else:
                size = (self.target_size[1], self.target_size[0])  # (W, H)

            import cv2
            image = cv2.resize(image, size)

        else:
            raise ValueError(f"Image type {type(image)} not supported by Resize")

        return {"image": image, "original_size": original_size, **kwargs}


class EnsureFloatTensor(BasePreprocessing):
    """
    Ensures the image is a float tensor with values in the range [0, 1].
    """

    def __call__(self, image: T, **kwargs) -> Dict[str, Any]:
        """
        Args:
            image (T): Image to ensure is a float tensor.
            **kwargs: Additional keyword arguments to passthrough.

        Returns:
            Dict[str, Any]: A dictionary with the following key-value pairs:
                - "image": The image as a float tensor.
                - **kwargs: The additional keyword arguments passed through unchanged.
        """
        # Ensure image is a float tensor
        if isinstance(image, Tensor):
            if image.dtype != torch.float32:
                image = image.float()

        return {"image": image, **kwargs}


class StoreOriginalSize(BasePreprocessing):
    """
    Stores the original size of the image without modifying it.
    """

    def __call__(self, image: T, **kwargs) -> Dict[str, Any]:
        """
        Args:
            image (T): Image whose size will be stored.
            **kwargs: Additional keyword arguments to passthrough.

        Returns:
            Dict[str, Any]: A dictionary with the following key-value pairs:
                - "image": The original image unchanged.
                - "original_size": The size of the input image (height, width).
                - **kwargs: The additional keyword arguments passed through unchanged.
        """
        if isinstance(image, Tensor):
            if image.ndim == 3:
                size = tuple(image.shape[1:])  # H, W
            else:
                size = tuple(image.shape[2:])  # H, W
        elif isinstance(image, np.ndarray):
            size = image.shape[:2]  # H, W
        elif isinstance(image, Image):
            # PIL stores size as (W, H), convert to (H, W) for consistency
            size = (image.size[1], image.size[0])
        else:
            raise ValueError(f"Image type not supported: {type(image)}")

        return {"image": image, "original_size": size, **kwargs}
