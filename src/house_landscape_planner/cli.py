from __future__ import annotations

import argparse
import json

from house_landscape_planner.analysis.site_diagram import create_site_diagram, write_svg
from house_landscape_planner.analysis.site_report import (
    create_site_assessment,
    render_markdown_report,
    write_markdown_report,
)
from house_landscape_planner.loaders.neo4j_parcel_loader import load_geojson_into_neo4j
from house_landscape_planner.webapp.main import run_server


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Analyze a single-house parcel and generate a landscape planning report."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    analyze = subparsers.add_parser("analyze", help="Generate a site assessment report.")
    analyze.add_argument("--parcel", required=True, help="Path to parcel GeoJSON.")
    analyze.add_argument("--image", help="Path to satellite image.")
    analyze.add_argument(
        "--output",
        default="data/output/site_report.md",
        help="Path to output markdown report.",
    )

    illustrate = subparsers.add_parser("illustrate", help="Generate a concept zoning SVG diagram.")
    illustrate.add_argument("--parcel", required=True, help="Path to parcel GeoJSON.")
    illustrate.add_argument("--image", help="Path to satellite image.")
    illustrate.add_argument(
        "--output",
        default="data/output/site_concept.svg",
        help="Path to output SVG diagram.",
    )

    serve = subparsers.add_parser("serve", help="Start the web UI for parcel analysis.")
    serve.add_argument("--host", default="127.0.0.1", help="Host to bind to.")
    serve.add_argument("--port", type=int, default=8181, help="Port to bind to.")

    load_neo4j = subparsers.add_parser(
        "load-neo4j",
        help="Load parcel GeoJSON into a Neo4j parcel dataset database.",
    )
    load_neo4j.add_argument("--parcel", required=True, help="Path to parcel GeoJSON.")
    load_neo4j.add_argument("--database", default="hp62n", help="Target Neo4j database name.")
    load_neo4j.add_argument("--state", default="NY", help="Default US state code for address nodes.")
    load_neo4j.add_argument(
        "--skip-create-db",
        action="store_true",
        help="Do not create the target Neo4j database if it does not exist.",
    )
    load_neo4j.add_argument(
        "--skip-constraints",
        action="store_true",
        help="Do not apply Onto2AI parcel dataset constraints before loading.",
    )
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if args.command == "analyze":
        assessment = create_site_assessment(args.parcel, args.image)
        content = render_markdown_report(assessment)
        output_path = write_markdown_report(args.output, content)
        print(f"Wrote site assessment to {output_path}")
        return 0

    if args.command == "illustrate":
        content = create_site_diagram(args.parcel, args.image)
        output_path = write_svg(args.output, content)
        print(f"Wrote concept diagram to {output_path}")
        return 0

    if args.command == "serve":
        run_server(args.host, args.port)
        return 0

    if args.command == "load-neo4j":
        result = load_geojson_into_neo4j(
            args.parcel,
            database=args.database,
            default_state=args.state,
            ensure_database=not args.skip_create_db,
            apply_constraints=not args.skip_constraints,
        )
        print(json.dumps(result, indent=2, sort_keys=True))
        return 0

    parser.print_help()
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
