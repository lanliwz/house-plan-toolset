from __future__ import annotations

import json
import os
import re
import time
import urllib.parse
import urllib.request
from dataclasses import dataclass
from decimal import Decimal
from enum import Enum
from pathlib import Path
from typing import Any

from neo4j import GraphDatabase

from house_landscape_planner.onto2ai_compat import (
    BoundaryVertex,
    CountryEnum,
    GeoJSONFeature,
    GeoJSONFeatureCollection,
    Parcel,
    PolygonGeometry,
    STAGING_CONSTRAINT_PATH,
    USPostalAddress,
    USStateEnum,
)

from house_landscape_planner.analysis.landscape_features import build_landscape_features
from house_landscape_planner.analysis.parcel import (
    compute_metrics,
    normalize_points,
    points_look_like_lon_lat,
    project_lon_lat_to_feet_with_reference,
)
from house_landscape_planner.analysis.site_report import (
    build_assumptions,
    build_concept_zones,
    build_next_data_list,
    build_recommendations,
)
from house_landscape_planner.io.geojson_loader import load_geojson
from house_landscape_planner.models import (
    ContourLineSummary,
    ElevationSummary,
    HouseSummary,
    LandscapeFeature,
    ParcelSummary,
    RoomSummary,
    SiteAssessment,
    UtilityConnectionSummary,
)


USA_URI = "https://www.omg.org/spec/LCC/Countries/ISO3166-1-CountryCodes/UnitedStatesOfAmerica"
SUBDIVISION_URI_TEMPLATE = (
    "https://www.omg.org/spec/LCC/Countries/Regions/ISO3166-2-SubdivisionCodes-US/US-{state}"
)
PARCEL_NS = "http://www.onto2ai-toolset.com/ontology/parcel/Parcel/#"
HOUSE_NS = "http://www.onto2ai-toolset.com/ontology/house/House#"
LANDSCAPE_NS = "http://www.onto2ai-toolset.com/ontology/landscape/Landscape#"
DEFAULT_WEB_DATABASE = os.getenv("NEO4J_HP62N_DB_NAME", "hp62n")
FEATURE_LAYOUT_PROPERTY = "housePlanFeatureLayoutJson"
HOUSE_PLAN_POINTS_PROPERTY = "housePlanPolygonJson"
ELEVATION_SUMMARY_PROPERTY = "housePlanElevationSummaryJson"
ELEVATION_CONTOURS_PROPERTY = "housePlanElevationContoursJson"
HOUSE_CONSTRAINT_PATH = Path(__file__).resolve().parents[3] / "resource" / "ontology" / "www_onto2ai-toolset_com" / "ontology" / "house" / "House.cypher"
LANDSCAPE_CONSTRAINT_PATH = Path(__file__).resolve().parents[3] / "resource" / "ontology" / "www_onto2ai-toolset_com" / "ontology" / "landscape" / "Landscape.cypher"
SUFFOLK_GIS_BASE = "https://gis.suffolkcountyny.gov/server/rest/services/Applications/GISViewer/MapServer"
SUFFOLK_CONTOUR_5FT_LAYER = 15
SUFFOLK_CONTOUR_10FT_LAYER = 16
SUFFOLK_BUILDING_FOOTPRINT_LAYER = 30


@dataclass(frozen=True)
class Neo4jConfig:
    uri: str
    username: str
    password: str
    database: str


@dataclass(frozen=True)
class ParcelBundle:
    source_properties: dict[str, Any]
    parcel: Parcel
    feature: GeoJSONFeature


@dataclass(frozen=True)
class Neo4jParcelListItem:
    parcel_id: str
    label: str
    vertex_count: int
    uri: str


@dataclass(frozen=True)
class SuffolkBuildingFootprintCandidate:
    object_id: int | str
    status: str | None
    area_square_feet: float | None
    perimeter_feet: float | None
    ring_points: list[tuple[float, float]]


def load_geojson_into_neo4j(
    geojson_path: str | Path,
    *,
    database: str = "hp62n",
    default_state: str = "NY",
    ensure_database: bool = True,
    apply_constraints: bool = True,
) -> dict[str, int | str]:
    config = get_neo4j_config(database=database)
    bundles, collection = build_feature_collection(geojson_path, default_state=default_state)

    driver = GraphDatabase.driver(config.uri, auth=(config.username, config.password))
    try:
        if ensure_database:
            ensure_database_exists(driver, config.database)
        if apply_constraints:
            apply_dataset_constraints(driver, config.database, STAGING_CONSTRAINT_PATH)
            apply_dataset_constraints(driver, config.database, HOUSE_CONSTRAINT_PATH)
        with driver.session(database=config.database) as session:
            merge_collection_node(session, collection)
            for index, bundle in enumerate(bundles, start=1):
                merge_parcel_bundle(session, bundle, collection_id=collection.feature_collection_id, index=index)
    finally:
        driver.close()

    return {
        "database": config.database,
        "feature_count": len(bundles),
        "parcel_count": len(bundles),
        "vertex_count": sum(len(bundle.parcel.has_parcel_geometry[0].has_boundary_vertex) for bundle in bundles),
    }


def load_house_footprint_into_neo4j(
    *,
    parcel_id: str,
    house_geojson_path: str | Path,
    database: str = DEFAULT_WEB_DATABASE,
    apply_constraints: bool = True,
) -> dict[str, int | str]:
    config = get_neo4j_config(database=database)
    data = load_geojson(house_geojson_path)
    features = extract_features(data)
    if len(features) != 1:
        raise ValueError("House footprint input must contain exactly one feature.")

    geometry = features[0].get("geometry") or {}
    geometry_type = geometry.get("type")
    if geometry_type == "Polygon":
        ring = (geometry.get("coordinates") or [[]])[0]
    elif geometry_type == "MultiPolygon":
        ring = ((geometry.get("coordinates") or [[[]]])[0] or [[]])[0]
    else:
        raise ValueError(f"Unsupported house footprint geometry type: {geometry_type!r}")

    if len(ring) < 4:
        raise ValueError("House footprint must contain at least four coordinates.")

    points = [(float(point[0]), float(point[1])) for point in ring[:-1]]
    result = save_house_footprint_points_to_neo4j(
        parcel_id=parcel_id,
        points=points,
        database=database,
        apply_constraints=apply_constraints,
    )
    result["geometry_type"] = geometry_type
    return result


def load_house_footprint_from_suffolk_gis_into_neo4j(
    *,
    parcel_id: str,
    database: str = DEFAULT_WEB_DATABASE,
    apply_constraints: bool = True,
) -> dict[str, int | float | str]:
    config = get_neo4j_config(database=database)
    driver = GraphDatabase.driver(config.uri, auth=(config.username, config.password))
    try:
        with driver.session(database=config.database) as session:
            row = session.run(
                """
                MATCH (parcel:Parcel:Resource {parcelId: $parcel_id})-[:hasParcelGeometry]->(:PolygonGeometry:Geometry:Resource)-[:hasBoundaryVertex]->(vertex:BoundaryVertex:GPSCoordinate:Resource)
                RETURN collect(properties(vertex)) AS vertices
                """,
                parcel_id=parcel_id,
            ).single()
            if row is None:
                raise ValueError(f"Parcel {parcel_id!r} not found in database {database!r}.")
            vertex_props = sorted(
                [dict(item) for item in (row["vertices"] or []) if item],
                key=lambda item: item.get("vertexSequenceNumber", 0),
            )
            if not vertex_props:
                raise ValueError(f"Parcel {parcel_id!r} has no boundary vertices in database {database!r}.")
            source_points = [(float(item["longitude"]), float(item["latitude"])) for item in vertex_props]
    finally:
        driver.close()

    closed_points = source_points + [source_points[0]]
    candidates = query_suffolk_building_footprints(closed_points)
    candidate = choose_primary_building_footprint(candidates)
    if candidate is None:
        raise ValueError("No Suffolk building footprint intersected the parcel footprint.")

    local_points = candidate.ring_points
    if points_look_like_lon_lat(candidate.ring_points):
        local_points = project_lon_lat_to_feet_with_reference(
            candidate.ring_points,
            reference_point=source_points[0],
        )

    result = save_house_footprint_points_to_neo4j(
        parcel_id=parcel_id,
        points=local_points,
        database=database,
        apply_constraints=apply_constraints,
    )
    result.update(
        {
            "source_layer": "suffolk_building_footprints",
            "source_object_id": str(candidate.object_id),
            "candidate_count": len(candidates),
            "geometry_type": "Polygon",
        }
    )
    return result


