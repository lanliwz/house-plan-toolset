from __future__ import annotations

from io import BytesIO

from fastapi.testclient import TestClient
from PIL import Image

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
    assert len(payload["objects"]["edges"]) == payload["metrics"]["vertex_count"]
    assert len(payload["objects"]["vertices"]) == payload["metrics"]["vertex_count"]


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
    assert "<svg" in payload["diagram_svg"]
    assert payload["objects"]["edges"][0]["properties"]["length"] == 20.0
    assert payload["objects"]["edges"][0]["properties"]["length_unit"] == "meters"
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
