# House Plan Toolset Loader and Persistence Guide

This guide covers parcel loading, house-footprint enrichment, Neo4j graph materialization, and persistence of floor-plan and interior-design edits. For the application overview, see the [main README](README.md).

## Overview

The loader combines the Onto2AI parcel package with the local House, Landscape, and Interior Design ontologies. It:

- imports parcel models from `onto2ai_parcel.staging.pydantic_parcel_model`
- accepts GeoJSON `FeatureCollection`, `Feature`, `Polygon`, and `MultiPolygon` inputs
- creates graph-native parcel geometry, boundary vertices, addresses, house footprints, rooms, utilities, and landscape features
- applies packaged parcel constraints and local house constraints
- serializes editable room geometry and interior components into Neo4j
- hydrates the web editor from the saved graph
- defaults to Neo4j database `hp62n`

## Relevant Files

- [Loader implementation](src/house_landscape_planner/loaders/neo4j_parcel_loader.py)
- [CLI entrypoint](src/house_landscape_planner/cli.py)
- [Web API](src/house_landscape_planner/webapp/main.py)
- [Web request/response models](src/house_landscape_planner/webapp/api.py)
- [Web client](src/house_landscape_planner/webapp/static/js/app.js)

Place local GeoJSON inputs under `data/input/` or pass any readable filesystem path to the CLI.

## Environment and Installation

```bash
export NEO4J_MODEL_DB_URL="bolt://localhost:7687"
export NEO4J_MODEL_DB_USERNAME="neo4j"
export NEO4J_MODEL_DB_PASSWORD="your_password"

uv sync
```

The project uses the local editable Onto2AI dependency configured in `pyproject.toml`:

```toml
[tool.uv.sources]
onto2ai-engineer = { path = "../neo4j-onto2ai-toolset", editable = true }
```

## Load a Parcel

```bash
uv run house-landscape load-neo4j \
  --parcel /path/to/parcel.geojson \
  --database hp62n
```

Typical result:

```json
{
  "database": "hp62n",
  "feature_count": 1,
  "parcel_count": 1,
  "vertex_count": 8
}
```

Useful options:

- `--state NY` sets the fallback postal subdivision.
- `--skip-create-db` requires the target database to exist already.
- `--skip-constraints` skips parcel constraint application.

## Attach a House Footprint

Load local GeoJSON:

```bash
uv run house-landscape load-house-footprint \
  --parcel-id 0200154000400039003 \
  --house /path/to/house-footprint.geojson \
  --database hp62n
```

Or load the primary footprint intersecting the parcel from Suffolk GIS:

```bash
uv run house-landscape load-house-footprint-gis \
  --parcel-id 0200154000400039003 \
  --database hp62n
```

Attaching a footprint creates or refreshes the editable `House`, `BuildingFootprint`, `Room`, and `UtilityConnection` graph foundation. Floor levels are represented by persisted room level and layout properties and rendered as basement, first-floor, and second-floor views in the browser.

## Load Parcel Elevation

```bash
uv run house-landscape load-elevation \
  --parcel-id 0200154000400039003 \
  --database hp62n
```

This intersects the parcel with Suffolk 5-foot and 10-foot contours, stores the elevation summary on the parcel, and makes the contour data available to the UI and generated report.

## Web Editor Persistence

Start the UI:

```bash
uv run house-landscape serve --host 127.0.0.1 --port 8181
```

When a parcel is loaded from Neo4j, the Save action sends one coordinated payload to:

```text
POST /api/neo4j/parcels/{parcel_id}/features?database=hp62n
```

The payload includes:

- landscape features
- house-footprint points
- rooms and floor placement
- room name, type, size, and stair direction
- wall, door, and window layouts
- interior design overrides and component layouts

Room editor state is stored on each `Room` node:

| Neo4j property | Content |
| --- | --- |
| `wallLayoutJson` | Wall edge, span, and thickness |
| `doorLayoutJson` | Door host edge and span |
| `windowLayoutJson` | Window host edge and span |
| `interiorDesignLayoutJson` | Room scheme overrides and component type, position, size, and direction |

`serialize_room_summary`, `sync_rooms`, and `hydrate_room_summary` maintain the round trip between the web payload and these persisted fields.

Browser-only parcel uploads use `POST /api/analyze` and do not write to Neo4j.

## Web API

