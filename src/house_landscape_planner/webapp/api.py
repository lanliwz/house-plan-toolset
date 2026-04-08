from __future__ import annotations

import math
from decimal import Decimal
from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi import UploadFile
from pydantic import BaseModel, Field
from onto2ai_parcel.staging.pydantic_parcel_model import BoundaryVertex, Parcel, PolygonGeometry

from house_landscape_planner.analysis.site_diagram import render_site_diagram_svg
from house_landscape_planner.analysis.site_report import (
    create_site_assessment,
    render_markdown_report,
)
from house_landscape_planner.models import ConceptZone, LandscapeFeature, SiteAssessment


class ParcelMetricsResponse(BaseModel):
    area: float
    perimeter: float
    area_unit: str
    linear_unit: str
    centroid_x: float
    centroid_y: float
    width: float
    height: float
    aspect_ratio: float
    irregularity_index: float
    vertex_count: int
    coordinate_system: str


class ImageSummaryResponse(BaseModel):
    source_name: str
    width_px: int
    height_px: int
    mode: str
    format: str | None


class ConceptZoneResponse(BaseModel):
    name: str
    intent: str
    siting: str
    moves: list[str]
    target_share_percent: int


class LandscapeFeatureResponse(BaseModel):
    feature_id: str
    name: str
    ontology_class: str
    zone_name: str
    summary: str
    intent: str
    placement: str
    rationale: str
    design_moves: list[str]
    priority: str
    target_share_percent: int | None
    anchor_x_ratio: float
    anchor_y_ratio: float
    width_ratio: float
    height_ratio: float
    visual_kind: str
    rotation_degrees: float | None = None


class LandscapeFeatureUpdateRequest(BaseModel):
    feature_id: str
    name: str
    ontology_class: str
    zone_name: str
    summary: str
    intent: str
    placement: str
    rationale: str
    design_moves: list[str]
    priority: str
    target_share_percent: int | None
    anchor_x_ratio: float
    anchor_y_ratio: float
    width_ratio: float
    height_ratio: float
    visual_kind: str
    rotation_degrees: float | None = None


class ParcelObjectResponse(BaseModel):
    id: str
    kind: str
    label: str
    subtitle: str
    description: str
    properties: dict[str, object]


class EdgeObjectResponse(BaseModel):
    id: str
    kind: str = "edge"
    label: str
    subtitle: str
    description: str
    properties: dict[str, object]


class VertexObjectResponse(BaseModel):
    id: str
    kind: str = "vertex"
    label: str
    subtitle: str
    description: str
    properties: dict[str, object]


class FeatureObjectResponse(BaseModel):
    id: str
    kind: str = "feature"
    label: str
    subtitle: str
    description: str
    properties: dict[str, object]


class SiteObjectsResponse(BaseModel):
    parcel: ParcelObjectResponse
    edges: list[EdgeObjectResponse]
    vertices: list[VertexObjectResponse]
    features: list[FeatureObjectResponse]


class SiteAssessmentResponse(BaseModel):
    parcel_name: str
    geometry_type: str
    parcel_properties: dict[str, object]
    metrics: ParcelMetricsResponse
    image: ImageSummaryResponse | None
    assumptions: list[str]
    concept_zones: list[ConceptZoneResponse]
    landscape_features: list[LandscapeFeatureResponse]
    recommendations: list[str]
    next_data_to_collect: list[str]
    report_markdown: str
    diagram_svg: str
    parcel_boundary_points: list[tuple[float, float]] = Field(default_factory=list)
    objects: SiteObjectsResponse
    persistence_mode: str = "session"


async def create_assessment_from_uploads(
    parcel_file: UploadFile,
    image_file: UploadFile | None = None,
) -> SiteAssessmentResponse:
    parcel_name = parcel_file.filename or "parcel.geojson"
    image_name = image_file.filename if image_file else None

    with TemporaryDirectory(prefix="house-plan-ui-") as tmp_dir:
        temp_dir = Path(tmp_dir)
        parcel_path = temp_dir / parcel_name
        parcel_path.write_bytes(await parcel_file.read())

        image_path: Path | None = None
        if image_file is not None and image_name:
            image_path = temp_dir / image_name
            image_path.write_bytes(await image_file.read())

        assessment = create_site_assessment(parcel_path, image_path)
        return serialize_assessment(assessment, parcel_name=parcel_name)


