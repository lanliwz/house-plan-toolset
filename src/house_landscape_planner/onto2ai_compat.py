from __future__ import annotations

import sys
from pathlib import Path


def _ensure_sibling_onto2ai_source() -> None:
    repo_root = Path(__file__).resolve().parents[2]
    sibling_root = repo_root.parent / "neo4j-onto2ai-toolset"
    if sibling_root.exists():
        sibling_path = str(sibling_root)
        if sibling_path not in sys.path:
            sys.path.append(sibling_path)


try:
    from onto2ai_parcel import STAGING_CONSTRAINT_PATH
    from onto2ai_parcel.staging.pydantic_parcel_model import (
        BoundaryVertex,
        CountryEnum,
        GeoJSONFeature,
        GeoJSONFeatureCollection,
        Parcel,
        PolygonGeometry,
        USPostalAddress,
        USStateEnum,
    )
except ModuleNotFoundError:
    _ensure_sibling_onto2ai_source()
    from onto2ai_parcel import STAGING_CONSTRAINT_PATH
    from onto2ai_parcel.staging.pydantic_parcel_model import (
        BoundaryVertex,
        CountryEnum,
        GeoJSONFeature,
        GeoJSONFeatureCollection,
        Parcel,
        PolygonGeometry,
        USPostalAddress,
        USStateEnum,
    )


__all__ = [
    "BoundaryVertex",
    "CountryEnum",
    "GeoJSONFeature",
    "GeoJSONFeatureCollection",
    "Parcel",
    "PolygonGeometry",
    "STAGING_CONSTRAINT_PATH",
    "USPostalAddress",
    "USStateEnum",
]
