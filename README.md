# House Plan Toolset

Python project for planning landscaping around a single home on an irregular hillside parcel.

Repository name: `house-plan-toolset`

The repo is set up to work from:

- a parcel boundary GeoJSON file
- a satellite image of the house and yard

It gives you a practical starting point for:

- parcel geometry analysis
- irregular-lot constraints review
- hillside-specific landscape recommendations
- a browser-based parcel review workflow
- a repeatable site intake workflow for later expansion into grading, drainage, planting, access, and retaining-wall design

## Project Layout

- `src/house_landscape_planner/`
  - core package
- `data/input/`
  - place your parcel GeoJSON and satellite image here
- `data/output/`
  - generated planning reports
- `tests/`
  - lightweight geometry tests

## Web UI

The project now includes a FastAPI-based web UI inspired by the structure used in `neo4j-onto2ai-toolset`.

Start it with:

```bash
uv sync
uv run house-landscape serve --host 127.0.0.1 --port 8181
```

Then open `http://127.0.0.1:8181`.

The web app lets you:

- upload parcel GeoJSON and an optional satellite image
- review parcel metrics, assumptions, and recommendations
- inspect the generated concept zoning SVG
- preview and download the markdown report

## Quick Start

1. Sync the project environment with `uv`.
2. Put your files into `data/input/`.
3. Run the analyzer.

```bash
uv sync
uv run house-landscape analyze \
  --parcel data/input/parcel.geojson \
  --image data/input/site_satellite.jpg \
  --output data/output/site_report.md
```

## Development

Common commands:

```bash
uv sync
uv run pytest
uv run house-landscape serve --host 127.0.0.1 --port 8181
```

## Expected Inputs

### Parcel GeoJSON

- `FeatureCollection`, `Feature`, `Polygon`, and `MultiPolygon` are supported
- the first polygon ring is used as the parcel boundary
- parcel properties are preserved in the report

### Satellite Image

- any image that Pillow can read, such as `.jpg`, `.jpeg`, `.png`, `.tif`, or `.tiff`

## Current Analysis

The generated report currently includes:

- parcel area, perimeter, bounding box, and centroid
- an irregularity score based on shape compactness
- a simple steep-site planning checklist tailored to hillside residential landscaping
- image metadata summary
- suggested next data to collect for more accurate hillside design

## Notes

- Satellite imagery alone cannot reliably calculate slope. For real grading and retaining-wall decisions, add topographic contours, survey points, or DEM/LiDAR data in a later phase.
- This starter repo is intentionally lightweight so we can extend it around your actual parcel and image once those files are in place.
