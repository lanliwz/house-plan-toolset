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

## Quick Start

1. Create a virtual environment.
2. Install the project in editable mode.
3. Put your files into `data/input/`.
4. Run the analyzer.

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e .
house-landscape analyze \
  --parcel data/input/parcel.geojson \
  --image data/input/site_satellite.jpg \
  --output data/output/site_report.md
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
