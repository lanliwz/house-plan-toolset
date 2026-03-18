from __future__ import annotations

from pathlib import Path

from house_landscape_planner.models import ImageSummary


def load_image_summary(path: str | Path) -> ImageSummary:
    try:
        from PIL import Image
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "Pillow is required to read satellite imagery. Install dependencies with `pip install -e .`."
        ) from exc

    image_path = Path(path).expanduser().resolve()
    with Image.open(image_path) as image:
        width, height = image.size
        mode = image.mode
        image_format = image.format

    return ImageSummary(
        source_path=image_path,
        width_px=width,
        height_px=height,
        mode=mode,
        format=image_format,
    )
