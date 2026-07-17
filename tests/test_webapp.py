from __future__ import annotations

from io import BytesIO
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image

from house_landscape_planner.analysis.site_report import create_site_assessment
from house_landscape_planner.loaders import neo4j_parcel_loader
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


def test_web_assets_are_revalidated_and_use_current_cache_versions() -> None:
    page_response = client.get("/")
    javascript_response = client.get("/static/js/app.js")

    assert page_response.status_code == 200
    assert page_response.headers["cache-control"] == "no-cache, max-age=0, must-revalidate"
    assert javascript_response.headers["cache-control"] == "no-cache, max-age=0, must-revalidate"
    assert "/static/css/styles.css?v=45" in page_response.text
    assert "/static/js/app.js?v=74" in page_response.text


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
    assert payload["objects"]["contours"] == []
    assert len(payload["objects"]["edges"]) == payload["metrics"]["vertex_count"]
    assert len(payload["objects"]["vertices"]) == payload["metrics"]["vertex_count"]
    assert payload["objects"]["rooms"] == []
    assert payload["objects"]["utilities"] == []


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
    def fake_neo4j_assessment(parcel_id, database="hp62n"):
        assessment = create_site_assessment("tests/data/sample_parcel.geojson")
        assessment.parcel.source_path = Path(f"/neo4j/{database}/{parcel_id}.geojson")
        return assessment

    monkeypatch.setattr(
        "house_landscape_planner.webapp.main.create_site_assessment_from_neo4j",
        fake_neo4j_assessment,
    )

    response = client.get("/api/neo4j/parcels/p-1")

    assert response.status_code == 200
    assert response.json()["parcel_name"] == "p-1"
    assert response.json()["persistence_mode"] == "neo4j"


