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
    metric_points, coordinate_system, linear_unit, area_unit = normalize_points(points)

    area = polygon_area(metric_points)
    perimeter = polygon_perimeter(metric_points)
    centroid_x, centroid_y = polygon_centroid(metric_points)

    xs = [point[0] for point in metric_points[:-1]]
    ys = [point[1] for point in metric_points[:-1]]
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
        area_unit=area_unit,
        linear_unit=linear_unit,
        centroid_x=centroid_x,
        centroid_y=centroid_y,
        width=width,
        height=height,
        aspect_ratio=aspect_ratio,
        irregularity_index=irregularity_index,
        vertex_count=max(len(metric_points) - 1, 0),
        coordinate_system=coordinate_system,
    )


def analyze_parcel(path: str | Path) -> ParcelSummary:
    data = load_geojson(path)
    feature = extract_feature(data)
    geometry_type, points = extract_outer_ring(feature)
    metric_points, _, _, _ = normalize_points(points)
    metrics = compute_metrics(points)
    return ParcelSummary(
        source_path=Path(path).expanduser().resolve(),
        geometry_type=geometry_type,
        properties=feature.get("properties") or {},
        boundary_points=metric_points,
        metrics=metrics,
    )


def normalize_points(
    points: list[tuple[float, float]],
) -> tuple[list[tuple[float, float]], str, str, str]:
    if _looks_like_lon_lat(points):
        projected = _project_lon_lat_to_feet(points)
        return projected, "geographic_lon_lat_projected_local", "feet", "square feet"
    return points, "planar_source_units", "coordinate units", "square coordinate units"


def _looks_like_lon_lat(points: list[tuple[float, float]]) -> bool:
    xs = [point[0] for point in points]
    ys = [point[1] for point in points]
    span_x = max(xs) - min(xs)
    span_y = max(ys) - min(ys)
    mean_x = sum(xs) / len(xs)
    mean_y = sum(ys) / len(ys)
    return (
        all(-180.0 <= x <= 180.0 for x in xs)
        and all(-90.0 <= y <= 90.0 for y in ys)
        and span_x < 1.0
        and span_y < 1.0
        and abs(mean_x) > 20.0
        and abs(mean_y) > 20.0
    )


def _project_lon_lat_to_feet(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    ref_lon, ref_lat = points[0]
    lat_radians = math.radians(ref_lat)

    meters_per_degree_lat = (
        111132.92
        - (559.82 * math.cos(2.0 * lat_radians))
        + (1.175 * math.cos(4.0 * lat_radians))
        - (0.0023 * math.cos(6.0 * lat_radians))
    )
    meters_per_degree_lon = (
        (111412.84 * math.cos(lat_radians))
        - (93.5 * math.cos(3.0 * lat_radians))
        + (0.118 * math.cos(5.0 * lat_radians))
    )
    feet_per_meter = 3.28084

    projected: list[tuple[float, float]] = []
    for lon, lat in points:
        x_feet = (lon - ref_lon) * meters_per_degree_lon * feet_per_meter
        y_feet = (lat - ref_lat) * meters_per_degree_lat * feet_per_meter
        projected.append((x_feet, y_feet))

    return projected