def load_parcel_elevation_into_neo4j(
    *,
    parcel_id: str,
    database: str = DEFAULT_WEB_DATABASE,
) -> dict[str, int | float | str]:
    config = get_neo4j_config(database=database)
    driver = GraphDatabase.driver(config.uri, auth=(config.username, config.password))
    try:
        with driver.session(database=config.database) as session:
            row = session.run(
                """
                MATCH (parcel:Parcel:Resource {parcelId: $parcel_id})-[:hasParcelGeometry]->(:PolygonGeometry:Geometry:Resource)-[:hasBoundaryVertex]->(vertex:BoundaryVertex:GPSCoordinate:Resource)
                RETURN collect(properties(vertex)) AS vertices
                """,
                parcel_id=parcel_id,
            ).single()
            if row is None:
                raise ValueError(f"Parcel {parcel_id!r} not found in database {database!r}.")
            vertex_props = sorted(
                [dict(item) for item in (row["vertices"] or []) if item],
                key=lambda item: item.get("vertexSequenceNumber", 0),
            )
            if not vertex_props:
                raise ValueError(f"Parcel {parcel_id!r} has no boundary vertices in database {database!r}.")
            closed_points = [(float(item["longitude"]), float(item["latitude"])) for item in vertex_props]
            closed_points.append(closed_points[0])
            summary, contour_lines = fetch_suffolk_elevation_dataset(closed_points)
            session.run(
                f"""
                MATCH (parcel:Parcel:Resource {{parcelId: $parcel_id}})
                SET parcel.{ELEVATION_SUMMARY_PROPERTY} = $summary_json
                SET parcel.{ELEVATION_CONTOURS_PROPERTY} = $contours_json
                """,
                parcel_id=parcel_id,
                summary_json=json.dumps(serialize_elevation_summary(summary)),
                contours_json=json.dumps([serialize_contour_line(item) for item in contour_lines]),
            ).consume()
    finally:
        driver.close()

    return {
        "database": database,
        "parcel_id": parcel_id,
        "min_elevation_feet": summary.min_elevation_feet,
        "max_elevation_feet": summary.max_elevation_feet,
        "relief_feet": summary.relief_feet,
        "contour_5ft_count": len(summary.contour_5ft_values),
        "contour_10ft_count": len(summary.contour_10ft_values),
        "contour_line_count": len(contour_lines),
    }


def list_parcels_from_neo4j(database: str = DEFAULT_WEB_DATABASE) -> list[Neo4jParcelListItem]:
    config = get_neo4j_config(database=database)
    driver = GraphDatabase.driver(config.uri, auth=(config.username, config.password))
    try:
        with driver.session(database=config.database) as session:
            rows = session.run(
                """
                MATCH (parcel:Parcel:Resource)
                OPTIONAL MATCH (parcel)-[:hasParcelGeometry]->(:PolygonGeometry:Geometry:Resource)-[:hasBoundaryVertex]->(vertex:BoundaryVertex:GPSCoordinate:Resource)
                RETURN parcel.parcelId AS parcel_id,
                       coalesce(parcel.fullAddressText, parcel.FULLADDRESS, parcel.rdfs__label, parcel.parcelId) AS label,
                       parcel.uri AS uri,
                       count(vertex) AS vertex_count
                ORDER BY label
                """
            )
            return [
                Neo4jParcelListItem(
                    parcel_id=row["parcel_id"],
                    label=row["label"],
                    vertex_count=row["vertex_count"],
                    uri=row["uri"],
                )
                for row in rows
                if row["parcel_id"]
            ]
    finally:
        driver.close()


def create_site_assessment_from_neo4j(
    parcel_id: str,
    *,
    database: str = DEFAULT_WEB_DATABASE,
) -> SiteAssessment:
    config = get_neo4j_config(database=database)
    driver = GraphDatabase.driver(config.uri, auth=(config.username, config.password))
    try:
        with driver.session(database=config.database) as session:
            row = session.run(
                """
                MATCH (parcel:Parcel:Resource {parcelId: $parcel_id})
                OPTIONAL MATCH (feature:GeoJSONFeature:Resource)-[:representsParcel]->(parcel)
                OPTIONAL MATCH (parcel)-[:hasParcelGeometry]->(geometry:PolygonGeometry:Geometry:Resource)
                OPTIONAL MATCH (geometry)-[:hasBoundaryVertex]->(vertex:BoundaryVertex:GPSCoordinate:Resource)
                WITH parcel, feature, geometry, collect(properties(vertex)) AS vertices
                RETURN properties(parcel) AS parcel_props,
                       properties(feature) AS feature_props,
                       properties(geometry) AS geometry_props,
                       vertices AS vertices
                """,
                parcel_id=parcel_id,
            ).single()
    finally:
        driver.close()

    if row is None:
        raise ValueError(f"Parcel {parcel_id!r} not found in database {database!r}.")

    parcel_props = dict(row["parcel_props"] or {})
    feature_props = dict(row["feature_props"] or {})
    vertex_props = sorted(
        [dict(item) for item in (row["vertices"] or []) if item],
        key=lambda item: item.get("vertexSequenceNumber", 0),
    )
    if not vertex_props:
        raise ValueError(f"Parcel {parcel_id!r} has no boundary vertices in database {database!r}.")

    source_points = [
        (float(item["longitude"]), float(item["latitude"]))
        for item in vertex_props
    ]
    closed_points = source_points + [source_points[0]]
    metric_points, _, _, _ = normalize_points(closed_points)
    house_graph = load_house_graph_details(config, parcel_id)
    house_plan_points = house_graph["house_plan_points"]
    if not house_plan_points:
        house_plan_points = load_saved_house_plan_points(parcel_props.get(HOUSE_PLAN_POINTS_PROPERTY))
    elevation_summary = load_saved_elevation_summary(parcel_props.get(ELEVATION_SUMMARY_PROPERTY))
    contour_lines = load_saved_contour_lines(parcel_props.get(ELEVATION_CONTOURS_PROPERTY))
    contour_lines = project_contour_lines_to_parcel_space(contour_lines, source_points)
    parcel_summary = ParcelSummary(
        source_path=Path(f"/neo4j/{database}/{parcel_id}.geojson"),
        geometry_type=feature_props.get("geometryTypeName", "Polygon"),
        properties=parcel_props,
        source_boundary_points=closed_points,
        boundary_points=metric_points,
        metrics=compute_metrics(closed_points),
    )
    concept_zones = build_concept_zones(parcel_summary)
    generated_features = build_landscape_features(parcel_summary, concept_zones)
    return SiteAssessment(
        parcel=parcel_summary,
        image=None,
        house=build_house_summary(house_graph["house"], house_plan_points, parcel_summary.metrics.linear_unit, parcel_summary.metrics.area_unit),
        rooms=house_graph["rooms"],
        utility_connections=house_graph["utility_connections"],
        elevation_summary=elevation_summary,
        assumptions=build_assumptions(parcel_summary, None),
        concept_zones=concept_zones,
        landscape_features=load_saved_feature_layout(parcel_props.get(FEATURE_LAYOUT_PROPERTY), generated_features),
        recommendations=build_recommendations(parcel_summary, None),
        next_data_to_collect=build_next_data_list(),
        contour_lines=contour_lines,
        house_plan_points=house_plan_points,
    )


def project_contour_lines_to_parcel_space(
    contour_lines: list[ContourLineSummary],
    parcel_source_points: list[tuple[float, float]],
) -> list[ContourLineSummary]:
    if not contour_lines or not parcel_source_points or not points_look_like_lon_lat(parcel_source_points):
        return contour_lines

    reference_point = parcel_source_points[0]
    projected_lines: list[ContourLineSummary] = []
    for contour in contour_lines:
        projected_paths: list[list[tuple[float, float]]] = []
        for path in contour.paths:
            if not path:
                continue
            projected_paths.append(
                project_lon_lat_to_feet_with_reference(path, reference_point=reference_point)
            )
        projected_lines.append(
            ContourLineSummary(
                contour_id=contour.contour_id,
                label=contour.label,
                elevation_feet=contour.elevation_feet,
                interval_feet=contour.interval_feet,
                source_layer=contour.source_layer,
                paths=projected_paths,
            )
        )
    return projected_lines