def test_save_neo4j_features_endpoint_returns_updated_assessment(monkeypatch) -> None:
    saved: dict[str, object] = {}

    def fake_save(parcel_id, *, database="hp62n", features, house_plan_points=None, rooms=None):
        saved["parcel_id"] = parcel_id
        saved["database"] = database
        saved["feature_count"] = len(features)
        saved["house_plan_point_count"] = len(house_plan_points or [])
        saved["rooms"] = rooms or []

    monkeypatch.setattr("house_landscape_planner.webapp.main.save_feature_layout_to_neo4j", fake_save)
    monkeypatch.setattr(
        "house_landscape_planner.webapp.main.create_site_assessment_from_neo4j",
        lambda parcel_id, database="hp62n": create_site_assessment("tests/data/sample_parcel.geojson"),
    )

    response = client.post(
        "/api/neo4j/parcels/p-1/features",
        params={"database": "hp62n"},
        json={
            "features": [
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
            "house_plan_points": [[0.0, 0.0], [10.0, 0.0], [10.0, 8.0], [0.0, 8.0]],
            "rooms": [
                {
                    "room_id": "room-2",
                    "label": "Bedroom 2",
                    "room_type": "bedroom",
                    "level_name": "second floor",
                    "area": 120.0,
                    "area_unit": "square feet",
                    "width": 10.0,
                    "height": 12.0,
                    "linear_unit": "feet",
                    "notes": "Editable bedroom",
                    "floor_polygon_ratios": [[0.1, 0.1], [0.4, 0.1], [0.45, 0.3], [0.1, 0.3]],
                    "interior_design": {
                        "fixture_layout": [
                            {
                                "id": "room-2-bed-1",
                                "type": "bed",
                                "x_ratio": 0.15,
                                "y_ratio": 0.2,
                                "width_inches": 60,
                                "depth_inches": 80,
                            }
                        ]
                    },
                }
            ],
        },
    )

    assert response.status_code == 200
    assert saved["parcel_id"] == "p-1"
    assert saved["database"] == "hp62n"
    assert saved["feature_count"] == 1
    assert saved["house_plan_point_count"] == 4
    assert saved["rooms"][0].interior_design["fixture_layout"][0]["type"] == "bed"
    assert saved["rooms"][0].floor_polygon_ratios[2] == [0.45, 0.3]
    assert response.json()["parcel_name"] == "p-1"


def test_upload_neo4j_house_footprint_endpoint_returns_updated_assessment(monkeypatch) -> None:
    loaded: dict[str, object] = {}

    def fake_load_house(*, parcel_id, house_geojson_path, database="hp62n", apply_constraints=True):
        loaded["parcel_id"] = parcel_id
        loaded["database"] = database
        loaded["path_name"] = Path(house_geojson_path).name
        loaded["apply_constraints"] = apply_constraints

    def fake_neo4j_assessment(parcel_id, database="hp62n"):
        assessment = create_site_assessment("tests/data/sample_parcel.geojson")
        assessment.parcel.source_path = Path(f"/neo4j/{database}/{parcel_id}.geojson")
        assessment.house_plan_points = [(0.0, 0.0), (10.0, 0.0), (10.0, 8.0), (0.0, 8.0)]
        assessment.rooms = []
        assessment.utility_connections = []
        return assessment

    monkeypatch.setattr("house_landscape_planner.webapp.main.load_house_footprint_into_neo4j", fake_load_house)
    monkeypatch.setattr("house_landscape_planner.webapp.main.create_site_assessment_from_neo4j", fake_neo4j_assessment)

    house_geojson = b"""
    {
      "type": "Feature",
      "properties": {},
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[0, 0], [12, 0], [12, 9], [0, 9], [0, 0]]]
      }
    }
    """

    response = client.post(
        "/api/neo4j/parcels/p-1/house-footprint",
        params={"database": "hp62n"},
        files={"house": ("house.geojson", house_geojson, "application/geo+json")},
    )

    assert response.status_code == 200
    assert loaded == {
        "parcel_id": "p-1",
        "database": "hp62n",
        "path_name": "house-footprint.geojson",
        "apply_constraints": True,
    }
    assert response.json()["parcel_name"] == "p-1"
    assert len(response.json()["house_plan_points"]) == 4
    assert response.json()["persistence_mode"] == "neo4j"


def test_load_neo4j_house_footprint_from_gis_endpoint_returns_updated_assessment(monkeypatch) -> None:
    loaded: dict[str, object] = {}

    def fake_load_house_gis(*, parcel_id, database="hp62n", apply_constraints=True):
        loaded["parcel_id"] = parcel_id
        loaded["database"] = database
        loaded["apply_constraints"] = apply_constraints
        return {"parcel_id": parcel_id, "database": database, "source_layer": "suffolk_building_footprints"}

    def fake_neo4j_assessment(parcel_id, database="hp62n"):
        assessment = create_site_assessment("tests/data/sample_parcel.geojson")
        assessment.parcel.source_path = Path(f"/neo4j/{database}/{parcel_id}.geojson")
        assessment.house_plan_points = [(0.0, 0.0), (12.0, 0.0), (12.0, 9.0), (0.0, 9.0)]
        assessment.rooms = []
        assessment.utility_connections = []
        return assessment

    monkeypatch.setattr("house_landscape_planner.webapp.main.load_house_footprint_from_suffolk_gis_into_neo4j", fake_load_house_gis)
    monkeypatch.setattr("house_landscape_planner.webapp.main.create_site_assessment_from_neo4j", fake_neo4j_assessment)

    response = client.post("/api/neo4j/parcels/p-1/house-footprint/gis", params={"database": "hp62n"})

    assert response.status_code == 200
    assert loaded == {"parcel_id": "p-1", "database": "hp62n", "apply_constraints": True}
    assert response.json()["parcel_name"] == "p-1"
    assert len(response.json()["house_plan_points"]) == 4


def test_refresh_neo4j_parcel_elevation_endpoint_returns_updated_assessment(monkeypatch) -> None:
    refreshed: dict[str, object] = {}

    def fake_load_elevation(*, parcel_id, database="hp62n"):
        refreshed["parcel_id"] = parcel_id
        refreshed["database"] = database
        return {"parcel_id": parcel_id, "database": database, "relief_feet": 45.0}

    def fake_neo4j_assessment(parcel_id, database="hp62n"):
        assessment = create_site_assessment("tests/data/sample_parcel.geojson")
        assessment.parcel.source_path = Path(f"/neo4j/{database}/{parcel_id}.geojson")
        assessment.elevation_summary = neo4j_parcel_loader.ElevationSummary(
            source="suffolk_county_gisviewer_contours",
            min_elevation_feet=35.0,
            max_elevation_feet=80.0,
            relief_feet=45.0,
            contour_5ft_values=[35.0, 40.0, 45.0, 50.0, 55.0, 60.0, 65.0, 70.0, 75.0, 80.0],
            contour_10ft_values=[40.0, 50.0, 60.0, 70.0, 80.0],
        )
        assessment.contour_lines = [
            neo4j_parcel_loader.ContourLineSummary(
                contour_id="contour-5-100",
                label="Contour 35 ft",
                elevation_feet=35.0,
                interval_feet=5,
                source_layer="suffolk_contours_5ft",
                paths=[[(-73.1, 40.9), (-73.2, 40.85)]],
            )
        ]
        return assessment

    monkeypatch.setattr("house_landscape_planner.webapp.main.load_parcel_elevation_into_neo4j", fake_load_elevation)
    monkeypatch.setattr("house_landscape_planner.webapp.main.create_site_assessment_from_neo4j", fake_neo4j_assessment)

    response = client.post("/api/neo4j/parcels/p-1/elevation", params={"database": "hp62n"})

    assert response.status_code == 200
    assert refreshed == {"parcel_id": "p-1", "database": "hp62n"}
    assert response.json()["elevation_summary"]["relief_feet"] == 45.0
    assert response.json()["objects"]["contours"][0]["properties"]["elevation_feet"] == 35.0


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


def test_interior_design_assets_include_editable_bathroom_and_bedroom_components() -> None:
    response = client.get("/static/js/app.js")

    assert response.status_code == 200
    javascript = response.text
    assert "const INTERIOR_COMPONENT_TYPES" in javascript
    assert 'shower: { label: "Shower", widthInches: 30, depthInches: 30' in javascript
    assert "const FIXTURE_SIZE_GRID_INCHES = 0.5" in javascript
    assert "function snapFixtureSizeInchesWithin" in javascript
    assert "function isMasterBathInteriorDesign" in javascript
    assert "shower.width_inches = 47.5" in javascript
    assert "shower.depth_inches = 34.5" in javascript
    assert "vanity.width_inches = 54" in javascript
    assert "vanity.depth_inches = 22" in javascript
    assert 'bathtub: { label: "Bathtub", widthInches: 60, depthInches: 36' in javascript
    assert 'bed: { label: "Bed", widthInches: 60, depthInches: 80' in javascript
    assert 'chair: { label: "Chair", widthInches: 30, depthInches: 30' in javascript
    assert 'sofa: { label: "Sofa", widthInches: 84, depthInches: 36' in javascript
    assert 'return "general"' in javascript
    assert "data-fixture-add" in javascript
    assert "data-fixture-action=\"resize\"" in javascript
    assert "const FIXTURE_DIRECTION_OPTIONS" in javascript
    assert 'data-fixture-field="direction_degrees"' in javascript
    assert "function normalizeFixtureDirection" in javascript
    assert 'direction_degrees: 0' in javascript
    assert "fixture.direction_degrees = nextDirection" in javascript
    assert "const nextWidth = fixture.depth_inches" in javascript
    assert 'class="interior-fixture-direction"' in javascript
    assert "handleInteriorFixturePointerMove" in javascript
    assert '"interior-design-canvas", "basement-canvas"' in javascript
    assert 'style="width:${zoomPercent.toFixed(1)}%"' in javascript
    assert "interior_design: room.properties.interior_design || {}" in javascript
    assert 'data-interior-segment-add="walls"' in javascript
    assert 'data-interior-segment-add="doors"' in javascript
    assert 'data-interior-segment-add="windows"' in javascript
    assert "buildInteriorBoundarySvg" in javascript
    assert "function buildInteriorOpeningLabel" in javascript
    assert 'class="interior-opening-label interior-${typeClass}-label"' in javascript
    assert "function buildInteriorDoorSwing" in javascript
    assert "function getInteriorPolygonInwardNormal" in javascript
    assert 'class="interior-door-swing"' in javascript
    assert 'class="interior-door-swing-arc"' in javascript
    assert "applyInteriorSegmentField" in javascript


def test_floor_plan_room_dimensions_are_editable() -> None:
    response = client.get("/static/js/app.js")

    assert response.status_code == 200
    javascript = response.text
    assert 'data-property-editor="room-dimension"' in javascript
    assert 'data-room-dimension="${dimension}"' in javascript
    assert "function applyRoomDimensionValue" in javascript
    assert 'item.kind === "room" && key === "height" ? "Depth"' in javascript
    assert 'data-property-editor="room-type"' in javascript
    assert "const ROOM_TYPE_OPTIONS" in javascript
    assert "function applyRoomTypeValue" in javascript
    assert "function getRoomWallLength" in javascript
    assert "function buildFloorWallLengthLabel" in javascript
    assert "function buildFloorArchitectureDimension" in javascript
    assert 'class="segment-length"' in javascript
    assert 'class="room-wall-extension"' in javascript
    assert 'class="room-wall-dimension-cap"' in javascript
    assert 'class="room-wall-dimension-arrow"' in javascript
    assert "const totalInches" in javascript
    assert "const showDimension = !hasSelectedRoom || state.selectedId === room.id" in javascript
    assert "const dimensionOffset = 12 * inverseZoom" in javascript
    assert 'data-wall-edge="${edge}"' in javascript
    assert 'data-property-editor="room-name"' in javascript
    assert "function applyRoomNameValue" in javascript
    assert "room.label = roomName" in javascript
    assert 'data-property-editor="room-shape"' in javascript
    assert "function ensureRoomPolygon" in javascript
    assert "function addRoomPolygonVertex" in javascript
    assert 'data-floor-action="move-room-vertex"' in javascript
    assert "function buildPolygonRoomBoundaryMarkup" in javascript
    assert "floor_polygon_ratios: getRoomPolygonRatios(room)" in javascript
    assert "function getPointCoordinates" in javascript
    assert "const DESIGN_GRID_INCHES = 1" in javascript
    assert "const DESIGN_GRID_MAJOR_INCHES = 12" in javascript
    assert "function snapFloorPolygonToInchGrid" in javascript
    assert "function snapRoomLayoutToInchGrid" in javascript
    assert "function snapRoomGeometryToInchGrid" in javascript
    assert "function snapInchesWithin" in javascript
    assert 'floor-grid-major-${levelKey}' in javascript
    assert "interior-floor-grid-major-line" in javascript
    assert "function getInteriorRoomPolygonRatios" in javascript
    assert "function buildInteriorPolygonBoundarySvg" in javascript
    assert "function buildInteriorRectWallDimension" in javascript
    assert "function buildInteriorWallDimensionMarkup" in javascript
    assert 'class="interior-wall-dimension-line"' in javascript
    assert 'class="interior-wall-dimension-cap"' in javascript
    assert 'class="interior-wall-dimension-arrow"' in javascript
    assert 'data-interior-room-dimension="${dimension}"' in javascript
    assert "function buildInteriorRoomSizeEditor" in javascript
    assert "function applyInteriorRoomDimensionField" in javascript
    assert 'const dimension = kind === "walls"' in javascript
    assert "function fitFixtureToInteriorRoom" in javascript
    assert '<g clip-path="url(#${clipId})">${furniture}</g>' in javascript
    assert 'class="interior-floor-fill" points="${polygonPoints}"' in javascript
    assert "function getWallThicknessInches" in javascript
    assert "const DEFAULT_WALL_THICKNESS_INCHES = 4.5" in javascript
    assert "function isLegacyDefaultWallSet" in javascript
    assert "function convertRoomLengthToInches" in javascript
    assert 'data-segment-field="thickness_inches"' in javascript
    assert 'data-interior-segment-field="thickness_inches"' in javascript
    assert "const wallThicknessInches = getWallThicknessInches(wall)" in javascript
    assert 'event.target.dataset.segmentField === "thickness_inches"' in javascript
    assert "function getInteriorRoomDimensionsInches" in javascript
    assert "buildWallRectFromPlacement(sourceRoom, segment, x, y, width, height, 0.25)" in javascript
    assert "const width = roomDimensions.width * ratio" in javascript
    assert 'target.dataset.interiorSegmentField === "thickness_inches"' in javascript
    assert "function findOpeningHostWall" in javascript
    assert "buildOpeningRectFromPlacement(segment, x, y, width, height, sourceRoom, 0.25)" in javascript
    assert 'id === "bath-bathtub" && type === "bathtub" && widthInches === 36 && depthInches === 72' in javascript
    assert "const isKnownMasterBathShower = isMasterBathInteriorDesign(item)" in javascript
    assert "widthInches = 47.5" in javascript
    assert "depthInches = 34.5" in javascript
    assert "xInches = Math.max(0, roomDimensions.width - widthInches)" in javascript
