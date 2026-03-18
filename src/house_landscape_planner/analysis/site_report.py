from __future__ import annotations

from pathlib import Path

from house_landscape_planner.analysis.parcel import analyze_parcel
from house_landscape_planner.io.image_loader import load_image_summary
from house_landscape_planner.models import ImageSummary, ParcelSummary, SiteAssessment


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
    return SiteAssessment(
        parcel=parcel,
        image=image,
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
            f"- Area: `{metrics.area:.3f}` square coordinate units",
            f"- Perimeter: `{metrics.perimeter:.3f}` coordinate units",
            f"- Bounding width: `{metrics.width:.3f}`",
            f"- Bounding height: `{metrics.height:.3f}`",
            f"- Aspect ratio: `{metrics.aspect_ratio:.3f}`",
            f"- Irregularity index: `{metrics.irregularity_index:.3f}`",
            f"- Vertex count: `{metrics.vertex_count}`",
            f"- Centroid: `({metrics.centroid_x:.3f}, {metrics.centroid_y:.3f})`",
            "",
            "## Parcel Properties",
        ]
    )

    if parcel.properties:
        for key, value in sorted(parcel.properties.items()):
            lines.append(f"- `{key}`: `{value}`")
    else:
        lines.append("- No properties found in the parcel feature")

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