def save_feature_layout_to_neo4j(
    parcel_id: str,
    *,
    database: str = DEFAULT_WEB_DATABASE,
    features: list[LandscapeFeature],
    house_plan_points: list[tuple[float, float]] | None = None,
    rooms: list[RoomSummary] | None = None,
) -> None:
    config = get_neo4j_config(database=database)
    driver = GraphDatabase.driver(config.uri, auth=(config.username, config.password))
    payload = json.dumps([serialize_landscape_feature(feature) for feature in features])
    house_plan_payload = (
        json.dumps([[float(point[0]), float(point[1])] for point in house_plan_points])
        if house_plan_points is not None
        else None
    )
    try:
        with driver.session(database=config.database) as session:
            apply_dataset_constraints(driver, config.database, HOUSE_CONSTRAINT_PATH)
            apply_dataset_constraints(driver, config.database, LANDSCAPE_CONSTRAINT_PATH)
            result = session.run(
                f"""
                MATCH (parcel:Parcel:Resource {{parcelId: $parcel_id}})
                SET parcel.{FEATURE_LAYOUT_PROPERTY} = $payload
                SET parcel.{HOUSE_PLAN_POINTS_PROPERTY} = $house_plan_payload
                RETURN parcel.parcelId AS parcel_id
                """,
                parcel_id=parcel_id,
                payload=payload,
                house_plan_payload=house_plan_payload,
            ).single()
            if result is not None:
                sync_house_graph(session, parcel_id=parcel_id, house_plan_points=house_plan_points)
                if rooms is not None:
                    sync_rooms(session, parcel_id=parcel_id, rooms=rooms)
                sync_landscape_graph(session, parcel_id=parcel_id, features=features)
    finally:
        driver.close()

    if result is None:
        raise ValueError(f"Parcel {parcel_id!r} not found in database {database!r}.")


def save_house_footprint_points_to_neo4j(
    *,
    parcel_id: str,
    points: list[tuple[float, float]],
    database: str = DEFAULT_WEB_DATABASE,
    apply_constraints: bool = True,
) -> dict[str, int | str]:
    if len(points) < 3:
        raise ValueError("House footprint must contain at least three unique points.")

    config = get_neo4j_config(database=database)
    driver = GraphDatabase.driver(config.uri, auth=(config.username, config.password))
    try:
        if apply_constraints:
            apply_dataset_constraints(driver, config.database, HOUSE_CONSTRAINT_PATH)
        with driver.session(database=config.database) as session:
            parcel_exists = session.run(
                """
                MATCH (parcel:Parcel:Resource {parcelId: $parcel_id})
                RETURN parcel.parcelId AS parcel_id
                """,
                parcel_id=parcel_id,
            ).single()
            if parcel_exists is None:
                raise ValueError(f"Parcel {parcel_id!r} not found in database {database!r}.")
            sync_house_graph(session, parcel_id=parcel_id, house_plan_points=points)
            session.run(
                f"""
                MATCH (parcel:Parcel:Resource {{parcelId: $parcel_id}})
                SET parcel.{HOUSE_PLAN_POINTS_PROPERTY} = $house_plan_payload
                """,
                parcel_id=parcel_id,
                house_plan_payload=json.dumps([[float(point[0]), float(point[1])] for point in points]),
            ).consume()
    finally:
        driver.close()

    return {
        "database": database,
        "parcel_id": parcel_id,
        "house_vertex_count": len(points),
    }


def remove_feature_from_neo4j(
    parcel_id: str,
    feature_id: str,
    *,
    database: str = DEFAULT_WEB_DATABASE,
) -> None:
    assessment = create_site_assessment_from_neo4j(parcel_id, database=database)
    updated_features = [feature for feature in assessment.landscape_features if feature.feature_id != feature_id]
    save_feature_layout_to_neo4j(
        parcel_id,
        database=database,
        features=updated_features,
        house_plan_points=assessment.house_plan_points,
    )


def get_neo4j_config(*, database: str) -> Neo4jConfig:
    uri = os.getenv("NEO4J_MODEL_DB_URL", "bolt://localhost:7687")
    username = os.getenv("NEO4J_MODEL_DB_USERNAME", "neo4j")
    password = os.getenv("NEO4J_MODEL_DB_PASSWORD")
    if not password:
        raise RuntimeError("NEO4J_MODEL_DB_PASSWORD is required")
    return Neo4jConfig(uri=uri, username=username, password=password, database=database)


def serialize_landscape_feature(feature: LandscapeFeature) -> dict[str, Any]:
    return {
        "feature_id": feature.feature_id,
        "name": feature.name,
        "ontology_class": feature.ontology_class,
        "zone_name": feature.zone_name,
        "summary": feature.summary,
        "intent": feature.intent,
        "placement": feature.placement,
        "rationale": feature.rationale,
        "design_moves": list(feature.design_moves),
        "priority": feature.priority,
        "target_share_percent": feature.target_share_percent,
        "anchor_x_ratio": feature.anchor_x_ratio,
        "anchor_y_ratio": feature.anchor_y_ratio,
        "width_ratio": feature.width_ratio,
        "height_ratio": feature.height_ratio,
        "visual_kind": feature.visual_kind,
        "rotation_degrees": feature.rotation_degrees,
    }


def load_saved_feature_layout(raw_value: Any, fallback: list[LandscapeFeature]) -> list[LandscapeFeature]:
    if not raw_value:
        return fallback

    try:
        payload = json.loads(str(raw_value))
    except json.JSONDecodeError:
        return fallback

    if not isinstance(payload, list):
        return fallback

    hydrated: list[LandscapeFeature] = []
    for item in payload:
        if not isinstance(item, dict):
            continue
        try:
            hydrated.append(
                LandscapeFeature(
                    feature_id=str(item["feature_id"]),
                    name=str(item["name"]),
                    ontology_class=str(item["ontology_class"]),
                    zone_name=str(item["zone_name"]),
                    summary=str(item["summary"]),
                    intent=str(item["intent"]),
                    placement=str(item["placement"]),
                    rationale=str(item["rationale"]),
                    design_moves=[str(move) for move in item.get("design_moves", [])],
                    priority=str(item["priority"]),
                    target_share_percent=int(item["target_share_percent"]) if item.get("target_share_percent") is not None else None,
                    anchor_x_ratio=float(item["anchor_x_ratio"]),
                    anchor_y_ratio=float(item["anchor_y_ratio"]),
                    width_ratio=float(item["width_ratio"]),
                    height_ratio=float(item["height_ratio"]),
                    visual_kind=str(item["visual_kind"]),
                    rotation_degrees=float(item["rotation_degrees"]) if item.get("rotation_degrees") is not None else None,
                )
            )
        except (KeyError, TypeError, ValueError):
            return fallback

    return hydrated or fallback


def load_saved_house_plan_points(raw_value: Any) -> list[tuple[float, float]]:
    if not raw_value:
        return []

    try:
        payload = json.loads(str(raw_value))
    except json.JSONDecodeError:
        return []

    if not isinstance(payload, list):
        return []

    hydrated: list[tuple[float, float]] = []
    for item in payload:
        if not isinstance(item, (list, tuple)) or len(item) != 2:
            return []
        try:
            hydrated.append((float(item[0]), float(item[1])))
        except (TypeError, ValueError):
            return []
    return hydrated


def load_saved_elevation_summary(raw_value: Any) -> ElevationSummary | None:
    if not raw_value:
        return None
    try:
        payload = json.loads(str(raw_value))
    except json.JSONDecodeError:
        return None
    if not isinstance(payload, dict):
        return None
    try:
        return ElevationSummary(
            source=str(payload["source"]),
            min_elevation_feet=float(payload["min_elevation_feet"]),
            max_elevation_feet=float(payload["max_elevation_feet"]),
            relief_feet=float(payload["relief_feet"]),
            contour_5ft_values=[float(value) for value in payload.get("contour_5ft_values", [])],
            contour_10ft_values=[float(value) for value in payload.get("contour_10ft_values", [])],
        )
    except (KeyError, TypeError, ValueError):
        return None


