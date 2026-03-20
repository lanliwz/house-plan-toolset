# House Plan Toolset Loader

This document describes how to load parcel GeoJSON into Neo4j using the Onto2AI parcel ontology package, its Pydantic parcel model, and the dataset-oriented Neo4j graph shape.

## Overview

The loader in this project:

- uses `onto2ai-engineer` as a local dependency
- imports parcel classes from `onto2ai_parcel.staging.pydantic_parcel_model`
- builds:
  - `Parcel`
  - `PolygonGeometry`
  - `BoundaryVertex`
  - `GeoJSONFeature`
  - `GeoJSONFeatureCollection`
- applies the packaged parcel Neo4j constraints
- loads dataset nodes and materialized relationships into a Neo4j database

Default target database:

- `hp62n`

## Files

- Loader implementation:
  [src/house_landscape_planner/loaders/neo4j_parcel_loader.py](/Users/weizhang/github/house-plan-toolset/src/house_landscape_planner/loaders/neo4j_parcel_loader.py)
- CLI entrypoint:
  [src/house_landscape_planner/cli.py](/Users/weizhang/github/house-plan-toolset/src/house_landscape_planner/cli.py)
- Example parcel input:
  [data/input/parcel_62n.geojson](/Users/weizhang/github/house-plan-toolset/data/input/parcel_62n.geojson)

## Environment

The loader uses the standard Onto2AI Neo4j connection variables:

```bash
export NEO4J_MODEL_DB_URL="bolt://localhost:7687"
export NEO4J_MODEL_DB_USERNAME="neo4j"
export NEO4J_MODEL_DB_PASSWORD="your_password"
```

The target dataset database is passed by CLI argument. For this project we use:

```bash
--database hp62n
```

## Install

Sync the project environment with `uv`:

```bash
uv sync
```

This project expects the local editable Onto2AI package source configured in `pyproject.toml`:

```toml
[tool.uv.sources]
onto2ai-engineer = { path = "../neo4j-onto2ai-toolset", editable = true }
```

## Load Command

Load the bundled parcel file into `hp62n`:

```bash
uv run house-landscape load-neo4j \
  --parcel data/input/parcel_62n.geojson \
  --database hp62n
```

Example result:

```json
{
  "database": "hp62n",
  "feature_count": 1,
  "parcel_count": 1,
  "vertex_count": 8
}
```

## Optional Flags

Skip database creation:

```bash
uv run house-landscape load-neo4j \
  --parcel data/input/parcel_62n.geojson \
  --database hp62n \
  --skip-create-db
```

Skip applying parcel constraints:

```bash
uv run house-landscape load-neo4j \
  --parcel data/input/parcel_62n.geojson \
  --database hp62n \
  --skip-constraints
```

Use a different default state code for generated postal address nodes:

```bash
uv run house-landscape load-neo4j \
  --parcel data/input/parcel_62n.geojson \
  --database hp62n \
  --state NY
```

## Graph Shape

The loader writes dataset nodes aligned with the Onto2AI parcel package smoke-test pattern:

- `(:GeoJSONFeatureCollection:Resource)`
- `(:GeoJSONFeature:Resource)`
- `(:Parcel:Resource)`
- `(:PolygonGeometry:Geometry:Resource)`
- `(:BoundaryVertex:GPSCoordinate:Resource)`
- `(:USPostalAddress:Address:Resource)` when address fields are present
- `(:Country:Resource)` and `(:CountrySubdivision:Resource)` for address references

Materialized relationships:

- `(:GeoJSONFeatureCollection)-[:hasFeature]->(:GeoJSONFeature)`
- `(:GeoJSONFeature)-[:representsParcel]->(:Parcel)`
- `(:Parcel)-[:hasParcelGeometry]->(:PolygonGeometry)`
- `(:PolygonGeometry)-[:hasBoundaryVertex]->(:BoundaryVertex)`
- `(:Parcel)-[:hasParcelAddress]->(:USPostalAddress)` when address exists
- `(:USPostalAddress)-[:hasCountry]->(:Country)`
- `(:USPostalAddress)-[:hasSubdivision]->(:CountrySubdivision)`

## Source Property Handling

The loader preserves scalar GeoJSON feature properties on the `Parcel` node in Neo4j. That includes fields like:

- `OBJECTID`
- `PARCELID`
- `FULLADDRESS`
- `ACREAGE`
- `LANDUSE`
- `STATUS`

Nested or non-scalar values are not copied as direct node properties.

## Validation

Run the project tests in the uv-managed environment:

```bash
uv run python -m pytest
```

Current loader coverage includes:

- parcel-model construction from GeoJSON
- address-node creation when parcel address fields are present
- web app and analysis regression coverage
