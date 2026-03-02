"""Image utility functions."""

import logging
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Optional, Tuple, Union

import cv2 as cv
import numpy as np
import torch
from numpy.typing import NDArray
from torch import Tensor

logger = logging.getLogger(__name__)


def tensor2numpy(tensor: Tensor) -> NDArray:
    """
    Convert a PyTorch tensor to a numpy array.

    Args:
        tensor (Tensor): Input tensor.

    Returns:
        NDArray: Numpy array.
    """
    return tensor.detach().cpu().numpy()


def numpy2tensor(array: NDArray) -> Tensor:
    """
    Convert a numpy array to a PyTorch tensor.

    Args:
        array (NDArray): Input numpy array.

    Returns:
        Tensor: PyTorch tensor.
    """
    return torch.from_numpy(array)


def ensure_hwc(image: Union[NDArray, Tensor]) -> NDArray:
    """
    Ensure image is in HWC (Height, Width, Channels) format.

    Args:
        image: Input image in either HWC or CHW format.

    Returns:
        NDArray: Image in HWC format.
    """
    if isinstance(image, Tensor):
        image = tensor2numpy(image)

    if image.ndim == 2:
        return image[:, :, np.newaxis]
    elif image.ndim == 3:
        if image.shape[0] in [1, 3, 4] and image.shape[2] not in [1, 3, 4]:
            # CHW -> HWC
            return np.transpose(image, (1, 2, 0))
        return image
    else:
        raise ValueError(f"Expected 2D or 3D image, got shape {image.shape}")


def ensure_chw(image: Union[NDArray, Tensor]) -> Tensor:
    """
    Ensure image is in CHW (Channels, Height, Width) format as a tensor.

    Args:
        image: Input image in either HWC or CHW format.

    Returns:
        Tensor: Image in CHW format.
    """
    if isinstance(image, Tensor):
        image = tensor2numpy(image)

    if image.ndim == 2:
        image = image[np.newaxis, :, :]
    elif image.ndim == 3:
        if image.shape[2] in [1, 3, 4] and image.shape[0] not in [1, 3, 4]:
            # HWC -> CHW
            image = np.transpose(image, (2, 0, 1))
    else:
        raise ValueError(f"Expected 2D or 3D image, got shape {image.shape}")

    return torch.from_numpy(image)


def read_image(path: str | Path) -> Tensor:
    """
    Read an image from a file and return it as a tensor (CHW format).

    Args:
        path (str | Path): The path to the image file.

    Returns:
        Tensor: The image as a tensor in CHW format.
    """
    return torch.from_numpy(
        cv.cvtColor(cv.imread(str(path)), cv.COLOR_BGR2RGB).transpose(2, 0, 1)
    )


def save_image(path: str, img: Tensor | NDArray, *args):
    """
    Save an image to a file.

    Args:
        path (str): The path to the file.
        img (Tensor | NDArray): The image to save.
        *args: Additional arguments to pass to `cv.imwrite`.
    """
    if isinstance(img, Tensor):
        img_bgr = cv.cvtColor(tensor2numpy(img).transpose(1, 2, 0), cv.COLOR_RGB2BGR)
    else:
        img_bgr = cv.cvtColor(img, cv.COLOR_RGB2BGR)
    cv.imwrite(path, img_bgr, *args)


