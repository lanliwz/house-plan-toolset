from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(slots=True)
class ParcelMetrics:
    area: float
    perimeter: float
    area_unit: str
    linear_unit: str
    centroid_x: float
    centroid_y: float
    width: float
    height: float
    aspect_ratio: float
    irregularity_index: float
    vertex_count: int
    coordinate_system: str


@dataclass(slots=True)
class ParcelSummary:
    source_path: Path
    geometry_type: str
    properties: dict[str, object]
    source_boundary_points: list[tuple[float, float]]
    boundary_points: list[tuple[float, float]]
    metrics: ParcelMetrics


@dataclass(slots=True)
class ImageSummary:
    source_path: Path
    width_px: int
    height_px: int
    mode: str
    format: str | None


@dataclass(slots=True)
class ConceptZone:
    name: str
    intent: str
    siting: str
    moves: list[str]
    target_share_percent: int


@dataclass(slots=True)
class LandscapeFeature:
    feature_id: str
    name: str
    ontology_class: str
    zone_name: str
    summary: str
    intent: str
    placement: str
    rationale: str
    design_moves: list[str]
    priority: str
    target_share_percent: int | None
    anchor_x_ratio: float
    anchor_y_ratio: float
    width_ratio: float
    height_ratio: float
    visual_kind: str
    rotation_degrees: float | None = None


@dataclass(slots=True)
class SiteAssessment:
    parcel: ParcelSummary
    image: ImageSummary | None
    assumptions: list[str]
    concept_zones: list[ConceptZone]
    landscape_features: list[LandscapeFeature]
    recommendations: list[str]
    next_data_to_collect: list[str]