def load_saved_contour_lines(raw_value: Any) -> list[ContourLineSummary]:
    if not raw_value:
        return []
    try:
        payload = json.loads(str(raw_value))
    except json.JSONDecodeError:
        return []
    if not isinstance(payload, list):
        return []

    contour_lines: list[ContourLineSummary] = []
    for item in payload:
        if not isinstance(item, dict):
            continue
        try:
            raw_paths = item.get("paths", [])
            paths: list[list[tuple[float, float]]] = []
            for raw_path in raw_paths:
                if not isinstance(raw_path, list):
                    raise ValueError("Invalid contour path")
                path: list[tuple[float, float]] = []
                for point in raw_path:
                    if not isinstance(point, (list, tuple)) or len(point) != 2:
                        raise ValueError("Invalid contour point")
                    path.append((float(point[0]), float(point[1])))
                if path:
                    paths.append(path)
            contour_lines.append(
                ContourLineSummary(
                    contour_id=str(item["contour_id"]),
                    label=str(item.get("label") or f"Contour {item['contour_id']}"),
                    elevation_feet=float(item["elevation_feet"]),
                    interval_feet=int(item["interval_feet"]),
                    source_layer=str(item["source_layer"]),
                    paths=paths,
                )
            )
        except (KeyError, TypeError, ValueError):
            continue
    return contour_lines


def load_graph_house_plan_points(config: Neo4jConfig, parcel_id: str) -> list[tuple[float, float]]:
    driver = GraphDatabase.driver(config.uri, auth=(config.username, config.password))
    try:
        with driver.session(database=config.database) as session:
            row = session.run(
                """
                MATCH (:Parcel:Resource {parcelId: $parcel_id})-[:HAS_HOUSE]->(:House)-[:HAS_BUILDING_FOOTPRINT]->(footprint:BuildingFootprint)
                RETURN footprint.coordinateSequenceJson AS points
                """,
                parcel_id=parcel_id,
            ).single()
    finally:
        driver.close()

    if row is None or not row["points"]:
        return []

    try:
        payload = json.loads(str(row["points"]))
    except json.JSONDecodeError:
        return []

    if not isinstance(payload, list):
        return []

    points: list[tuple[float, float]] = []
    for item in payload:
        if not isinstance(item, (list, tuple)) or len(item) != 2:
            return []
        try:
            points.append((float(item[0]), float(item[1])))
        except (TypeError, ValueError):
            return []
    return points


def load_house_graph_details(config: Neo4jConfig, parcel_id: str) -> dict[str, Any]:
    driver = GraphDatabase.driver(config.uri, auth=(config.username, config.password))
    try:
        with driver.session(database=config.database) as session:
            house_row = session.run(
                """
                MATCH (:Parcel:Resource {parcelId: $parcel_id})-[:HAS_HOUSE]->(house:House)
                OPTIONAL MATCH (house)-[:HAS_BUILDING_FOOTPRINT]->(footprint:BuildingFootprint)
                RETURN properties(house) AS house_props, properties(footprint) AS footprint_props
                """,
                parcel_id=parcel_id,
            ).single()
            room_rows = session.run(
                """
                MATCH (:Parcel:Resource {parcelId: $parcel_id})-[:HAS_HOUSE]->(:House)-[:HAS_ROOM]->(room:Room)
                RETURN properties(room) AS room_props
                ORDER BY room.rdfs__label
                """,
                parcel_id=parcel_id,
            )
            utility_rows = session.run(
                """
                MATCH (:Parcel:Resource {parcelId: $parcel_id})-[:HAS_HOUSE]->(:House)-[:HAS_UTILITY_CONNECTION]->(utility:UtilityConnection)
                RETURN properties(utility) AS utility_props
                ORDER BY utility.rdfs__label
                """,
                parcel_id=parcel_id,
            )
            house = dict((house_row or {}).get("house_props") or {})
            footprint = dict((house_row or {}).get("footprint_props") or {})
            rooms = [hydrate_room_summary(dict(row["room_props"] or {})) for row in room_rows]
            utilities = [hydrate_utility_summary(dict(row["utility_props"] or {})) for row in utility_rows]
    finally:
        driver.close()

    points = load_saved_house_plan_points(footprint.get("coordinateSequenceJson")) if footprint else []
    return {
        "house": house,
        "house_plan_points": points,
        "rooms": [room for room in rooms if room is not None],
        "utility_connections": [utility for utility in utilities if utility is not None],
    }


def ensure_database_exists(driver, database: str) -> None:
    with driver.session(database="system") as session:
        session.run(f"CREATE DATABASE `{database}` IF NOT EXISTS").consume()
        for _ in range(30):
            row = session.run(
                "SHOW DATABASES YIELD name, currentStatus "
                "WHERE name = $name RETURN currentStatus AS status",
                name=database,
            ).single()
            if row and str(row["status"]).lower() == "online":
                return
            time.sleep(0.5)


def parse_constraints_file(path: Path) -> list[str]:
    statements: list[str] = []
    current: list[str] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("//"):
            continue
        current.append(line)
        if stripped.endswith(";"):
            statements.append("\n".join(current).strip())
            current = []
    if current:
        statements.append("\n".join(current).strip())
    return statements


def apply_dataset_constraints(driver, database: str, path: Path) -> int:
    if not path.exists():
        return 0
    applied = 0
    with driver.session(database=database) as session:
        for stmt in parse_constraints_file(path):
            if stmt.upper().startswith("CREATE CONSTRAINT"):
                session.run(stmt).consume()
                applied += 1
    return applied


def sync_house_graph(session, *, parcel_id: str, house_plan_points: list[tuple[float, float]] | None) -> None:
    session.run(
        """
        MATCH (parcel:Parcel:Resource {parcelId: $parcel_id})
        OPTIONAL MATCH (parcel)-[:HAS_HOUSE]->(house:House)
        OPTIONAL MATCH (house)-[:HAS_BUILDING_FOOTPRINT]->(footprint:BuildingFootprint)
        OPTIONAL MATCH (house)-[:HAS_ROOM]->(room:Room)
        OPTIONAL MATCH (house)-[:HAS_UTILITY_CONNECTION]->(utility:UtilityConnection)
        DETACH DELETE room, utility
        DETACH DELETE house, footprint
        """,
        parcel_id=parcel_id,
    ).consume()

    if not house_plan_points or len(house_plan_points) < 3:
        return

    parcel_row = session.run(
        """
        MATCH (parcel:Parcel:Resource {parcelId: $parcel_id})
        RETURN coalesce(parcel.fullAddressText, parcel.FULLADDRESS, parcel.rdfs__label, parcel.parcelId) AS label
        """,
        parcel_id=parcel_id,
    ).single()
    house_id = f"{parcel_id}-house-1"
    footprint_id = f"{parcel_id}-footprint-1"
    points_json = json.dumps([[float(point[0]), float(point[1])] for point in house_plan_points])
    session.run(
        """
        MATCH (parcel:Parcel:Resource {parcelId: $parcel_id})
        MERGE (house:House {houseId: $house_id})
        SET house.uri = $house_uri,
            house.rdfs__label = $house_label,
            house.source = 'house_plan_toolset'
        MERGE (footprint:BuildingFootprint {footprintId: $footprint_id})
        SET footprint.uri = $footprint_uri,
            footprint.rdfs__label = 'building footprint',
            footprint.coordinateSequenceJson = $points_json,
            footprint.coordinateSequenceText = $points_text
        MERGE (parcel)-[:HAS_HOUSE {uri: $has_house_uri, materialized: true, rdfs__label: 'has house'}]->(house)
        MERGE (house)-[:HAS_BUILDING_FOOTPRINT {uri: $has_building_footprint_uri, materialized: true, rdfs__label: 'has building footprint'}]->(footprint)
        """,
        parcel_id=parcel_id,
        house_id=house_id,
        house_uri=f"urn:house-plan-toolset:house:{house_id}",
        house_label=(parcel_row["label"] if parcel_row else parcel_id),
        footprint_id=footprint_id,
        footprint_uri=f"urn:house-plan-toolset:footprint:{footprint_id}",
        points_json=points_json,
        points_text=" | ".join(f"{point[0]},{point[1]}" for point in house_plan_points),
        has_house_uri=f"{HOUSE_NS}hasHouse",
        has_building_footprint_uri=f"{HOUSE_NS}hasBuildingFootprint",
    ).consume()
    sync_default_rooms(session, house_id=house_id, house_plan_points=house_plan_points)
    sync_default_utility_connections(session, house_id=house_id)


