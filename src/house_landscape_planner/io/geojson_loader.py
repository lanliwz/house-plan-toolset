from __future__ import annotations

import json
from pathlib import Path


def load_geojson(path: str | Path) -> dict:
    geojson_path = Path(path).expanduser().resolve()
    with geojson_path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def extract_feature(data: dict) -> dict:
    data_type = data.get("type")
    if data_type == "FeatureCollection":
        features = data.get("features") or []
        if not features:
            raise ValueError("GeoJSON FeatureCollection contains no features.")
        return features[0]
    if data_type == "Feature":
        return data
    if data_type in {"Polygon", "MultiPolygon"}:
        return {"type": "Feature", "properties": {}, "geometry": data}
    raise ValueError(f"Unsupported GeoJSON top-level type: {data_type!r}")


def extract_outer_ring(feature: dict) -> tuple[str, list[tuple[float, float]]]:
    geometry = feature.get("geometry") or {}
    geometry_type = geometry.get("type")
    coordinates = geometry.get("coordinates") or []

    if geometry_type == "Polygon":
        ring = coordinates[0] if coordinates else []
    elif geometry_type == "MultiPolygon":
        first_polygon = coordinates[0] if coordinates else []
        ring = first_polygon[0] if first_polygon else []
    else:
        raise ValueError(f"Unsupported geometry type: {geometry_type!r}")

    if len(ring) < 4:
        raise ValueError("Parcel boundary must contain at least four coordinates.")

    points = [(float(point[0]), float(point[1])) for point in ring]
    return geometry_type, points
