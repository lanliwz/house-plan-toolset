from __future__ import annotations

from pathlib import Path

from house_landscape_planner.analysis.landscape_features import build_landscape_features
from house_landscape_planner.analysis.parcel import analyze_parcel
from house_landscape_planner.io.image_loader import load_image_summary
from house_landscape_planner.models import ConceptZone, ImageSummary, ParcelSummary, SiteAssessment


def build_recommendations(parcel: ParcelSummary, image: ImageSummary | None) -> list[str]:
    metrics = parcel.metrics
    recommendations: list[str] = []

    if metrics.irregularity_index > 1.35:
        recommendations.append(
            "Use curved or segmented planting beds and path alignments that follow the parcel shape instead of forcing a rigid rectangular layout."
        )
    else:
        recommendations.append(
            "A relatively compact parcel shape should support a simple zoning strategy with distinct entry, entertaining, utility, and privacy bands."
        )

    if metrics.vertex_count >= 6:
        recommendations.append(
            "Reserve odd corners and narrow leftover edges for screening, pollinator planting, rain gardens, or low-maintenance groundcover."
        )

    recommendations.append(
        "For a hillside site, keep the main circulation path on the gentlest available alignment and break elevation changes into short terrace transitions."
    )
    recommendations.append(
        "Plan drainage first: direct runoff away from the house, add interception planting uphill, and evaluate whether small retaining walls or dry creek features are needed."
    )
    recommendations.append(
        "Cluster irrigation zones by slope exposure and planting type so upper dry areas and lower wetter pockets can be managed separately."
    )

    if image is not None and image.width_px >= 3000:
        recommendations.append(
            "The high-resolution satellite image should be good enough for manual site markup of entries, driveway edges, canopy shadows, and likely drainage paths."
        )

    return recommendations


def build_assumptions(parcel: ParcelSummary, image: ImageSummary | None) -> list[str]:
    assumptions = [
        "Street approach is assumed to be along the edge facing North Country Road; verify the exact driveway and walk arrival on site.",
        "The lot is treated as a hillside parcel because that is part of the project brief, but actual slope direction and steepness still need survey or contour confirmation.",
        "The satellite image is used only as visual context here; no automated house-footprint or tree-canopy extraction is being performed yet.",
    ]
    if image is None:
        assumptions.append("No site image was provided, so zone placement is based on parcel geometry only.")
    if parcel.metrics.irregularity_index > 1.6:
        assumptions.append("Because the parcel is notably irregular, the concept plan prioritizes flexible edge conditions over strict rectangular yard rooms.")
    return assumptions


def build_concept_zones(parcel: ParcelSummary) -> list[ConceptZone]:
    metrics = parcel.metrics
    lot_area = metrics.area

    front_share = 12 if lot_area < 25000 else 10
    circulation_share = 18 if metrics.irregularity_index > 1.5 else 15
    drainage_share = 15
    privacy_share = 28 if lot_area > 30000 else 25
    planting_share = 100 - front_share - circulation_share - drainage_share - privacy_share

    zones = [
        ConceptZone(
            name="Arrival And Frontage Zone",
            intent="Create a clean, welcoming approach from the street and give the house a strong front-door sequence.",
            siting="Place this zone along the likely road-facing edge and around the primary house entry/drive approach.",
            moves=[
                "Define a readable walk from parking to entry with low walls, steppers, or widened paving landings.",
                "Use layered foundation planting with four-season structure rather than deep shrub masses that hide the house.",
                "Keep sight triangles open near the driveway while using planting to soften pavement edges.",
            ],
            target_share_percent=front_share,
        ),
        ConceptZone(
            name="Primary Circulation Spine",
            intent="Move people comfortably across elevation changes and organize the rest of the landscape around one reliable path network.",
            siting="Run the main walk on the gentlest practical alignment from the front arrival area toward the usable side and rear portions of the parcel.",
            moves=[
                "Break grade changes into short terrace runs or broad steps with intermediate landings.",
                "Keep path curves soft and geometry responsive to the parcel rather than forcing a straight axis.",
                "Allow secondary mulch or gravel paths to peel off toward garden pockets and maintenance areas.",
            ],
            target_share_percent=circulation_share,
        ),
        ConceptZone(
            name="Stormwater And Hillside Buffer",
            intent="Slow runoff, protect the downhill side, and convert awkward slope edges into functional planted infrastructure.",
            siting="Use the lower edges, tight corners, and any downhill side of the lot for infiltration, interception, or erosion-control planting.",
            moves=[
                "Reserve narrow edge bands for rain-garden pockets, dry creek swales, or stone-lined drainage routes.",
                "Use deep-rooted shrubs, meadow mixes, and groundcovers that stabilize soil on steeper faces.",
                "Keep this zone clear of heavy program unless future grading confirms it is stable and dry.",
            ],
            target_share_percent=drainage_share,
        ),
        ConceptZone(
            name="Private Outdoor Living Terrace",
            intent="Create one primary usable outdoor room sized for seating, dining, and everyday gathering close to the house.",
            siting="Locate this zone immediately off the house on the broadest and most level-looking portion of the parcel.",
            moves=[
                "Favor one well-built terrace or deck extension over multiple undersized platforms.",
                "Use seat walls, planting, or grade transitions to create enclosure without blocking light.",
                "Provide direct connection to the circulation spine and visual connection to the broader yard.",
            ],
            target_share_percent=privacy_share,
        ),
        ConceptZone(
            name="Perimeter Planting And Privacy Belt",
            intent="Use the irregular lot edges to create screening, habitat, and a soft buffer from neighbors and road exposure.",
            siting="Wrap the remaining perimeter, especially the odd corners and longest side boundaries.",
            moves=[
                "Mix evergreen screening with deciduous small trees and pollinator-friendly understory planting.",
                "Widen planting in corners so those leftover geometries become intentional landscape moments.",
                "Separate irrigation and maintenance needs between visible ornamental areas and outer naturalized edges.",
            ],
            target_share_percent=planting_share,
        ),
    ]
    return zones