def sync_landscape_graph(session, *, parcel_id: str, features: list[LandscapeFeature]) -> None:
    session.run(
        """
        MATCH (:Parcel:Resource {parcelId: $parcel_id})-[:HAS_LANDSCAPE_PLAN]->(plan:LandscapePlan)
        OPTIONAL MATCH (plan)-[:hasLandscapeFeature]->(feature:LandscapeFeature)
        DETACH DELETE feature
        """,
        parcel_id=parcel_id,
    ).consume()
    session.run(
        """
        MATCH (:Parcel:Resource {parcelId: $parcel_id})-[:HAS_LANDSCAPE_PLAN]->(plan:LandscapePlan)
        DETACH DELETE plan
        """,
        parcel_id=parcel_id,
    ).consume()

    if not features:
        return

    plan_id = f"{parcel_id}-landscape-plan"
    session.run(
        """
        MATCH (parcel:Parcel:Resource {parcelId: $parcel_id})
        MERGE (plan:LandscapePlan {planId: $plan_id})
        SET plan.uri = $plan_uri,
            plan.rdfs__label = 'landscape plan'
        MERGE (parcel)-[:HAS_LANDSCAPE_PLAN {materialized: true, rdfs__label: 'has landscape plan'}]->(plan)
        """,
        parcel_id=parcel_id,
        plan_id=plan_id,
        plan_uri=f"urn:house-plan-toolset:landscape-plan:{plan_id}",
    ).consume()

    for feature in features:
        feature_label = ontology_fragment(feature.ontology_class) or "LandscapeFeature"
        feature_props = serialize_landscape_feature(feature)
        feature_props["featureId"] = feature_props.pop("feature_id")
        feature_props["zoneName"] = feature_props.pop("zone_name")
        feature_props["targetSharePercent"] = feature_props.pop("target_share_percent")
        feature_props["anchorXRatio"] = feature_props.pop("anchor_x_ratio")
        feature_props["anchorYRatio"] = feature_props.pop("anchor_y_ratio")
        feature_props["widthRatio"] = feature_props.pop("width_ratio")
        feature_props["heightRatio"] = feature_props.pop("height_ratio")
        feature_props["visualKind"] = feature_props.pop("visual_kind")
        feature_props["rotationDegrees"] = feature_props.pop("rotation_degrees")
        session.run(
            f"""
            MATCH (plan:LandscapePlan {{planId: $plan_id}})
            MERGE (feature:LandscapeFeature:`{feature_label}` {{featureId: $feature_id}})
            SET feature += $feature_props,
                feature.uri = $feature_uri,
                feature.rdfs__label = $feature_name
            MERGE (plan)-[:hasLandscapeFeature {{
                uri: $has_feature_uri,
                materialized: true,
                rdfs__label: 'has landscape feature'
            }}]->(feature)
            """,
            plan_id=plan_id,
            feature_id=feature.feature_id,
            feature_props=feature_props,
            feature_uri=f"urn:house-plan-toolset:landscape-feature:{feature.feature_id}",
            feature_name=feature.name,
            has_feature_uri=f"{LANDSCAPE_NS}hasLandscapeFeature",
        ).consume()


def ontology_fragment(uri: str | None) -> str | None:
    if not uri:
        return None
    fragment = uri.rsplit("#", 1)[-1].strip()
    return fragment or None


def sync_default_rooms(session, *, house_id: str, house_plan_points: list[tuple[float, float]]) -> None:
    rooms = build_default_room_summaries(house_id, house_plan_points)
    for room in rooms:
        session.run(
            """
            MATCH (house:House {houseId: $house_id})
            MERGE (room:Room {roomId: $room_id})
            SET room.rdfs__label = $label,
                room.roomType = $room_type,
                room.levelName = $level_name,
                room.area = $area,
                room.areaUnit = $area_unit,
                room.width = $width,
                room.height = $height,
                room.linearUnit = $linear_unit,
                room.notes = $notes,
                room.uri = $room_uri
            MERGE (house)-[:HAS_ROOM {materialized: true, rdfs__label: 'has room'}]->(room)
            """,
            house_id=house_id,
            room_id=room.room_id,
            label=room.label,
            room_type=room.room_type,
            level_name=room.level_name,
            area=room.area,
            area_unit=room.area_unit,
            width=room.width,
            height=room.height,
            linear_unit=room.linear_unit,
            notes=room.notes,
            room_uri=f"urn:house-plan-toolset:room:{room.room_id}",
        ).consume()


def sync_default_utility_connections(session, *, house_id: str) -> None:
    for utility in build_default_utility_connections(house_id):
        session.run(
            """
            MATCH (house:House {houseId: $house_id})
            MERGE (utility:UtilityConnection {utilityConnectionId: $utility_id})
            SET utility.rdfs__label = $label,
                utility.utilityType = $utility_type,
                utility.status = $status,
                utility.notes = $notes,
                utility.uri = $utility_uri
            MERGE (house)-[:HAS_UTILITY_CONNECTION {materialized: true, rdfs__label: 'has utility connection'}]->(utility)
            """,
            house_id=house_id,
            utility_id=utility.utility_connection_id,
            label=utility.label,
            utility_type=utility.utility_type,
            status=utility.status,
            notes=utility.notes,
            utility_uri=f"urn:house-plan-toolset:utility:{utility.utility_connection_id}",
        ).consume()


def build_default_room_summaries(house_id: str, house_plan_points: list[tuple[float, float]]) -> list[RoomSummary]:
    closed_points = list(house_plan_points) + [house_plan_points[0]]
    metrics = compute_metrics(closed_points)
    total_area = metrics.area
    width = metrics.width
    height = metrics.height
    room_specs = [
        ("living-room", "Living Room", "living_room", 0.42, "Primary shared room facing the main outdoor living side."),
        ("kitchen", "Kitchen", "kitchen", 0.22, "Placed adjacent to circulation and outdoor serving access."),
        ("bedroom", "Primary Bedroom", "bedroom", 0.24, "Quiet private room oriented away from the public frontage."),
        ("bathroom", "Bathroom", "bathroom", 0.12, "Compact service room grouped with house utilities."),
    ]
    rooms: list[RoomSummary] = []
    for index, (suffix, label, room_type, share, notes) in enumerate(room_specs, start=1):
        room_area = round(total_area * share, 2)
        room_width = round(width * (0.45 if room_type in {"living_room", "bedroom"} else 0.32), 2)
        room_height = round(max(room_area / max(room_width, 1.0), 1.0), 2)
        rooms.append(
            RoomSummary(
                room_id=f"{house_id}-{suffix}-{index}",
                label=label,
                room_type=room_type,
                level_name="main level",
                area=room_area,
                area_unit=metrics.area_unit,
                width=room_width,
                height=room_height,
                linear_unit=metrics.linear_unit,
                notes=notes,
                floor_x_ratio=0.0,
                floor_y_ratio=0.0,
                floor_width_ratio=0.0,
                floor_height_ratio=0.0,
            )
        )
    return rooms


def build_default_utility_connections(house_id: str) -> list[UtilityConnectionSummary]:
    return [
        UtilityConnectionSummary(
            utility_connection_id=f"{house_id}-utility-water",
            label="Water Service",
            utility_type="water",
            status="assumed_existing",
            notes="Confirm main shutoff, hose bib routing, and irrigation tie-in potential.",
        ),
        UtilityConnectionSummary(
            utility_connection_id=f"{house_id}-utility-power",
            label="Electrical Service",
            utility_type="electrical",
            status="assumed_existing",
            notes="Confirm panel capacity for outdoor lighting, pumps, and future charging loads.",
        ),
        UtilityConnectionSummary(
            utility_connection_id=f"{house_id}-utility-drainage",
            label="Stormwater Discharge",
            utility_type="drainage",
            status="needs_verification",
            notes="Verify gutter leaders, footing drains, and legal discharge path away from the house.",
        ),
    ]


def hydrate_room_summary(props: dict[str, Any]) -> RoomSummary | None:
    if not props.get("roomId"):
        return None
    return RoomSummary(
        room_id=str(props["roomId"]),
        label=str(props.get("rdfs__label") or props.get("label") or props["roomId"]),
        room_type=str(props.get("roomType") or "room"),
        level_name=str(props.get("levelName") or "main level"),
        area=float(props.get("area") or 0.0),
        area_unit=str(props.get("areaUnit") or "square feet"),
        width=float(props.get("width") or 0.0),
        height=float(props.get("height") or 0.0),
        linear_unit=str(props.get("linearUnit") or "feet"),
        notes=str(props.get("notes") or ""),
        floor_x_ratio=float(props.get("floorXRatio") or 0.0),
        floor_y_ratio=float(props.get("floorYRatio") or 0.0),
        floor_width_ratio=float(props.get("floorWidthRatio") or 0.0),
        floor_height_ratio=float(props.get("floorHeightRatio") or 0.0),
    )