def serialize_assessment(
    assessment: SiteAssessment,
    *,
    parcel_name: str,
) -> SiteAssessmentResponse:
    metrics = assessment.parcel.metrics
    image = assessment.image

    return SiteAssessmentResponse(
        parcel_name=parcel_name,
        geometry_type=assessment.parcel.geometry_type,
        parcel_properties=assessment.parcel.properties,
        metrics=ParcelMetricsResponse(
            area=metrics.area,
            perimeter=metrics.perimeter,
            area_unit=metrics.area_unit,
            linear_unit=metrics.linear_unit,
            centroid_x=metrics.centroid_x,
            centroid_y=metrics.centroid_y,
            width=metrics.width,
            height=metrics.height,
            aspect_ratio=metrics.aspect_ratio,
            irregularity_index=metrics.irregularity_index,
            vertex_count=metrics.vertex_count,
            coordinate_system=metrics.coordinate_system,
        ),
        image=(
            ImageSummaryResponse(
                source_name=image.source_path.name,
                width_px=image.width_px,
                height_px=image.height_px,
                mode=image.mode,
                format=image.format,
            )
            if image is not None
            else None
        ),
        assumptions=list(assessment.assumptions),
        concept_zones=[serialize_zone(zone) for zone in assessment.concept_zones],
        landscape_features=[serialize_landscape_feature(feature) for feature in assessment.landscape_features],
        recommendations=list(assessment.recommendations),
        next_data_to_collect=list(assessment.next_data_to_collect),
        report_markdown=render_markdown_report(assessment),
        diagram_svg=render_site_diagram_svg(assessment),
        parcel_boundary_points=list(assessment.parcel.boundary_points),
        objects=serialize_site_objects(assessment, parcel_name=parcel_name),
        persistence_mode="neo4j" if str(assessment.parcel.source_path).startswith("/neo4j/") else "session",
    )


def serialize_zone(zone: ConceptZone) -> ConceptZoneResponse:
    return ConceptZoneResponse(
        name=zone.name,
        intent=zone.intent,
        siting=zone.siting,
        moves=list(zone.moves),
        target_share_percent=zone.target_share_percent,
    )


def serialize_landscape_feature(feature: LandscapeFeature) -> LandscapeFeatureResponse:
    return LandscapeFeatureResponse(
        feature_id=feature.feature_id,
        name=feature.name,
        ontology_class=feature.ontology_class,
        zone_name=feature.zone_name,
        summary=feature.summary,
        intent=feature.intent,
        placement=feature.placement,
        rationale=feature.rationale,
        design_moves=list(feature.design_moves),
        priority=feature.priority,
        target_share_percent=feature.target_share_percent,
        anchor_x_ratio=feature.anchor_x_ratio,
        anchor_y_ratio=feature.anchor_y_ratio,
        width_ratio=feature.width_ratio,
        height_ratio=feature.height_ratio,
        visual_kind=feature.visual_kind,
        rotation_degrees=feature.rotation_degrees,
    )


