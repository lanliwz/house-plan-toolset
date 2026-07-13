# House Plan Toolset

Python project for property planning around a single home, starting with parcel review, house-footprint modeling, and early site-design workflows.

Repository name: `house-plan-toolset`

## Current Scope

The project currently focuses on:

- parcel geometry analysis from GeoJSON
- Neo4j-backed parcel browsing and review
- editable house-footprint modeling inside the parcel
- starter room and utility-connection modeling derived from the house footprint
- ontology-backed interior design planning for room schemes, finishes, furnishings, lighting, budgets, and procurement
- Suffolk contour-based parcel elevation summaries
- ontology-backed landscape feature planning for hillside and irregular lots
- a browser-based three-panel property navigator for parcel, house, room, utility, edge, vertex, and design-feature objects

This is an early property-planning foundation, not yet a full construction-management or maintenance platform.

## Project Layout

- `src/house_landscape_planner/`
  - core package, analysis logic, Neo4j loaders, and web app
- `data/input/`
  - parcel and house-footprint GeoJSON inputs
- `data/output/`
  - generated planning reports
- `resource/ontology/`
  - landscape and house ontology source files plus Cypher companions
- `tests/`
  - web, loader, and geometry regression coverage

## Web UI

The project includes a FastAPI-based web UI inspired by `neo4j-onto2ai-toolset`.
It defaults to reading parcel data from the Neo4j `hp62n` database and also supports loading a local parcel GeoJSON file directly in the browser.

Start it with:

```bash
uv sync
uv run house-landscape serve --host 127.0.0.1 --port 8181
```

Then open `http://127.0.0.1:8181`.

The web app lets you:

- browse parcels from Neo4j database `hp62n`
- load a selected local parcel GeoJSON file with the `Load` action
- inspect parcel, house, room, utility, edge, vertex, and landscape-feature objects
- review parcel metrics, assumptions, recommendations, and source parcel properties
- edit and save house footprints and landscape features back to Neo4j
- preview and download the generated markdown report

Loader documentation:

- [README4LOADER.md](/Users/weizhang/github/house-plan-toolset/README4LOADER.md)

## Quick Start

1. Sync the project environment with `uv`.
2. Load a parcel into Neo4j.
3. Optionally attach a house footprint to the parcel.
4. Optionally load parcel elevation from Suffolk County contours.
5. Start the web UI.

```bash
uv sync
uv run house-landscape load-neo4j --parcel data/input/parcel_62n.geojson --database hp62n
uv run house-landscape load-house-footprint --parcel-id 0200154000400039003 --house data/input/house_footprint.geojson --database hp62n
uv run house-landscape load-elevation --parcel-id 0200154000400039003 --database hp62n
uv run house-landscape serve --host 127.0.0.1 --port 8181
```

## Development

Common commands:

```bash
uv sync
uv run python -m pytest
uv run house-landscape load-neo4j --parcel data/input/parcel_62n.geojson --database hp62n
uv run house-landscape load-house-footprint --parcel-id 0200154000400039003 --house data/input/house_footprint.geojson --database hp62n
uv run house-landscape load-elevation --parcel-id 0200154000400039003 --database hp62n
uv run house-landscape serve --host 127.0.0.1 --port 8181
```

## Expected Inputs

### Parcel GeoJSON

- `FeatureCollection`, `Feature`, `Polygon`, and `MultiPolygon` are supported
- the first polygon ring is used as the parcel boundary
- scalar parcel properties are preserved in the report and Neo4j parcel node

### House Footprint GeoJSON

- exactly one `Feature`, `Polygon`, or `MultiPolygon` footprint is expected
- the first polygon ring is used as the editable house footprint
- loading a footprint into Neo4j also generates starter `Room` and `UtilityConnection` graph objects

## Current Analysis

The generated report currently includes:

- parcel area, perimeter, bounding box, centroid, and irregularity score
- stored Suffolk contour-based elevation range and estimated relief when loaded
- ontology-backed landscape features mapped to concept zones such as arrival gardens, circulation paths, terraces, bioswales, and privacy planting
- a starter house-program section when a house footprint is available
- a simple steep-site planning checklist tailored to hillside residential landscaping
- suggested next data to collect for more accurate property planning

## Ontologies

Landscape ontology artifacts:

- [Landscape.rdf](/Users/weizhang/github/house-plan-toolset/resource/ontology/www_onto2ai-toolset_com/ontology/landscape/Landscape.rdf)
- [Landscape.cypher](/Users/weizhang/github/house-plan-toolset/resource/ontology/www_onto2ai-toolset_com/ontology/landscape/Landscape.cypher)

House ontology artifacts:

- [House.rdf](/Users/weizhang/github/house-plan-toolset/resource/ontology/www_onto2ai-toolset_com/ontology/house/House.rdf)
- [House.cypher](/Users/weizhang/github/house-plan-toolset/resource/ontology/www_onto2ai-toolset_com/ontology/house/House.cypher)

Interior design ontology artifacts:

- [InteriorDesign.rdf](/Users/weizhang/github/house-plan-toolset/resource/ontology/www_onto2ai-toolset_com/ontology/interior-design/InteriorDesign.rdf)
- [InteriorDesign.cypher](/Users/weizhang/github/house-plan-toolset/resource/ontology/www_onto2ai-toolset_com/ontology/interior-design/InteriorDesign.cypher)

## Neo4j Notes

- The Neo4j-first workflow expects parcel data loaded into `hp62n`.
- Saved house footprints are persisted both as legacy parcel JSON properties and as graph-native `House` and `BuildingFootprint` nodes.
- Each persisted house footprint generates starter `Room` and `UtilityConnection` nodes linked to the house.
- `load-elevation` and `POST /api/neo4j/parcels/{parcel_id}/elevation` fetch intersecting Suffolk 5-foot and 10-foot contours, then store the parcel elevation summary on the parcel node.
- Saved landscape features are mirrored into graph-native `LandscapePlan` and `LandscapeFeature` nodes.
- `load-house-footprint` and `POST /api/neo4j/parcels/{parcel_id}/house-footprint` both attach a house footprint to an existing parcel.

## Notes

- Browser file loading analyzes the selected parcel without writing to Neo4j.
- The current room and utility generation is intentionally simple and serves as a graph foundation for richer interior, build, and maintenance planning.
- The project is still an early foundation that we can extend into richer house, circulation, utility, and maintenance workflows.