def build_next_data_list() -> list[str]:
    return [
        "Topographic survey, spot elevations, or contour lines",
        "Driveway, walkway, and existing hardscape measurements",
        "House footprint and finished floor elevation",
        "Major trees, utilities, septic, and easements",
        "Sun and shade observations across the day",
    ]


def create_site_assessment(parcel_path: str | Path, image_path: str | Path | None = None) -> SiteAssessment:
    parcel = analyze_parcel(parcel_path)
    image = load_image_summary(image_path) if image_path else None
    concept_zones = build_concept_zones(parcel)
    return SiteAssessment(
        parcel=parcel,
        image=image,
        assumptions=build_assumptions(parcel, image),
        concept_zones=concept_zones,
        landscape_features=build_landscape_features(parcel, concept_zones),
        recommendations=build_recommendations(parcel, image),
        next_data_to_collect=build_next_data_list(),
    )


def render_markdown_report(assessment: SiteAssessment) -> str:
    parcel = assessment.parcel
    metrics = parcel.metrics

    lines = [
        "# Site Assessment",
        "",
        "## Inputs",
        f"- Parcel: `{parcel.source_path}`",
        f"- Geometry type: `{parcel.geometry_type}`",
    ]

    if assessment.image is not None:
        lines.extend(
            [
                f"- Satellite image: `{assessment.image.source_path}`",
                f"- Image size: `{assessment.image.width_px} x {assessment.image.height_px}` px",
                f"- Image mode: `{assessment.image.mode}`",
                f"- Image format: `{assessment.image.format}`",
            ]
        )
    else:
        lines.append("- Satellite image: not provided")

    lines.extend(
        [
            "",
            "## Parcel Metrics",
            f"- Coordinate system handling: `{metrics.coordinate_system}`",
            f"- Area: `{metrics.area:.3f}` {metrics.area_unit}",
            f"- Perimeter: `{metrics.perimeter:.3f}` {metrics.linear_unit}",
            f"- Bounding width: `{metrics.width:.3f}` {metrics.linear_unit}",
            f"- Bounding height: `{metrics.height:.3f}` {metrics.linear_unit}",
            f"- Aspect ratio: `{metrics.aspect_ratio:.3f}`",
            f"- Irregularity index: `{metrics.irregularity_index:.3f}`",
            f"- Vertex count: `{metrics.vertex_count}`",
            f"- Centroid: `({metrics.centroid_x:.3f}, {metrics.centroid_y:.3f})` {metrics.linear_unit}",
            "",
            "## Parcel Properties",
        ]
    )

    if parcel.properties:
        acreage = parcel.properties.get("ACREAGE")
        if acreage:
            lines.append(f"- Reported acreage: `{acreage}` acres")
            try:
                acreage_value = float(str(acreage))
                lines.append(f"- Reported area: `{acreage_value * 43560:.1f}` square feet")
            except ValueError:
                pass
        for key, value in sorted(parcel.properties.items()):
            lines.append(f"- `{key}`: `{value}`")
    else:
        lines.append("- No properties found in the parcel feature")

    lines.extend(
        [
            "",
            "## Design Assumptions",
        ]
    )
    lines.extend([f"- {item}" for item in assessment.assumptions])

    lines.extend(
        [
            "",
            "## Concept Zoning Plan",
        ]
    )
    for zone in assessment.concept_zones:
        lines.extend(
            [
                f"### {zone.name}",
                f"- Intent: {zone.intent}",
                f"- Siting: {zone.siting}",
                f"- Target share: `{zone.target_share_percent}%` of the site",
            ]
        )
        lines.extend([f"- Move: {item}" for item in zone.moves])
        lines.append("")

    lines.extend(
        [
            "",
            "## Landscape Feature Program",
        ]
    )
    for feature in assessment.landscape_features:
        lines.extend(
            [
                f"### {feature.name}",
                f"- Ontology class: `{feature.ontology_class}`",
                f"- Concept zone: {feature.zone_name}",
                f"- Priority: `{feature.priority}`",
                f"- Summary: {feature.summary}",
                f"- Placement: {feature.placement}",
                f"- Rationale: {feature.rationale}",
            ]
        )
        if feature.target_share_percent is not None:
            lines.append(f"- Related zone share: `{feature.target_share_percent}%`")
        lines.extend([f"- Move: {item}" for item in feature.design_moves])
        lines.append("")

    lines.extend(
        [
            "",
            "## Landscape Recommendations",
        ]
    )
    lines.extend([f"- {item}" for item in assessment.recommendations])

    lines.extend(
        [
            "",
            "## Next Data To Collect",
        ]
    )
    lines.extend([f"- {item}" for item in assessment.next_data_to_collect])
    lines.append("")
    return "\n".join(lines)


def write_markdown_report(output_path: str | Path, content: str) -> Path:
    path = Path(output_path).expanduser().resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return path