def serialize_site_objects(
    assessment: SiteAssessment,
    *,
    parcel_name: str,
) -> SiteObjectsResponse:
    boundary_points = assessment.parcel.boundary_points
    open_points = boundary_points[:-1] if len(boundary_points) > 1 else list(boundary_points)
    parcel_model = build_onto2ai_parcel_model(assessment, parcel_name=parcel_name)
    edges = build_edge_objects(open_points, assessment)
    vertices = build_vertex_objects(open_points, assessment, parcel_model)
    features = build_feature_objects(assessment)

    metrics = assessment.parcel.metrics
    parcel = ParcelObjectResponse(
        id="parcel",
        kind="parcel",
        label=parcel_model.full_address_text or parcel_name,
        subtitle=f"{assessment.parcel.geometry_type} with {metrics.vertex_count} vertices | Parcel ID {parcel_model.parcel_id}",
        description="Primary parcel object. Select edges or vertices to inspect individual geometry segments.",
        properties={
            "parcel_id": parcel_model.parcel_id,
            "parcel_identifier": parcel_model.parcel_identifier,
            "full_address_text": parcel_model.full_address_text,
            "geometry_type": assessment.parcel.geometry_type,
            "area": round(metrics.area, 3),
            "area_unit": metrics.area_unit,
            "perimeter": round(metrics.perimeter, 3),
            "linear_unit": metrics.linear_unit,
            "aspect_ratio": round(metrics.aspect_ratio, 3),
            "irregularity_index": round(metrics.irregularity_index, 3),
            "coordinate_system": metrics.coordinate_system,
            "edge_count": len(edges),
            "vertex_count": len(vertices),
            "feature_count": len(features),
            **assessment.parcel.properties,
        },
    )
    return SiteObjectsResponse(parcel=parcel, edges=edges, vertices=vertices, features=features)


def build_edge_objects(
    points: list[tuple[float, float]],
    assessment: SiteAssessment,
) -> list[EdgeObjectResponse]:
    unit = display_linear_unit(assessment.parcel.metrics.linear_unit)
    edges: list[EdgeObjectResponse] = []

    for index, start_point in enumerate(points):
        end_point = points[(index + 1) % len(points)]
        dx = end_point[0] - start_point[0]
        dy = end_point[1] - start_point[1]
        length = math.hypot(dx, dy)
        bearing = (math.degrees(math.atan2(dy, dx)) + 360.0) % 360.0
        compass = compass_direction_from_bearing(bearing)

        edges.append(
            EdgeObjectResponse(
                id=f"edge-{index + 1}",
                label=f"Edge {index + 1}",
                subtitle=f"{length:.1f} {unit} toward {compass}",
                description="Parcel boundary segment between two adjacent vertices.",
                properties={
                    "length": round(length, 3),
                    "length_unit": unit,
                    "direction": compass,
                    "bearing_degrees": round(bearing, 2),
                },
            )
        )
    return edges


def build_vertex_objects(
    points: list[tuple[float, float]],
    assessment: SiteAssessment,
    parcel_model: Parcel,
) -> list[VertexObjectResponse]:
    boundary_vertices = parcel_model.has_parcel_geometry[0].has_boundary_vertex
    vertices: list[VertexObjectResponse] = []

    for index, point in enumerate(points):
        previous_point = points[index - 1]
        next_point = points[(index + 1) % len(points)]
        turn_angle = interior_angle(previous_point, point, next_point)
        boundary_vertex = boundary_vertices[index]
        latitude = float(boundary_vertex.latitude)
        longitude = float(boundary_vertex.longitude)

        vertices.append(
            VertexObjectResponse(
                id=f"vertex-{index + 1}",
                label=f"Vertex {index + 1}",
                subtitle=f"{latitude:.6f}, {longitude:.6f}",
                description="Parcel corner point connecting two boundary edges.",
                properties={
                    "gps_coordinate_id": boundary_vertex.gps_coordinate_id,
                    "vertex_sequence_number": boundary_vertex.vertex_sequence_number,
                    "interior_angle_degrees": round(turn_angle, 2),
                    "linear_unit": display_linear_unit(assessment.parcel.metrics.linear_unit),
                    "latitude": round(latitude, 8),
                    "longitude": round(longitude, 8),
                },
            )
        )
    return vertices


def build_feature_objects(assessment: SiteAssessment) -> list[FeatureObjectResponse]:
    return [
        FeatureObjectResponse(
            id=feature.feature_id,
            label=feature.name,
            subtitle=f"{feature.visual_kind.title()} in {feature.zone_name}",
            description=feature.summary,
            properties={
                "ontology_class": feature.ontology_class,
                "zone_name": feature.zone_name,
                "priority": feature.priority,
                "intent": feature.intent,
                "placement": feature.placement,
                "rationale": feature.rationale,
                "design_moves": list(feature.design_moves),
                "target_share_percent": feature.target_share_percent,
                "anchor_x_ratio": feature.anchor_x_ratio,
                "anchor_y_ratio": feature.anchor_y_ratio,
                "width_ratio": feature.width_ratio,
                "height_ratio": feature.height_ratio,
                "visual_kind": feature.visual_kind,
                "rotation_degrees": feature.rotation_degrees,
            },
        )
        for feature in assessment.landscape_features
    ]