def sync_rooms(session, *, parcel_id: str, rooms: list[RoomSummary]) -> None:
    house_row = session.run(
        """
        MATCH (:Parcel:Resource {parcelId: $parcel_id})-[:HAS_HOUSE]->(house:House)
        RETURN house.houseId AS house_id
        """,
        parcel_id=parcel_id,
    ).single()
    if house_row is None or not house_row.get("house_id"):
        return

    house_id = str(house_row["house_id"])
    existing_rows = session.run(
        """
        MATCH (:House {houseId: $house_id})-[:HAS_ROOM]->(room:Room)
        RETURN room.roomId AS room_id
        """,
        house_id=house_id,
    )
    existing_ids = {str(row["room_id"]) for row in existing_rows if row.get("room_id")}
    incoming_ids = {room.room_id for room in rooms}

    for room in rooms:
        session.run(
            """
            MATCH (house:House {houseId: $house_id})
            MERGE (room:Room {roomId: $room_id})
            SET room.rdfs__label = $label,
                room.roomType = $room_type,
                room.levelName = $level_name,
                room.area = $area,
                room.areaUnit = $area_unit,
                room.width = $width,
                room.height = $height,
                room.linearUnit = $linear_unit,
                room.notes = $notes,
                room.floorXRatio = $floor_x_ratio,
                room.floorYRatio = $floor_y_ratio,
                room.floorWidthRatio = $floor_width_ratio,
                room.floorHeightRatio = $floor_height_ratio,
                room.uri = $room_uri
            MERGE (house)-[:HAS_ROOM {materialized: true, rdfs__label: 'has room'}]->(room)
            """,
            house_id=house_id,
            room_id=room.room_id,
            label=room.label,
            room_type=room.room_type,
            level_name=room.level_name,
            area=room.area,
            area_unit=room.area_unit,
            width=room.width,
            height=room.height,
            linear_unit=room.linear_unit,
            notes=room.notes,
            floor_x_ratio=room.floor_x_ratio,
            floor_y_ratio=room.floor_y_ratio,
            floor_width_ratio=room.floor_width_ratio,
            floor_height_ratio=room.floor_height_ratio,
            room_uri=f"urn:house-plan-toolset:room:{room.room_id}",
        ).consume()

    stale_ids = existing_ids - incoming_ids
    if stale_ids:
        session.run(
            """
            MATCH (:House {houseId: $house_id})-[rel:HAS_ROOM]->(room:Room)
            WHERE room.roomId IN $room_ids
            DELETE rel
            WITH room
            DETACH DELETE room
            """,
            house_id=house_id,
            room_ids=list(stale_ids),
        ).consume()


def hydrate_utility_summary(props: dict[str, Any]) -> UtilityConnectionSummary | None:
    if not props.get("utilityConnectionId"):
        return None
    return UtilityConnectionSummary(
        utility_connection_id=str(props["utilityConnectionId"]),
        label=str(props.get("rdfs__label") or props.get("label") or props["utilityConnectionId"]),
        utility_type=str(props.get("utilityType") or "utility"),
        status=str(props.get("status") or "unknown"),
        notes=str(props.get("notes") or ""),
    )


def build_house_summary(
    house_props: dict[str, Any],
    house_plan_points: list[tuple[float, float]],
    linear_unit: str,
    area_unit: str,
) -> HouseSummary | None:
    if not house_plan_points:
        return None
    closed_points = list(house_plan_points) + [house_plan_points[0]]
    metrics = compute_metrics(closed_points)
    return HouseSummary(
        house_id=str(house_props.get("houseId") or "house-1"),
        label=str(house_props.get("rdfs__label") or "House"),
        source=str(house_props.get("source") or "neo4j_house_graph"),
        footprint_points=list(house_plan_points),
        area=metrics.area,
        perimeter=metrics.perimeter,
        width=metrics.width,
        height=metrics.height,
        linear_unit=metrics.linear_unit or linear_unit,
        area_unit=metrics.area_unit or area_unit,
    )


def fetch_suffolk_elevation_summary(closed_points: list[tuple[float, float]]) -> ElevationSummary:
    contour_5ft_values = query_suffolk_contours(closed_points, SUFFOLK_CONTOUR_5FT_LAYER)
    contour_10ft_values = query_suffolk_contours(closed_points, SUFFOLK_CONTOUR_10FT_LAYER)
    if not contour_5ft_values and not contour_10ft_values:
        raise ValueError("No Suffolk contour elevations intersected the parcel footprint.")
    all_values = contour_5ft_values + contour_10ft_values
    min_elevation = min(all_values)
    max_elevation = max(all_values)
    return ElevationSummary(
        source="suffolk_county_gisviewer_contours",
        min_elevation_feet=min_elevation,
        max_elevation_feet=max_elevation,
        relief_feet=max_elevation - min_elevation,
        contour_5ft_values=contour_5ft_values,
        contour_10ft_values=contour_10ft_values,
    )


def fetch_suffolk_elevation_dataset(
    closed_points: list[tuple[float, float]],
) -> tuple[ElevationSummary, list[ContourLineSummary]]:
    contour_5ft = query_suffolk_contour_features(closed_points, SUFFOLK_CONTOUR_5FT_LAYER)
    contour_10ft = query_suffolk_contour_features(closed_points, SUFFOLK_CONTOUR_10FT_LAYER)
    contour_5ft_values = sorted({item.elevation_feet for item in contour_5ft})
    contour_10ft_values = sorted({item.elevation_feet for item in contour_10ft})
    if not contour_5ft_values and not contour_10ft_values:
        raise ValueError("No Suffolk contour elevations intersected the parcel footprint.")
    all_values = contour_5ft_values + contour_10ft_values
    min_elevation = min(all_values)
    max_elevation = max(all_values)
    return (
        ElevationSummary(
            source="suffolk_county_gisviewer_contours",
            min_elevation_feet=min_elevation,
            max_elevation_feet=max_elevation,
            relief_feet=max_elevation - min_elevation,
            contour_5ft_values=contour_5ft_values,
            contour_10ft_values=contour_10ft_values,
        ),
        contour_5ft + contour_10ft,
    )


def query_suffolk_building_footprints(
    closed_points: list[tuple[float, float]],
) -> list[SuffolkBuildingFootprintCandidate]:
    payload = query_suffolk_layer(
        closed_points,
        layer_id=SUFFOLK_BUILDING_FOOTPRINT_LAYER,
        out_fields="OBJECTID,STATUS,Shape.STArea(),Shape.STLength(),LASTUPDATE",
        return_geometry=True,
        out_sr=4326,
    )
    features = payload.get("features") or []
    candidates: list[SuffolkBuildingFootprintCandidate] = []
    for feature in features:
        attributes = feature.get("attributes") or {}
        status = attributes.get("STATUS")
        if status == "DEMOLISHED":
            continue
        outer_ring = extract_primary_ring(feature.get("geometry") or {})
        if len(outer_ring) < 3:
            continue
        candidates.append(
            SuffolkBuildingFootprintCandidate(
                object_id=attributes.get("OBJECTID", "unknown"),
                status=str(status) if status not in {None, ""} else None,
                area_square_feet=coerce_float(attributes.get("Shape.STArea()")),
                perimeter_feet=coerce_float(attributes.get("Shape.STLength()")),
                ring_points=outer_ring,
            )
        )
    return candidates


def choose_primary_building_footprint(
    candidates: list[SuffolkBuildingFootprintCandidate],
) -> SuffolkBuildingFootprintCandidate | None:
    if not candidates:
        return None
    return max(
        candidates,
        key=lambda item: (
            item.area_square_feet if item.area_square_feet is not None else polygon_area_estimate(item.ring_points),
            item.perimeter_feet if item.perimeter_feet is not None else 0.0,
        ),
    )


def query_suffolk_contours(closed_points: list[tuple[float, float]], layer_id: int) -> list[float]:
    return sorted({item.elevation_feet for item in query_suffolk_contour_features(closed_points, layer_id)})


