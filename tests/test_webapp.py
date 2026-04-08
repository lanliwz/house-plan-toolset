from __future__ import annotations

from io import BytesIO

from fastapi.testclient import TestClient
from PIL import Image

from house_landscape_planner.analysis.site_report import create_site_assessment
from house_landscape_planner.webapp.main import app


client = TestClient(app)


def create_test_image_bytes() -> bytes:
    buffer = BytesIO()
    image = Image.new("RGB", (32, 24), color=(120, 170, 140))
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def test_health_endpoint() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


def test_sample_analysis_endpoint_returns_report_payload() -> None:
    response = client.get("/api/sample")

    assert response.status_code == 200
    payload = response.json()

    assert payload["parcel_name"] == "sample_parcel.geojson"
    assert "report_markdown" in payload
    assert "diagram_svg" in payload
    assert payload["metrics"]["vertex_count"] >= 4
    assert payload["objects"]["parcel"]["id"] == "parcel"
    assert payload["objects"]["parcel"]["properties"]["parcel_id"] == "sample-001"
    assert payload["objects"]["parcel"]["properties"]["full_address_text"] == "123 Hillside Lane"
    assert payload["landscape_features"][0]["ontology_class"].startswith("http://www.onto2ai-toolset.com/ontology/landscape/Landscape#")
    assert len(payload["objects"]["features"]) == len(payload["landscape_features"])
    assert len(payload["objects"]["edges"]) == payload["metrics"]["vertex_count"]
    assert len(payload["objects"]["vertices"]) == payload["metrics"]["vertex_count"]


def test_neo4j_catalog_endpoint(monkeypatch) -> None:
    monkeypatch.setattr(
        "house_landscape_planner.webapp.main.list_parcels_from_neo4j",
        lambda database="hp62n": [
            type("ParcelItem", (), {"parcel_id": "p-1", "label": "62 North Country Road", "vertex_count": 8, "uri": "urn:test"})()
        ],
    )

    response = client.get("/api/neo4j/parcels")

    assert response.status_code == 200
    assert response.json()[0]["parcel_id"] == "p-1"


def test_neo4j_parcel_endpoint_returns_site_assessment(monkeypatch) -> None:
    monkeypatch.setattr(
        "house_landscape_planner.webapp.main.create_site_assessment_from_neo4j",
        lambda parcel_id, database="hp62n": create_site_assessment("tests/data/sample_parcel.geojson"),
    )

    response = client.get("/api/neo4j/parcels/p-1")

    assert response.status_code == 200
    assert response.json()["parcel_name"] == "p-1"
    assert response.json()["persistence_mode"] == "neo4j"


def test_save_neo4j_features_endpoint_returns_updated_assessment(monkeypatch) -> None:
    saved: dict[str, object] = {}

    def fake_save(parcel_id, *, database="hp62n", features):
        saved["parcel_id"] = parcel_id
        saved["database"] = database
        saved["feature_count"] = len(features)

    monkeypatch.setattr("house_landscape_planner.webapp.main.save_feature_layout_to_neo4j", fake_save)
    monkeypatch.setattr(
        "house_landscape_planner.webapp.main.create_site_assessment_from_neo4j",
        lambda parcel_id, database="hp62n": create_site_assessment("tests/data/sample_parcel.geojson"),
    )

    response = client.post(
        "/api/neo4j/parcels/p-1/features",
        params={"database": "hp62n"},
        json=[
            {
                "feature_id": "feature-terrace-room",
                "name": "Rectangular Gray Brick Patio",
                "ontology_class": "http://www.onto2ai-toolset.com/ontology/landscape/Landscape#OutdoorTerrace",
                "zone_name": "Private Outdoor Living Terrace",
                "summary": "Rectangular gray-brick patio sized for dining and everyday outdoor living close to the house.",
                "intent": "Create one primary usable outdoor room sized for seating, dining, and everyday gathering close to the house.",
                "placement": "Locate this zone immediately off the house on the broadest and most level-looking portion of the parcel.",
                "rationale": "A single rectangular brick patio creates a clear gathering surface.",
                "design_moves": ["Use one durable surface."],
                "priority": "high",
                "target_share_percent": 28,
                "anchor_x_ratio": 0.52,
                "anchor_y_ratio": 0.5,
                "width_ratio": 0.3,
                "height_ratio": 0.18,
                "visual_kind": "patio",
                "rotation_degrees": 12.5,
            }
        ],
    )

    assert response.status_code == 200
    assert saved == {"parcel_id": "p-1", "database": "hp62n", "feature_count": 1}
    assert response.json()["parcel_name"] == "p-1"


def test_remove_neo4j_feature_endpoint_returns_updated_assessment(monkeypatch) -> None:
    removed: dict[str, object] = {}

    def fake_remove(parcel_id, feature_id, *, database="hp62n"):
        removed["parcel_id"] = parcel_id
        removed["feature_id"] = feature_id
        removed["database"] = database

    monkeypatch.setattr("house_landscape_planner.webapp.main.remove_feature_from_neo4j", fake_remove)
    monkeypatch.setattr(
        "house_landscape_planner.webapp.main.create_site_assessment_from_neo4j",
        lambda parcel_id, database="hp62n": create_site_assessment("tests/data/sample_parcel.geojson"),
    )

    response = client.delete("/api/neo4j/parcels/p-1/features/feature-terrace-room", params={"database": "hp62n"})

    assert response.status_code == 200
    assert removed == {"parcel_id": "p-1", "feature_id": "feature-terrace-room", "database": "hp62n"}
    assert response.json()["parcel_name"] == "p-1"


def test_analyze_endpoint_accepts_uploads() -> None:
    geojson = b"""
    {
      "type": "Feature",
      "properties": {
        "address": "456 Terrace View"
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[0, 0], [20, 0], [20, 10], [0, 10], [0, 0]]]
      }
    }
    """
    image_bytes = create_test_image_bytes()

    response = client.post(
        "/api/analyze",
        files={
            "parcel": ("parcel.geojson", geojson, "application/geo+json"),
            "image": ("site.png", image_bytes, "image/png"),
        },
    )

    assert response.status_code == 200
    payload = response.json()

    assert payload["parcel_name"] == "parcel.geojson"
    assert payload["image"]["width_px"] == 32
    assert "Site Assessment" in payload["report_markdown"]
    assert "Landscape Feature Program" in payload["report_markdown"]
    assert "<svg" in payload["diagram_svg"]
    assert payload["objects"]["edges"][0]["properties"]["length"] == 20.0
    assert payload["objects"]["edges"][0]["properties"]["length_unit"] == "meters"
    assert payload["objects"]["features"][0]["kind"] == "feature"
    assert payload["objects"]["parcel"]["properties"]["full_address_text"] == "456 Terrace View"
    assert payload["objects"]["vertices"][0]["properties"]["gps_coordinate_id"] == "parcel-vertex-1"
    assert payload["objects"]["vertices"][0]["properties"]["longitude"] == 0.0


def test_analyze_endpoint_rejects_invalid_geojson() -> None:
    response = client.post(
        "/api/analyze",
        files={"parcel": ("broken.geojson", b'{"type":"Point"}', "application/geo+json")},
    )

    assert response.status_code == 400
    assert "Unsupported GeoJSON top-level type" in response.json()["detail"]