def deserialize_landscape_features(items: list[LandscapeFeatureUpdateRequest]) -> list[LandscapeFeature]:
    return [
        LandscapeFeature(
            feature_id=item.feature_id,
            name=item.name,
            ontology_class=item.ontology_class,
            zone_name=item.zone_name,
            summary=item.summary,
            intent=item.intent,
            placement=item.placement,
            rationale=item.rationale,
            design_moves=list(item.design_moves),
            priority=item.priority,
            target_share_percent=item.target_share_percent,
            anchor_x_ratio=item.anchor_x_ratio,
            anchor_y_ratio=item.anchor_y_ratio,
            width_ratio=item.width_ratio,
            height_ratio=item.height_ratio,
            visual_kind=item.visual_kind,
            rotation_degrees=item.rotation_degrees,
        )
        for item in items
    ]


def build_onto2ai_parcel_model(
    assessment: SiteAssessment,
    *,
    parcel_name: str,
) -> Parcel:
    source_points = assessment.parcel.source_boundary_points[:-1]
    source_properties = assessment.parcel.properties
    parcel_key = sanitize_identifier(
        str(
            source_properties.get("PARCELID")
            or source_properties.get("parcel_id")
            or Path(parcel_name).stem
        )
    )

    boundary_vertices = [
        BoundaryVertex(
            gps_coordinate_id=f"{parcel_key}-vertex-{index}",
            latitude=Decimal(str(point[1])),
            longitude=Decimal(str(point[0])),
            vertex_sequence_number=index,
        )
        for index, point in enumerate(source_points, start=1)
    ]
    polygon = PolygonGeometry(
        geometry_id=f"{parcel_key}-geometry-1",
        coordinate_sequence_text=" | ".join(f"{point[0]},{point[1]}" for point in source_points),
        has_boundary_vertex=boundary_vertices,
    )

    return Parcel(
        parcel_id=str(source_properties.get("PARCELID") or source_properties.get("parcel_id") or parcel_key),
        parcel_identifier=(
            str(source_properties.get("OBJECTID"))
            if source_properties.get("OBJECTID") not in {None, ""}
            else None
        ),
        full_address_text=(
            str(source_properties.get("FULLADDRESS"))
            if source_properties.get("FULLADDRESS") not in {None, ""}
            else (
                str(source_properties.get("address"))
                if source_properties.get("address") not in {None, ""}
                else None
            )
        ),
        has_parcel_geometry=[polygon],
    )


def sanitize_identifier(value: str) -> str:
    return "".join(char.lower() if char.isalnum() else "-" for char in value).strip("-")


def display_linear_unit(linear_unit: str) -> str:
    if linear_unit == "feet":
        return "feet"
    return "meters"


def interior_angle(
    previous_point: tuple[float, float],
    current_point: tuple[float, float],
    next_point: tuple[float, float],
) -> float:
    vector_a = (previous_point[0] - current_point[0], previous_point[1] - current_point[1])
    vector_b = (next_point[0] - current_point[0], next_point[1] - current_point[1])
    mag_a = math.hypot(*vector_a)
    mag_b = math.hypot(*vector_b)
    if mag_a == 0.0 or mag_b == 0.0:
        return 0.0

    dot = (vector_a[0] * vector_b[0]) + (vector_a[1] * vector_b[1])
    value = max(-1.0, min(1.0, dot / (mag_a * mag_b)))
    return math.degrees(math.acos(value))


def compass_direction_from_bearing(bearing: float) -> str:
    directions = ["E", "NE", "N", "NW", "W", "SW", "S", "SE"]
    index = int(((bearing + 22.5) % 360.0) / 45.0)
    return directions[index]
