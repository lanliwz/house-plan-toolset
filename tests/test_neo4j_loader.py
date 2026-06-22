from __future__ import annotations

import json
from pathlib import Path

import pytest

from house_landscape_planner.loaders import neo4j_parcel_loader
from house_landscape_planner.loaders.neo4j_parcel_loader import (
    build_feature_collection,
    choose_primary_building_footprint,
    fetch_suffolk_elevation_dataset,
    fetch_suffolk_elevation_summary,
    load_house_footprint_from_suffolk_gis_into_neo4j,
    load_house_footprint_into_neo4j,
    load_parcel_elevation_into_neo4j,
    project_contour_lines_to_parcel_space,
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


def test_choose_primary_building_footprint_prefers_largest_area() -> None:
    small = neo4j_parcel_loader.SuffolkBuildingFootprintCandidate(
        object_id=1,
        status=None,
        area_square_feet=1200.0,
        perimeter_feet=140.0,
        ring_points=[(-73.1, 40.9), (-73.1005, 40.9), (-73.1005, 40.9004), (-73.1, 40.9004)],
    )
    large = neo4j_parcel_loader.SuffolkBuildingFootprintCandidate(
        object_id=2,
        status=None,
        area_square_feet=2800.0,
        perimeter_feet=220.0,
        ring_points=[(-73.1, 40.9), (-73.1008, 40.9), (-73.1008, 40.9007), (-73.1, 40.9007)],
    )

    selected = choose_primary_building_footprint([small, large])

    assert selected is not None
    assert selected.object_id == 2


def test_fetch_suffolk_elevation_summary_builds_range(monkeypatch) -> None:
    calls: list[int] = []

    def fake_query(points, layer_id):
        calls.append(layer_id)
        if layer_id == 15:
            return [35.0, 40.0, 45.0, 50.0]
        if layer_id == 16:
            return [40.0, 50.0]
        return []

    monkeypatch.setattr(neo4j_parcel_loader, "query_suffolk_contours", fake_query)
    summary = fetch_suffolk_elevation_summary(
        [(-73.1, 40.9), (-73.2, 40.9), (-73.2, 40.8), (-73.1, 40.8), (-73.1, 40.9)]
    )

    assert calls == [15, 16]
    assert summary.min_elevation_feet == 35.0
    assert summary.max_elevation_feet == 50.0
    assert summary.relief_feet == 15.0
    assert summary.contour_5ft_values == [35.0, 40.0, 45.0, 50.0]
    assert summary.contour_10ft_values == [40.0, 50.0]


def test_fetch_suffolk_elevation_dataset_includes_contour_geometry(monkeypatch) -> None:
    def fake_query(points, layer_id):
        if layer_id == 15:
            return [
                neo4j_parcel_loader.ContourLineSummary(
                    contour_id="contour-5-100",
                    label="Contour 35 ft",
                    elevation_feet=35.0,
                    interval_feet=5,
                    source_layer="suffolk_contours_5ft",
                    paths=[[(-73.1, 40.9), (-73.2, 40.85)]],
                )
            ]
        return [
            neo4j_parcel_loader.ContourLineSummary(
                contour_id="contour-10-200",
                label="Contour 40 ft",
                elevation_feet=40.0,
                interval_feet=10,
                source_layer="suffolk_contours_10ft",
                paths=[[(-73.2, 40.88), (-73.15, 40.82)]],
            )
        ]

    monkeypatch.setattr(neo4j_parcel_loader, "query_suffolk_contour_features", fake_query)

    summary, contour_lines = fetch_suffolk_elevation_dataset(
        [(-73.1, 40.9), (-73.2, 40.9), (-73.2, 40.8), (-73.1, 40.8), (-73.1, 40.9)]
    )

    assert summary.min_elevation_feet == 35.0
    assert summary.max_elevation_feet == 40.0
    assert len(contour_lines) == 2
    assert contour_lines[0].paths[0][0] == (-73.1, 40.9)


def test_project_contour_lines_to_parcel_space_uses_parcel_reference() -> None:
    contour_lines = [
        neo4j_parcel_loader.ContourLineSummary(
            contour_id="contour-5-100",
            label="Contour 35 ft",
            elevation_feet=35.0,
            interval_feet=5,
            source_layer="suffolk_contours_5ft",
            paths=[[(-73.115981, 40.930669), (-73.116081, 40.930769)]],
        )
    ]

    projected = project_contour_lines_to_parcel_space(
        contour_lines,
        [(-73.115981, 40.930669), (-73.116326, 40.931051)],
    )

    assert projected[0].paths[0][0] == (0.0, 0.0)
    assert projected[0].paths[0][1][0] < 0.0
    assert projected[0].paths[0][1][1] > 0.0


def test_load_parcel_elevation_into_neo4j_stores_summary(monkeypatch) -> None:
    saved_payload: dict[str, object] = {}

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
            if "RETURN collect(properties(vertex)) AS vertices" in query:
                return FakeResult(
                    {
                        "vertices": [
                            {"vertexSequenceNumber": 1, "longitude": -73.1, "latitude": 40.9},
                            {"vertexSequenceNumber": 2, "longitude": -73.2, "latitude": 40.9},
                            {"vertexSequenceNumber": 3, "longitude": -73.2, "latitude": 40.8},
                            {"vertexSequenceNumber": 4, "longitude": -73.1, "latitude": 40.8},
                        ]
                    }
                )
            if f"SET parcel.{neo4j_parcel_loader.ELEVATION_SUMMARY_PROPERTY} = $summary_json" in query:
                saved_payload["parcel_id"] = params["parcel_id"]
                saved_payload["summary_json"] = params["summary_json"]
                saved_payload["contours_json"] = params["contours_json"]
                return FakeResult()
            return FakeResult({"parcel_id": "p-1"})

    class FakeDriver:
        def session(self, database=None):
            return FakeSession()

        def close(self):
            return None

    monkeypatch.setattr(neo4j_parcel_loader, "get_neo4j_config", lambda database: neo4j_parcel_loader.Neo4jConfig("bolt://test", "neo4j", "pw", database))
    monkeypatch.setattr(neo4j_parcel_loader.GraphDatabase, "driver", lambda uri, auth=None: FakeDriver())
    monkeypatch.setattr(
        neo4j_parcel_loader,
        "fetch_suffolk_elevation_dataset",
        lambda points: (
            neo4j_parcel_loader.ElevationSummary(
                source="suffolk_county_gisviewer_contours",
                min_elevation_feet=35.0,
                max_elevation_feet=80.0,
                relief_feet=45.0,
                contour_5ft_values=[35.0, 40.0, 45.0, 50.0, 55.0, 60.0, 65.0, 70.0, 75.0, 80.0],
                contour_10ft_values=[40.0, 50.0, 60.0, 70.0, 80.0],
            ),
            [
                neo4j_parcel_loader.ContourLineSummary(
                    contour_id="contour-5-100",
                    label="Contour 35 ft",
                    elevation_feet=35.0,
                    interval_feet=5,
                    source_layer="suffolk_contours_5ft",
                    paths=[[(-73.1, 40.9), (-73.2, 40.85)]],
                )
            ],
        ),
    )

    result = load_parcel_elevation_into_neo4j(parcel_id="p-1", database="hp62n")

    assert result["relief_feet"] == 45.0
    assert saved_payload["parcel_id"] == "p-1"
    assert "\"min_elevation_feet\": 35.0" in str(saved_payload["summary_json"])
    assert "\"contour_id\": \"contour-5-100\"" in str(saved_payload["contours_json"])


def test_load_house_footprint_from_suffolk_gis_into_neo4j_projects_and_saves(monkeypatch) -> None:
    saved_payload: dict[str, object] = {}

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
            if "RETURN collect(properties(vertex)) AS vertices" in query:
                return FakeResult(
                    {
                        "vertices": [
                            {"vertexSequenceNumber": 1, "longitude": -73.115981, "latitude": 40.930669},
                            {"vertexSequenceNumber": 2, "longitude": -73.116326, "latitude": 40.931051},
                            {"vertexSequenceNumber": 3, "longitude": -73.116758, "latitude": 40.930819},
                        ]
                    }
                )
            if "RETURN parcel.parcelId AS parcel_id" in query:
                return FakeResult({"parcel_id": params["parcel_id"]})
            if f"SET parcel.{neo4j_parcel_loader.HOUSE_PLAN_POINTS_PROPERTY} = $house_plan_payload" in query:
                saved_payload["parcel_id"] = params["parcel_id"]
                saved_payload["house_plan_payload"] = params["house_plan_payload"]
                return FakeResult()
            return FakeResult()

    class FakeDriver:
        def session(self, database=None):
            return FakeSession()

        def close(self):
            return None

    monkeypatch.setattr(neo4j_parcel_loader, "get_neo4j_config", lambda database: neo4j_parcel_loader.Neo4jConfig("bolt://test", "neo4j", "pw", database))
    monkeypatch.setattr(neo4j_parcel_loader.GraphDatabase, "driver", lambda uri, auth=None: FakeDriver())
    monkeypatch.setattr(
        neo4j_parcel_loader,
        "query_suffolk_building_footprints",
        lambda closed_points: [
            neo4j_parcel_loader.SuffolkBuildingFootprintCandidate(
                object_id=230001,
                status=None,
                area_square_feet=2800.0,
                perimeter_feet=220.0,
                ring_points=[
                    (-73.115981, 40.930669),
                    (-73.116031, 40.930669),
                    (-73.116031, 40.930719),
                    (-73.115981, 40.930719),
                ],
            )
        ],
    )

    result = load_house_footprint_from_suffolk_gis_into_neo4j(parcel_id="p-1", database="hp62n", apply_constraints=False)

    assert result["source_layer"] == "suffolk_building_footprints"
    assert result["source_object_id"] == "230001"
    assert result["candidate_count"] == 1
    assert saved_payload["parcel_id"] == "p-1"
    stored_points = json.loads(str(saved_payload["house_plan_payload"]))
    assert stored_points[0] == [0.0, 0.0]
    assert abs(stored_points[1][0]) < 50.0
    assert abs(stored_points[1][1]) < 50.0
