from __future__ import annotations

import argparse

from house_landscape_planner.analysis.site_report import (
    create_site_assessment,
    render_markdown_report,
    write_markdown_report,
)


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

    parser.print_help()
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