def query_suffolk_contour_features(
    closed_points: list[tuple[float, float]],
    layer_id: int,
) -> list[ContourLineSummary]:
    payload = query_suffolk_layer(
        closed_points,
        layer_id=layer_id,
        out_fields="OBJECTID,CONTOUR",
        return_geometry=True,
        out_sr=4326,
    )
    features = payload.get("features") or []
    interval_feet = 5 if layer_id == SUFFOLK_CONTOUR_5FT_LAYER else 10
    source_layer = f"suffolk_contours_{interval_feet}ft"
    contour_lines: list[ContourLineSummary] = []
    for feature in features:
        attributes = feature.get("attributes") or {}
        contour = attributes.get("CONTOUR")
        if contour is None:
            continue
        try:
            elevation_feet = float(contour)
        except (TypeError, ValueError):
            continue
        raw_geometry = feature.get("geometry") or {}
        raw_paths = raw_geometry.get("paths") or []
        paths: list[list[tuple[float, float]]] = []
        for raw_path in raw_paths:
            if not isinstance(raw_path, list):
                continue
            path: list[tuple[float, float]] = []
            for point in raw_path:
                if not isinstance(point, list) or len(point) < 2:
                    continue
                path.append((float(point[0]), float(point[1])))
            if len(path) >= 2:
                paths.append(path)
        if not paths:
            continue
        object_id = attributes.get("OBJECTID")
        contour_lines.append(
            ContourLineSummary(
                contour_id=f"contour-{interval_feet}-{object_id}",
                label=f"Contour {elevation_feet:.0f} ft",
                elevation_feet=elevation_feet,
                interval_feet=interval_feet,
                source_layer=source_layer,
                paths=paths,
            )
        )
    return contour_lines