def read_jpeg_data(
    image_path: str,
    num_dct_channels: Optional[int] = None,
    all_quant_tables: bool = False,
    suppress_not_jpeg_warning: bool = False,
) -> Tuple[Tensor, Tensor]:
    """Reads image from path and returns DCT coefficient matrix for each channel and the
    quantization matrixes. If image is in jpeg format, it decodes the DCT stream and
    returns it. Otherwise, the image is saved into a temporary jpeg file and then the
    DCT stream is decoded.

    Args:
        image_path (str): Path to the image.
        num_dct_channels (int, optional): Number of channels to read from the DCT stream.
            Defaults to None.
        all_quant_tables (bool, optional): If True, returns all quantization tables.
            Defaults to False.
        suppress_not_jpeg_warning (bool, optional): If True, suppresses the warning
            when the image is not in JPEG format. Defaults to False.

    Returns:
        Tuple[Tensor, Tensor]: DCT coefficients and quantization tables.
    """
    try:
        import jpegio
    except ImportError:
        raise ImportError(
            "jpegio is required for reading JPEG DCT data. "
            "Install it with: pip install jpegio"
        )

    if str(image_path).lower().endswith((".jpg", ".jpeg")):
        jpeg = jpegio.read(str(image_path))
    else:
        if not suppress_not_jpeg_warning:
            logger.warning(
                "Image is not in JPEG format. An approximation will be loaded by "
                "compressing the image in quality 100."
            )
        temp = NamedTemporaryFile(suffix=".jpg", delete=False)
        img = read_image(image_path)
        save_image(temp.name, img, [cv.IMWRITE_JPEG_QUALITY, 100])
        jpeg = jpegio.read(temp.name)

    return torch.tensor(
        _DCT_from_jpeg(jpeg, num_channels=num_dct_channels)
    ), torch.tensor(np.array(_qtables_from_jpeg(jpeg, all=all_quant_tables)))


def _qtables_from_jpeg(jpeg, all: bool = False) -> NDArray:
    """
    Gets the quantization tables from a JPEG image.

    Args:
        jpeg: The decompressed JPEG image.
        all (bool, optional): If True, returns all quantization tables.
            Defaults to False.

    Returns:
        NDArray: The quantization tables.
    """
    if all:
        return np.array(
            [jpeg.quant_tables[i].copy() for i in range(len(jpeg.quant_tables))]
        )
    else:
        return np.array(jpeg.quant_tables[0].copy())


def _DCT_from_jpeg(
    jpeg, num_channels: Optional[int] = None
) -> NDArray:
    """
    Gets the DCT coefficients from a JPEG image.

    Args:
        jpeg: The decompressed JPEG image.
        num_channels (int, optional): Number of channels to read from the DCT stream.
            Defaults to None.

    Returns:
        NDArray: The DCT coefficients.

    Note: Code derived from https://github.com/mjkwon2021/CAT-Net.git.
    """
    if num_channels is None:
        num_channels = len(jpeg.coef_arrays)
    ci = jpeg.comp_info

    sampling_factors = np.array(
        [[ci[i].v_samp_factor, ci[i].h_samp_factor] for i in range(num_channels)]
    )
    if num_channels == 3:
        if (sampling_factors[:, 0] == sampling_factors[0, 0]).all():
            sampling_factors[:, 0] = 2
        if (sampling_factors[:, 1] == sampling_factors[0, 1]).all():
            sampling_factors[:, 1] = 2
    else:
        sampling_factors[0, :] = 2

    dct_shape = jpeg.coef_arrays[0].shape
    DCT_coef = np.empty((num_channels, *dct_shape))

    for i in range(num_channels):
        r, c = jpeg.coef_arrays[i].shape
        block_coefs = (
            jpeg.coef_arrays[i].reshape(r // 8, 8, c // 8, 8).transpose(0, 2, 1, 3)
        )
        r_factor, c_factor = 2 // sampling_factors[i][0], 2 // sampling_factors[i][1]
        channel_coefficients = np.zeros((r * r_factor, c * c_factor))
        channel_coefficient_blocks = channel_coefficients.reshape(
            r // 8, r_factor * 8, c // 8, c_factor * 8
        ).transpose(0, 2, 1, 3)
        channel_coefficient_blocks[:, :, :, :] = np.tile(
            block_coefs, (r_factor, c_factor)
        )

        DCT_coef[i, :, :] = channel_coefficients[: dct_shape[0], : dct_shape[1]]

    return DCT_coef.astype(int)
