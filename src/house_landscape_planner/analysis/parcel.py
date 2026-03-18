from __future__ import annotations

import math
from pathlib import Path

from house_landscape_planner.io.geojson_loader import extract_feature, extract_outer_ring, load_geojson
from house_landscape_planner.models import ParcelMetrics, ParcelSummary


def polygon_area(points: list[tuple[float, float]]) -> float:
    area = 0.0
    for index in range(len(points) - 1):
        x1, y1 = points[index]
        x2, y2 = points[index + 1]
        area += (x1 * y2) - (x2 * y1)
    return abs(area) / 2.0


def polygon_perimeter(points: list[tuple[float, float]]) -> float:
    perimeter = 0.0
    for index in range(len(points) - 1):
        x1, y1 = points[index]
        x2, y2 = points[index + 1]
        perimeter += math.hypot(x2 - x1, y2 - y1)
    return perimeter


def polygon_centroid(points: list[tuple[float, float]]) -> tuple[float, float]:
    signed_area = 0.0
    centroid_x = 0.0
    centroid_y = 0.0

    for index in range(len(points) - 1):
        x1, y1 = points[index]
        x2, y2 = points[index + 1]
        cross = (x1 * y2) - (x2 * y1)
        signed_area += cross
        centroid_x += (x1 + x2) * cross
        centroid_y += (y1 + y2) * cross

    if math.isclose(signed_area, 0.0):
        xs = [point[0] for point in points[:-1]]
        ys = [point[1] for point in points[:-1]]
        return (sum(xs) / len(xs), sum(ys) / len(ys))

    signed_area *= 0.5
    factor = 1.0 / (6.0 * signed_area)
    return centroid_x * factor, centroid_y * factor


def compute_metrics(points: list[tuple[float, float]]) -> ParcelMetrics:
    area = polygon_area(points)
    perimeter = polygon_perimeter(points)
    centroid_x, centroid_y = polygon_centroid(points)

    xs = [point[0] for point in points[:-1]]
    ys = [point[1] for point in points[:-1]]
    width = max(xs) - min(xs)
    height = max(ys) - min(ys)
    aspect_ratio = (width / height) if not math.isclose(height, 0.0) else math.inf
    irregularity_index = (
        (perimeter ** 2) / (4.0 * math.pi * area)
        if area > 0
        else math.inf
    )

    return ParcelMetrics(
        area=area,
        perimeter=perimeter,
        centroid_x=centroid_x,
        centroid_y=centroid_y,
        width=width,
        height=height,
        aspect_ratio=aspect_ratio,
        irregularity_index=irregularity_index,
        vertex_count=max(len(points) - 1, 0),
    )


def analyze_parcel(path: str | Path) -> ParcelSummary:
    data = load_geojson(path)
    feature = extract_feature(data)
    geometry_type, points = extract_outer_ring(feature)
    metrics = compute_metrics(points)
    return ParcelSummary(
        source_path=Path(path).expanduser().resolve(),
        geometry_type=geometry_type,
        properties=feature.get("properties") or {},
        metrics=metrics,
    )
