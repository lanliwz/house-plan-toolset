from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(slots=True)
class ParcelMetrics:
    area: float
    perimeter: float
    centroid_x: float
    centroid_y: float
    width: float
    height: float
    aspect_ratio: float
    irregularity_index: float
    vertex_count: int


@dataclass(slots=True)
class ParcelSummary:
    source_path: Path
    geometry_type: str
    properties: dict[str, object]
    metrics: ParcelMetrics


@dataclass(slots=True)
class ImageSummary:
    source_path: Path
    width_px: int
    height_px: int
    mode: str
    format: str | None


@dataclass(slots=True)
class SiteAssessment:
    parcel: ParcelSummary
    image: ImageSummary | None
    recommendations: list[str]
    next_data_to_collect: list[str]
