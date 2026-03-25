from __future__ import annotations

import json
import os
import re
import time
from dataclasses import dataclass
from decimal import Decimal
from enum import Enum
from pathlib import Path
from typing import Any

from neo4j import GraphDatabase
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

from house_landscape_planner.analysis.landscape_features import build_landscape_features
from house_landscape_planner.analysis.parcel import compute_metrics, normalize_points
from house_landscape_planner.analysis.site_report import (
    build_assumptions,
    build_concept_zones,
    build_next_data_list,
    build_recommendations,
)
from house_landscape_planner.io.geojson_loader import load_geojson
from house_landscape_planner.models import ParcelSummary, SiteAssessment


USA_URI = "https://www.omg.org/spec/LCC/Countries/ISO3166-1-CountryCodes/UnitedStatesOfAmerica"
SUBDIVISION_URI_TEMPLATE = (
    "https://www.omg.org/spec/LCC/Countries/Regions/ISO3166-2-SubdivisionCodes-US/US-{state}"
)
PARCEL_NS = "http://www.onto2ai-toolset.com/ontology/parcel/Parcel/#"
DEFAULT_WEB_DATABASE = os.getenv("NEO4J_HP62N_DB_NAME", "hp62n")


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
    parcel_summary = ParcelSummary(
        source_path=Path(f"/neo4j/{database}/{parcel_id}.geojson"),
        geometry_type=feature_props.get("geometryTypeName", "Polygon"),
        properties=parcel_props,
        source_boundary_points=closed_points,
        boundary_points=metric_points,
        metrics=compute_metrics(closed_points),
    )
    concept_zones = build_concept_zones(parcel_summary)
    return SiteAssessment(
        parcel=parcel_summary,
        image=None,
        assumptions=build_assumptions(parcel_summary, None),
        concept_zones=concept_zones,
        landscape_features=build_landscape_features(parcel_summary, concept_zones),
        recommendations=build_recommendations(parcel_summary, None),
        next_data_to_collect=build_next_data_list(),
    )


def get_neo4j_config(*, database: str) -> Neo4jConfig:
    uri = os.getenv("NEO4J_MODEL_DB_URL", "bolt://localhost:7687")
    username = os.getenv("NEO4J_MODEL_DB_USERNAME", "neo4j")
    password = os.getenv("NEO4J_MODEL_DB_PASSWORD")
    if not password:
        raise RuntimeError("NEO4J_MODEL_DB_PASSWORD is required")
    return Neo4jConfig(uri=uri, username=username, password=password, database=database)


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
    applied = 0
    with driver.session(database=database) as session:
        for stmt in parse_constraints_file(path):
            if stmt.upper().startswith("CREATE CONSTRAINT"):
                session.run(stmt).consume()
                applied += 1
    return applied


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
