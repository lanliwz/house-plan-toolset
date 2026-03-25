# House Plan Toolset

Python project for planning landscaping around a single home on an irregular hillside parcel.

Repository name: `house-plan-toolset`

The repo is set up to work from:

- a parcel boundary GeoJSON file

It gives you a practical starting point for:

- parcel geometry analysis
- irregular-lot constraints review
- hillside-specific landscape recommendations
- ontology-backed landscape feature programming
- a Neo4j-backed browser parcel review workflow
- a repeatable site intake workflow for later expansion into grading, drainage, planting, access, and retaining-wall design

## Project Layout

- `src/house_landscape_planner/`
  - core package
- `data/input/`
  - place your parcel GeoJSON here
- `data/output/`
  - generated planning reports
- `tests/`
  - lightweight geometry tests

## Web UI

The project now includes a FastAPI-based web UI inspired by the structure used in `neo4j-onto2ai-toolset`.
It defaults to reading parcel data from the Neo4j `hp62n` database and also supports loading a local GeoJSON file from the browser.

Start it with:

```bash
uv sync
uv run house-landscape serve --host 127.0.0.1 --port 8181
```

Then open `http://127.0.0.1:8181`.

The web app lets you:

- browse parcels from Neo4j database `hp62n` by default
- load a selected local parcel GeoJSON file with the `Load` action
- review parcel metrics, assumptions, recommendations, and parcel properties
- inspect the interactive parcel detail view with parcel, edge, vertex, and landscape feature objects
- preview and download the generated markdown report

Loader documentation:

- [README4LOADER.md](/Users/weizhang/github/house-plan-toolset/README4LOADER.md)

## Quick Start

1. Sync the project environment with `uv`.
2. Put your files into `data/input/`.
3. Load the parcel into Neo4j.
4. Start the web UI.

```bash
uv sync
uv run house-landscape load-neo4j \
  --parcel data/input/parcel_62n.geojson \
  --database hp62n
uv run house-landscape serve --host 127.0.0.1 --port 8181
```

## Development

Common commands:

```bash
uv sync
uv run python -m pytest
uv run house-landscape load-neo4j --parcel data/input/parcel_62n.geojson --database hp62n
uv run house-landscape serve --host 127.0.0.1 --port 8181
```

## Expected Inputs

### Parcel GeoJSON

- `FeatureCollection`, `Feature`, `Polygon`, and `MultiPolygon` are supported
- the first polygon ring is used as the parcel boundary
- parcel properties are preserved in the report

## Current Analysis

The generated report currently includes:

- parcel area, perimeter, bounding box, and centroid
- an irregularity score based on shape compactness
- ontology-backed landscape features mapped to concept zones such as arrival gardens, circulation paths, terraces, bioswales, and privacy planting
- a simple steep-site planning checklist tailored to hillside residential landscaping
- suggested next data to collect for more accurate hillside design

## Landscape Ontology

The repository now includes a landscape ontology source file and matching Cypher companion artifact:

- [Landscape.rdf](/Users/weizhang/github/house-plan-toolset/resource/ontology/www_onto2ai-toolset_com/ontology/landscape/Landscape.rdf)
- [Landscape.cypher](/Users/weizhang/github/house-plan-toolset/resource/ontology/www_onto2ai-toolset_com/ontology/landscape/Landscape.cypher)

## Notes

- The Neo4j web flow expects parcel data loaded with the Onto2AI parcel-model loader into `hp62n`.
- If you use browser file loading instead of Neo4j, the UI will analyze the selected GeoJSON directly without writing to the database.
- This starter repo is intentionally lightweight so we can extend it around your actual parcel data once those files are in place.
