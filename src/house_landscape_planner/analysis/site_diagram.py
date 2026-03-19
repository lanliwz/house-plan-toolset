from __future__ import annotations

from pathlib import Path

from house_landscape_planner.analysis.site_report import create_site_assessment
from house_landscape_planner.models import SiteAssessment


SVG_WIDTH = 1200
SVG_HEIGHT = 900
MARGIN = 90


def create_site_diagram(parcel_path: str | Path, image_path: str | Path | None = None) -> str:
    assessment = create_site_assessment(parcel_path, image_path)
    return render_site_diagram_svg(assessment)


def render_site_diagram_svg(assessment: SiteAssessment) -> str:
    points = assessment.parcel.boundary_points
    xs = [point[0] for point in points[:-1]]
    ys = [point[1] for point in points[:-1]]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    width = max(max_x - min_x, 1.0)
    height = max(max_y - min_y, 1.0)
    scale = min((SVG_WIDTH - (2 * MARGIN)) / width, (SVG_HEIGHT - (2 * MARGIN)) / height)

    def to_canvas(point: tuple[float, float]) -> tuple[float, float]:
        x, y = point
        return (
            MARGIN + ((x - min_x) * scale),
            SVG_HEIGHT - MARGIN - ((y - min_y) * scale),
        )

    canvas_points = [to_canvas(point) for point in points[:-1]]
    polygon_points = " ".join(f"{x:.1f},{y:.1f}" for x, y in canvas_points)

    left = min(x for x, _ in canvas_points)
    right = max(x for x, _ in canvas_points)
    top = min(y for _, y in canvas_points)
    bottom = max(y for _, y in canvas_points)
    box_width = right - left
    box_height = bottom - top

    title = assessment.parcel.properties.get("FULLADDRESS", "Site Concept")
    acreage = assessment.parcel.properties.get("ACREAGE", "")

    frontage = [
        (left + 0.08 * box_width, top + 0.05 * box_height),
        (left + 0.92 * box_width, top + 0.05 * box_height),
        (left + 0.86 * box_width, top + 0.20 * box_height),
        (left + 0.14 * box_width, top + 0.20 * box_height),
    ]
    terrace = [
        (left + 0.33 * box_width, top + 0.34 * box_height),
        (left + 0.72 * box_width, top + 0.39 * box_height),
        (left + 0.65 * box_width, top + 0.63 * box_height),
        (left + 0.30 * box_width, top + 0.57 * box_height),
    ]
    stormwater = [
        (left + 0.10 * box_width, top + 0.70 * box_height),
        (left + 0.88 * box_width, top + 0.78 * box_height),
        (left + 0.80 * box_width, top + 0.93 * box_height),
        (left + 0.18 * box_width, top + 0.90 * box_height),
    ]
    spine = [
        (left + 0.48 * box_width, top + 0.18 * box_height),
        (left + 0.44 * box_width, top + 0.34 * box_height),
        (left + 0.52 * box_width, top + 0.50 * box_height),
        (left + 0.47 * box_width, top + 0.72 * box_height),
    ]

    zone_polygons = [
        ("Arrival + Frontage", frontage, "#f4b942", "#8a5b00"),
        ("Outdoor Living Terrace", terrace, "#84c98c", "#2f6f3a"),
        ("Stormwater Buffer", stormwater, "#78b7d9", "#1f5776"),
    ]

    labels = [
        ("Arrival + Frontage", left + 0.50 * box_width, top + 0.14 * box_height),
        ("Primary Circulation Spine", left + 0.61 * box_width, top + 0.50 * box_height),
        ("Private Outdoor Living", left + 0.54 * box_width, top + 0.49 * box_height),
        ("Perimeter Planting + Privacy Belt", left + 0.53 * box_width, top + 0.86 * box_height),
        ("Stormwater + Hillside Buffer", left + 0.50 * box_width, top + 0.82 * box_height),
    ]

    zone_svg = []
    for name, shape, fill, stroke in zone_polygons:
        shape_points = " ".join(f"{x:.1f},{y:.1f}" for x, y in shape)
        zone_svg.append(
            f'<polygon points="{shape_points}" fill="{fill}" fill-opacity="0.42" stroke="{stroke}" stroke-width="3" />'
        )

    spine_points = " ".join(f"{x:.1f},{y:.1f}" for x, y in spine)
    perimeter_inset = (
        f"M {left + 22:.1f},{top + 22:.1f} "
        f"L {right - 20:.1f},{top + 28:.1f} "
        f"L {right - 32:.1f},{bottom - 28:.1f} "
        f"L {left + 28:.1f},{bottom - 22:.1f} Z"
    )

    label_svg = []
    for text, x, y in labels:
        label_svg.append(
            f'<text x="{x:.1f}" y="{y:.1f}" text-anchor="middle" font-size="24" font-weight="700" fill="#17324d">{text}</text>'
        )

    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{SVG_WIDTH}" height="{SVG_HEIGHT}" viewBox="0 0 {SVG_WIDTH} {SVG_HEIGHT}">
  <rect width="100%" height="100%" fill="#f6f1e8" />
  <rect x="36" y="36" width="{SVG_WIDTH - 72}" height="{SVG_HEIGHT - 72}" rx="28" fill="#fffaf2" stroke="#d8cdbd" stroke-width="2" />
  <text x="{MARGIN}" y="78" font-size="34" font-weight="700" fill="#2e3d2f">House Plan Toolset</text>
  <text x="{MARGIN}" y="114" font-size="26" font-weight="700" fill="#2e3d2f">Landscape Concept Diagram: {title}</text>
  <text x="{MARGIN}" y="146" font-size="18" fill="#5f655d">Parcel area: {assessment.parcel.metrics.area:.0f} sq ft | Recorded acreage: {acreage} | Conceptual zoning only</text>

  <defs>
    <clipPath id="parcel-clip">
      <polygon points="{polygon_points}" />
    </clipPath>
  </defs>

  <polygon points="{polygon_points}" fill="#e6ecdf" stroke="#324d35" stroke-width="5" />
  <path d="{perimeter_inset}" fill="none" stroke="#47694a" stroke-width="10" stroke-opacity="0.18" clip-path="url(#parcel-clip)" />
  {''.join(zone_svg)}
  <polyline points="{spine_points}" fill="none" stroke="#b54d32" stroke-width="18" stroke-linecap="round" stroke-linejoin="round" clip-path="url(#parcel-clip)" />
  <polyline points="{spine_points}" fill="none" stroke="#f7d8c1" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" clip-path="url(#parcel-clip)" />
  {''.join(label_svg)}

  <g transform="translate(820,170)">
    <rect x="0" y="0" width="280" height="232" rx="20" fill="#fff" stroke="#d8cdbd" stroke-width="2" />
    <text x="24" y="34" font-size="22" font-weight="700" fill="#2e3d2f">Legend</text>
    <rect x="24" y="54" width="26" height="18" fill="#f4b942" fill-opacity="0.42" stroke="#8a5b00" stroke-width="2" />
    <text x="64" y="69" font-size="16" fill="#334">Arrival / frontage</text>
    <rect x="24" y="88" width="26" height="18" fill="#84c98c" fill-opacity="0.42" stroke="#2f6f3a" stroke-width="2" />
    <text x="64" y="103" font-size="16" fill="#334">Outdoor living zone</text>
    <rect x="24" y="122" width="26" height="18" fill="#78b7d9" fill-opacity="0.42" stroke="#1f5776" stroke-width="2" />
    <text x="64" y="137" font-size="16" fill="#334">Stormwater buffer</text>
    <line x1="24" y1="170" x2="50" y2="170" stroke="#b54d32" stroke-width="8" stroke-linecap="round" />
    <text x="64" y="175" font-size="16" fill="#334">Circulation spine</text>
    <line x1="24" y1="204" x2="50" y2="204" stroke="#47694a" stroke-width="8" stroke-opacity="0.25" />
    <text x="64" y="209" font-size="16" fill="#334">Perimeter planting belt</text>
  </g>

  <text x="{MARGIN}" y="{SVG_HEIGHT - 42}" font-size="16" fill="#5f655d">Assumed street/frontage orientation is conceptual and should be verified against survey, driveway location, and on-site grade.</text>
</svg>"""


def write_svg(output_path: str | Path, content: str) -> Path:
    path = Path(output_path).expanduser().resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return path