def query_suffolk_layer(
    closed_points: list[tuple[float, float]],
    *,
    layer_id: int,
    out_fields: str,
    return_geometry: bool,
    out_sr: int | None = None,
) -> dict[str, Any]:
    geometry = {
        "rings": [[ [float(x), float(y)] for x, y in closed_points ]],
        "spatialReference": {"wkid": 4326},
    }
    query_params: dict[str, Any] = {
        "geometry": json.dumps(geometry, separators=(",", ":")),
        "geometryType": "esriGeometryPolygon",
        "inSR": 4326,
        "spatialRel": "esriSpatialRelIntersects",
        "outFields": out_fields,
        "returnGeometry": "true" if return_geometry else "false",
        "f": "pjson",
    }
    if out_sr is not None:
        query_params["outSR"] = out_sr
    if layer_id in {SUFFOLK_CONTOUR_5FT_LAYER, SUFFOLK_CONTOUR_10FT_LAYER}:
        query_params["orderByFields"] = "CONTOUR"
    params = urllib.parse.urlencode(query_params)
    url = f"{SUFFOLK_GIS_BASE}/{layer_id}/query?{params}"
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json,text/plain,*/*",
            "Referer": "https://gisapps.suffolkcountyny.gov/gisviewer/",
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/126.0.0.0 Safari/537.36"
            ),
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def serialize_elevation_summary(summary: ElevationSummary) -> dict[str, Any]:
    return {
        "source": summary.source,
        "min_elevation_feet": summary.min_elevation_feet,
        "max_elevation_feet": summary.max_elevation_feet,
        "relief_feet": summary.relief_feet,
        "contour_5ft_values": list(summary.contour_5ft_values),
        "contour_10ft_values": list(summary.contour_10ft_values),
    }


def serialize_contour_line(contour_line: ContourLineSummary) -> dict[str, Any]:
    return {
        "contour_id": contour_line.contour_id,
        "label": contour_line.label,
        "elevation_feet": contour_line.elevation_feet,
        "interval_feet": contour_line.interval_feet,
        "source_layer": contour_line.source_layer,
        "paths": [
            [[float(x), float(y)] for x, y in path]
            for path in contour_line.paths
        ],
    }


def extract_primary_ring(geometry: dict[str, Any]) -> list[tuple[float, float]]:
    rings = geometry.get("rings") or []
    best_ring: list[tuple[float, float]] = []
    best_area = -1.0
    for raw_ring in rings:
        if not isinstance(raw_ring, list):
            continue
        ring_points = [
            (float(point[0]), float(point[1]))
            for point in raw_ring
            if isinstance(point, list) and len(point) >= 2
        ]
        if len(ring_points) < 4:
            continue
        open_ring = ring_points[:-1] if ring_points[0] == ring_points[-1] else ring_points
        area = polygon_area_estimate(open_ring)
        if area > best_area:
            best_area = area
            best_ring = open_ring
    return best_ring


def polygon_area_estimate(points: list[tuple[float, float]]) -> float:
    if len(points) < 3:
        return 0.0
    closed_points = points + [points[0]]
    total = 0.0
    for index in range(len(closed_points) - 1):
        x1, y1 = closed_points[index]
        x2, y2 = closed_points[index + 1]
        total += (x1 * y2) - (x2 * y1)
    return abs(total) / 2.0


def coerce_float(value: Any) -> float | None:
    if value in {None, ""}:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def build_feature_collection(
    geojson_path: str | Path,
    *,
    default_state: str,
) -> tuple[list[ParcelBundle], GeoJSONFeatureCollection]:
    data = load_geojson(geojson_path)
    features = extract_features(data)
    collection_id = sanitize_identifier(Path(geojson_path).stem)
    bundles = [
        build_parcel_bundle(feature, feature_index=index, default_state=default_state)
        for index, feature in enumerate(features, start=1)
    ]
    collection = GeoJSONFeatureCollection(
        featureCollectionId=collection_id,
        hasFeature=[bundle.feature for bundle in bundles],
    )
    return bundles, collection


def extract_features(data: dict[str, Any]) -> list[dict[str, Any]]:
    data_type = data.get("type")
    if data_type == "FeatureCollection":
        features = data.get("features") or []
        if not features:
            raise ValueError("GeoJSON FeatureCollection contains no features.")
        return list(features)
    if data_type == "Feature":
        return [data]
    if data_type in {"Polygon", "MultiPolygon"}:
        return [{"type": "Feature", "properties": {}, "geometry": data}]
    raise ValueError(f"Unsupported GeoJSON top-level type: {data_type!r}")


def build_parcel_bundle(
    feature: dict[str, Any],
    *,
    feature_index: int,
    default_state: str,
) -> ParcelBundle:
    geometry = feature.get("geometry") or {}
    properties = dict(feature.get("properties") or {})
    geometry_type = geometry.get("type")
    if geometry_type == "Polygon":
        ring = (geometry.get("coordinates") or [[]])[0]
    elif geometry_type == "MultiPolygon":
        ring = ((geometry.get("coordinates") or [[[]]])[0] or [[]])[0]
    else:
        raise ValueError(f"Unsupported geometry type: {geometry_type!r}")
    if len(ring) < 4:
        raise ValueError("Parcel boundary must contain at least four coordinates.")

    parcel_key = sanitize_identifier(
        str(properties.get("PARCELID") or properties.get("parcel_id") or feature_index)
    )
    boundary_vertices = [
        BoundaryVertex(
            gpsCoordinateId=f"{parcel_key}-vertex-{index}",
            latitude=Decimal(str(point[1])),
            longitude=Decimal(str(point[0])),
            vertexSequenceNumber=index,
        )
        for index, point in enumerate(ring[:-1], start=1)
    ]
    polygon = PolygonGeometry(
        geometryId=f"{parcel_key}-geometry-1",
        coordinateSequenceText=" | ".join(f"{point[0]},{point[1]}" for point in ring[:-1]),
        hasBoundaryVertex=boundary_vertices,
    )

    parcel_kwargs: dict[str, Any] = {
        "parcelId": str(properties.get("PARCELID") or properties.get("parcel_id") or parcel_key),
        "parcelIdentifier": stringify_optional(properties.get("OBJECTID")),
        "fullAddressText": stringify_optional(properties.get("FULLADDRESS") or properties.get("address")),
        "hasParcelGeometry": [polygon],
    }
    address = build_postal_address(properties, parcel_key=parcel_key, default_state=default_state)
    if address is not None:
        parcel_kwargs["hasParcelAddress"] = [address]

    parcel = Parcel(**parcel_kwargs)
    feature_model = GeoJSONFeature(
        featureId=f"{parcel_key}-feature",
        geometryTypeName=geometry_type,
        sourceObjectId=stringify_optional(properties.get("OBJECTID")),
        representsParcel=[parcel],
    )
    return ParcelBundle(source_properties=properties, parcel=parcel, feature=feature_model)


def build_postal_address(
    properties: dict[str, Any],
    *,
    parcel_key: str,
    default_state: str,
) -> USPostalAddress | None:
    street = stringify_optional(properties.get("FULLADDRESS") or properties.get("address"))
    city = stringify_optional(properties.get("MUNICIPALITY") or properties.get("municipality"))
    postal_code = normalize_zipcode(properties.get("ZIPCODE") or properties.get("zipcode"))
    if not (street and city and postal_code):
        return None

    state_code = normalize_state_code(
        properties.get("STATE")
        or properties.get("state")
        or default_state
    )
    return USPostalAddress(
        addressId=f"{parcel_key}-address-1",
        streetAddressLine1=street,
        cityName=city,
        subdivision=USStateEnum[state_code],
        postalCode=postal_code,
        country=CountryEnum.UNITED_STATES_OF_AMERICA,
    )


def normalize_zipcode(value: Any) -> str | None:
    if value in {None, ""}:
        return None
    digits = re.sub(r"[^\d-]", "", str(value).strip())
    return digits or None


def normalize_state_code(value: Any) -> str:
    text = str(value or "NY").strip().upper()
    if text in USStateEnum.__members__:
        return text
    raise ValueError(f"Unsupported state code for parcel address: {text!r}")


def stringify_optional(value: Any) -> str | None:
    if value in {None, ""}:
        return None
    return str(value)


def neo4j_compatible(value: Any) -> Any:
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, dict):
        return {k: neo4j_compatible(v) for k, v in value.items()}
    if isinstance(value, list):
        return [neo4j_compatible(v) for v in value]
    return value


def merge_collection_node(session, collection: GeoJSONFeatureCollection) -> None:
    collection_props = neo4j_compatible(collection.model_dump(by_alias=True, exclude={"has_feature"}))
    session.run(
        """
        MERGE (collection:GeoJSONFeatureCollection:Resource {uri: $collection_uri})
        SET collection += $collection_props,
            collection.rdfs__label = $label
        """,
        collection_uri=f"urn:hp62n:collection:{collection.feature_collection_id}",
        collection_props=collection_props,
        label=collection.feature_collection_id,
    ).consume()


def merge_parcel_bundle(session, bundle: ParcelBundle, *, collection_id: str, index: int) -> None:
    parcel = bundle.parcel
    feature = bundle.feature
    geometry = parcel.has_parcel_geometry[0]
    address = parcel.has_parcel_address[0] if parcel.has_parcel_address else None

    parcel_props = neo4j_compatible(
        parcel.model_dump(by_alias=True, exclude={"has_parcel_address", "has_parcel_geometry"})
    )
    parcel_props.update({k: neo4j_compatible(v) for k, v in bundle.source_properties.items() if is_supported_property(v)})
    feature_props = neo4j_compatible(feature.model_dump(by_alias=True, exclude={"represents_parcel"}))
    geometry_props = neo4j_compatible(geometry.model_dump(by_alias=True, exclude={"has_boundary_vertex"}))

    params = {
        "collection_uri": f"urn:hp62n:collection:{collection_id}",
        "feature_uri": f"urn:hp62n:feature:{feature.feature_id}",
        "parcel_uri": f"urn:hp62n:parcel:{parcel.parcel_id}",
        "geometry_uri": f"urn:hp62n:geometry:{geometry.geometry_id}",
        "feature_props": feature_props,
        "parcel_props": parcel_props,
        "geometry_props": geometry_props,
        "feature_label": feature.feature_id,
        "parcel_label": parcel.full_address_text or parcel.parcel_id,
        "geometry_label": geometry.geometry_id,
        "has_feature_uri": f"{PARCEL_NS}hasFeature",
        "represents_parcel_uri": f"{PARCEL_NS}representsParcel",
        "has_parcel_geometry_uri": f"{PARCEL_NS}hasParcelGeometry",
    }
    session.run(
        """
        MATCH (collection:GeoJSONFeatureCollection:Resource {uri: $collection_uri})
        MERGE (feature:GeoJSONFeature:Resource {uri: $feature_uri})
        SET feature += $feature_props,
            feature.rdfs__label = $feature_label
        MERGE (parcel:Parcel:Resource {uri: $parcel_uri})
        SET parcel += $parcel_props,
            parcel.rdfs__label = $parcel_label
        MERGE (geometry:PolygonGeometry:Geometry:Resource {uri: $geometry_uri})
        SET geometry += $geometry_props,
            geometry.rdfs__label = $geometry_label
        MERGE (collection)-[:hasFeature {
            uri: $has_feature_uri,
            rdfs__label: 'has feature',
            materialized: true
        }]->(feature)
        MERGE (feature)-[:representsParcel {
            uri: $represents_parcel_uri,
            rdfs__label: 'represents parcel',
            materialized: true
        }]->(parcel)
        MERGE (parcel)-[:hasParcelGeometry {
            uri: $has_parcel_geometry_uri,
            rdfs__label: 'has parcel geometry',
            materialized: true
        }]->(geometry)
        """,
        params,
    ).consume()

    if address is not None:
        merge_address(session, parcel=parcel, address=address)

    for vertex in geometry.has_boundary_vertex:
        merge_boundary_vertex(session, geometry=geometry, vertex=vertex)


def merge_address(session, *, parcel: Parcel, address: USPostalAddress) -> None:
    address_props = neo4j_compatible(address.model_dump(by_alias=True))
    subdivision_uri = SUBDIVISION_URI_TEMPLATE.format(state=address.subdivision.value)
    session.run(
        """
        MATCH (parcel:Parcel:Resource {uri: $parcel_uri})
        MERGE (address:USPostalAddress:Address:Resource {uri: $address_uri})
        SET address += $address_props,
            address.rdfs__label = $address_label
        MERGE (country:Country:Resource {uri: $country_uri})
        SET country.rdfs__label = $country_label
        MERGE (subdivision:CountrySubdivision:Resource {uri: $subdivision_uri})
        SET subdivision.rdfs__label = $subdivision_label,
            subdivision.fnd_utl_av__preferredDesignation = $subdivision_code
        MERGE (parcel)-[:hasParcelAddress {
            uri: $has_parcel_address_uri,
            rdfs__label: 'has parcel address',
            materialized: true
        }]->(address)
        MERGE (address)-[:hasCountry {
            uri: $has_country_uri,
            rdfs__label: 'has country',
            materialized: true
        }]->(country)
        MERGE (address)-[:hasSubdivision {
            uri: $has_subdivision_uri,
            rdfs__label: 'has subdivision',
            materialized: true
        }]->(subdivision)
        """,
        parcel_uri=f"urn:hp62n:parcel:{parcel.parcel_id}",
        address_uri=f"urn:hp62n:address:{address.address_id}",
        address_props=address_props,
        address_label=address.street_address_line1,
        country_uri=USA_URI,
        country_label=CountryEnum.UNITED_STATES_OF_AMERICA.value,
        subdivision_uri=subdivision_uri,
        subdivision_label=address.subdivision.value,
        subdivision_code=address.subdivision.value,
        has_parcel_address_uri=f"{PARCEL_NS}hasParcelAddress",
        has_country_uri=f"{PARCEL_NS}hasCountry",
        has_subdivision_uri=f"{PARCEL_NS}hasSubdivision",
    ).consume()


def merge_boundary_vertex(session, *, geometry: PolygonGeometry, vertex: BoundaryVertex) -> None:
    vertex_props = neo4j_compatible(vertex.model_dump(by_alias=True))
    session.run(
        """
        MATCH (geometry:PolygonGeometry:Geometry:Resource {uri: $geometry_uri})
        MERGE (vertex:BoundaryVertex:GPSCoordinate:Resource {uri: $vertex_uri})
        SET vertex += $vertex_props,
            vertex.rdfs__label = $vertex_label
        MERGE (geometry)-[:hasBoundaryVertex {
            uri: $has_boundary_vertex_uri,
            rdfs__label: 'has boundary vertex',
            materialized: true
        }]->(vertex)
        """,
        geometry_uri=f"urn:hp62n:geometry:{geometry.geometry_id}",
        vertex_uri=f"urn:hp62n:vertex:{vertex.gps_coordinate_id}",
        vertex_props=vertex_props,
        vertex_label=f"boundary vertex {vertex.vertex_sequence_number}",
        has_boundary_vertex_uri=f"{PARCEL_NS}hasBoundaryVertex",
    ).consume()


def is_supported_property(value: Any) -> bool:
    return isinstance(value, (str, int, float, bool)) or value is None


def sanitize_identifier(value: str) -> str:
    cleaned = "".join(char.lower() if char.isalnum() else "-" for char in value).strip("-")
    return cleaned or "parcel"
