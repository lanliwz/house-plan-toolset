from __future__ import annotations

import subprocess
from pathlib import Path

from house_landscape_planner.models import ImageSummary


def load_image_summary(path: str | Path) -> ImageSummary:
    image_path = Path(path).expanduser().resolve()

    try:
        from PIL import Image
    except ModuleNotFoundError:
        return _load_with_sips(image_path)

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


def _load_with_sips(image_path: Path) -> ImageSummary:
    result = subprocess.run(
        [
            "sips",
            "-g",
            "pixelWidth",
            "-g",
            "pixelHeight",
            "-g",
            "format",
            str(image_path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )

    values: dict[str, str] = {}
    for line in result.stdout.splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        values[key.strip()] = value.strip()

    return ImageSummary(
        source_path=image_path,
        width_px=int(values["pixelWidth"]),
        height_px=int(values["pixelHeight"]),
        mode="unknown",
        format=values.get("format"),
    )
