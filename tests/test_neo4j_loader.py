from __future__ import annotations

import json
from pathlib import Path

import pytest

from house_landscape_planner.loaders import neo4j_parcel_loader
from house_landscape_planner.loaders.neo4j_parcel_loader import (
    build_feature_collection,
    load_house_footprint_into_neo4j,
)


def test_build_feature_collection_creates_onto2ai_parcel_models() -> None:
    bundles, collection = build_feature_collection("tests/data/sample_parcel.geojson", default_state="NY")

    assert collection.feature_collection_id == "sample-parcel"
    assert len(bundles) == 1

    bundle = bundles[0]
    assert bundle.parcel.parcel_id == "sample-001"
    assert bundle.parcel.full_address_text == "123 Hillside Lane"
    assert bundle.feature.feature_id == "sample-001-feature"
    assert bundle.parcel.has_parcel_geometry[0].geometry_id == "sample-001-geometry-1"
    assert len(bundle.parcel.has_parcel_geometry[0].has_boundary_vertex) == 5


def test_build_feature_collection_adds_us_postal_address_when_fields_exist(tmp_path) -> None:
    geojson_path = tmp_path / "parcel_with_address.geojson"
    geojson_path.write_text(
        json.dumps(
            {
                "type": "Feature",
                "properties": {
                    "PARCELID": "0200154000400039003",
                    "FULLADDRESS": "62 North Country Road",
                    "MUNICIPALITY": "East Setauket",
                    "ZIPCODE": "11733",
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0], [0.0, 0.0]]],
                },
            }
        ),
        encoding="utf-8",
    )

    bundles, _ = build_feature_collection(geojson_path, default_state="NY")

    address = bundles[0].parcel.has_parcel_address[0]
    assert address.street_address_line1 == "62 North Country Road"
    assert address.city_name == "East Setauket"
    assert address.postal_code == "11733"
    assert address.subdivision.value == "NY"


def test_load_house_footprint_into_neo4j_rejects_missing_parcel(monkeypatch, tmp_path) -> None:
    house_geojson = tmp_path / "house.geojson"
    house_geojson.write_text(
        json.dumps(
            {
                "type": "Feature",
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[[0.0, 0.0], [20.0, 0.0], [20.0, 10.0], [0.0, 10.0], [0.0, 0.0]]],
                },
                "properties": {},
            }
        ),
        encoding="utf-8",
    )

    class FakeResult:
        def __init__(self, row=None):
            self._row = row

        def single(self):
            return self._row

        def consume(self):
            return None

    class FakeSession:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def run(self, query, **params):
            if "RETURN parcel.parcelId AS parcel_id" in query:
                return FakeResult(None)
            return FakeResult()

    class FakeDriver:
        def session(self, database=None):
            return FakeSession()

        def close(self):
            return None

    monkeypatch.setattr(neo4j_parcel_loader, "get_neo4j_config", lambda database: neo4j_parcel_loader.Neo4jConfig("bolt://test", "neo4j", "pw", database))
    monkeypatch.setattr(neo4j_parcel_loader.GraphDatabase, "driver", lambda uri, auth=None: FakeDriver())

    with pytest.raises(ValueError, match="Parcel 'missing' not found"):
        load_house_footprint_into_neo4j(
            parcel_id="missing",
            house_geojson_path=house_geojson,
            database="hp62n",
            apply_constraints=False,
        )