| Method | Route | Loader role |
| --- | --- | --- |
| `GET` | `/api/neo4j/parcels` | List available parcels |
| `GET` | `/api/neo4j/parcels/{parcel_id}` | Hydrate parcel, house, rooms, and saved design |
| `POST` | `/api/neo4j/parcels/{parcel_id}/features` | Persist the coordinated design payload |
| `DELETE` | `/api/neo4j/parcels/{parcel_id}/features/{feature_id}` | Delete a landscape feature |
| `POST` | `/api/neo4j/parcels/{parcel_id}/house-footprint` | Load uploaded house GeoJSON |
| `POST` | `/api/neo4j/parcels/{parcel_id}/house-footprint/gis` | Load the Suffolk GIS footprint |
| `POST` | `/api/neo4j/parcels/{parcel_id}/elevation` | Refresh Suffolk contour data |

## Core Graph Shape

Parcel dataset nodes include:

- `(:GeoJSONFeatureCollection:Resource)`
- `(:GeoJSONFeature:Resource)`
- `(:Parcel:Resource)`
- `(:PolygonGeometry:Geometry:Resource)`
- `(:BoundaryVertex:GPSCoordinate:Resource)`
- `(:USPostalAddress:Address:Resource)` when address fields are present
- `(:Country:Resource)` and `(:CountrySubdivision:Resource)` for address references

House and design nodes include:

- `(:House)`
- `(:BuildingFootprint)`
- `(:Room)`
- `(:UtilityConnection)`
- `(:LandscapePlan)` and `(:LandscapeFeature)`

Key materialized relationships include:

- `(:GeoJSONFeatureCollection)-[:hasFeature]->(:GeoJSONFeature)`
- `(:GeoJSONFeature)-[:representsParcel]->(:Parcel)`
- `(:Parcel)-[:hasParcelGeometry]->(:PolygonGeometry)`
- `(:PolygonGeometry)-[:hasBoundaryVertex]->(:BoundaryVertex)`
- `(:Parcel)-[:hasParcelAddress]->(:USPostalAddress)`
- `(:USPostalAddress)-[:hasCountry]->(:Country)`
- `(:USPostalAddress)-[:hasSubdivision]->(:CountrySubdivision)`
- `(:Parcel)-[:HAS_HOUSE]->(:House)`
- `(:House)-[:HAS_BUILDING_FOOTPRINT]->(:BuildingFootprint)`
- `(:House)-[:HAS_ROOM]->(:Room)`
- `(:House)-[:HAS_UTILITY_CONNECTION]->(:UtilityConnection)`
- `(:Parcel)-[:HAS_LANDSCAPE_PLAN]->(:LandscapePlan)`
- `(:LandscapePlan)-[:hasLandscapeFeature]->(:LandscapeFeature)`

The loader also stores ontology URI and label metadata on materialized graph elements.

## Source Property Handling

Scalar GeoJSON properties such as `OBJECTID`, `PARCELID`, `FULLADDRESS`, `ACREAGE`, `LANDUSE`, and `STATUS` are preserved on the `Parcel` node. Nested and other non-scalar values are not copied as direct Neo4j properties.

Address creation uses the Onto2AI model fields `hasCountry` and `hasSubdivision`, then materializes the referenced `Country` and `CountrySubdivision` resources.

## Ontology and Constraint Alignment

The loader applies or depends on:

- packaged Onto2AI parcel constraints
- [House.rdf](resource/ontology/www_onto2ai-toolset_com/ontology/house/House.rdf) and [House.cypher](resource/ontology/www_onto2ai-toolset_com/ontology/house/House.cypher)
- [InteriorDesign.rdf](resource/ontology/www_onto2ai-toolset_com/ontology/interior-design/InteriorDesign.rdf) and [InteriorDesign.cypher](resource/ontology/www_onto2ai-toolset_com/ontology/interior-design/InteriorDesign.cypher)
- [Landscape.rdf](resource/ontology/www_onto2ai-toolset_com/ontology/landscape/Landscape.rdf) and [Landscape.cypher](resource/ontology/www_onto2ai-toolset_com/ontology/landscape/Landscape.cypher)

RDF remains the source of truth. Validate RDF syntax after ontology changes and keep the Cypher companion aligned with the RDF URI base, fragments, and semantics.

## Validation

```bash
uv run pytest -q
xmllint --noout resource/ontology/www_onto2ai-toolset_com/ontology/house/House.rdf
xmllint --noout resource/ontology/www_onto2ai-toolset_com/ontology/interior-design/InteriorDesign.rdf
```

Loader coverage includes parcel-model construction, postal-address materialization, house-footprint loading, room-layout round trips, interior-design persistence, API serialization, and web UI regressions.
