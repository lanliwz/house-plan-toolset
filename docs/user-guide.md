# House Plan Toolset User Guide

This guide explains how to obtain a parcel GeoJSON file, load it into House Plan Toolset, review the property, and edit house, floor-plan, landscape, and interior-design data.

## 1. Start the Application

Requirements:

- Python 3.12 or newer
- [`uv`](https://docs.astral.sh/uv/)
- Neo4j for loading and saving graph-backed projects
- the sibling `../neo4j-onto2ai-toolset` checkout configured by `pyproject.toml`

From the repository directory, run:

```bash
uv sync
uv run house-landscape serve --host 127.0.0.1 --port 8181
```

Open [http://127.0.0.1:8181](http://127.0.0.1:8181) in a web browser.

## 2. Download a Parcel JSON File

House Plan Toolset accepts `.json` and `.geojson` files containing GeoJSON. The file must contain parcel geometry as a `FeatureCollection`, `Feature`, `Polygon`, or `MultiPolygon`. A JSON file containing only tax or owner attributes is not sufficient.

### Suffolk County, New York

The official Suffolk County GIS service publishes parcels through its [Tax Parcels layer](https://gis.suffolkcountyny.gov/server/rest/services/Applications/GISViewer/MapServer/57). The layer uses the 19-character `PARCELID` field and supports GeoJSON output.

#### Find the parcel ID

1. Open the [Suffolk County GIS Viewer](https://gisapps.suffolkcountyny.gov/gisviewer/).
2. Search for the property address.
3. Select the parcel on the map.
4. Copy the parcel's `PARCELID`. Preserve leading zeroes. For example: `0200154000400039003`.

#### Download from the ArcGIS query page

1. Open the Tax Parcels layer's [Query page](https://gis.suffolkcountyny.gov/server/rest/services/Applications/GISViewer/MapServer/57/query).
2. Enter `PARCELID = 'your_19_character_parcel_id'` in **Where**. Keep the single quotation marks around the value.
3. Enter `*` in **Out Fields**.
4. Set **Return Geometry** to `True`.
5. Enter `4326` for **Output Spatial Reference**.
6. Choose `GeoJSON` as **Format**.
7. Select **Query (GET)**.
8. Save the response as `parcel.geojson`. If the browser displays the JSON instead of downloading it, use **Save Page As** and keep the `.geojson` extension.

The query should return exactly one parcel feature. If it returns no features, confirm the parcel ID and its leading zeroes.

#### Download from a terminal

Replace the example parcel ID, then run:

```bash
curl --get \
  'https://gis.suffolkcountyny.gov/server/rest/services/Applications/GISViewer/MapServer/57/query' \
  --data-urlencode "where=PARCELID='0200154000400039003'" \
  --data-urlencode 'outFields=*' \
  --data-urlencode 'returnGeometry=true' \
  --data-urlencode 'outSR=4326' \
  --data-urlencode 'f=geojson' \
  --output data/input/parcel.geojson
```

Check the downloaded file before loading it:

```bash
jq '{type, feature_count: (.features | length), geometry: .features[0].geometry.type, parcel_id: .features[0].properties.PARCELID}' \
  data/input/parcel.geojson
```

Expected values include:

- `type`: `FeatureCollection`
- `feature_count`: `1`
- `geometry`: `Polygon` or `MultiPolygon`
- `parcel_id`: the requested parcel ID

For another jurisdiction, export the parcel boundary from its GIS portal as GeoJSON in longitude/latitude coordinates. Keep the parcel identifier and address in the feature's `properties` object when possible.

## 3. Load a Parcel

### Temporary browser analysis

Use this workflow to review a local file without writing to Neo4j:

1. In **Parcel GeoJSON**, choose the `.geojson` or `.json` file.
2. Select **Load**.
3. Wait for the status bar to confirm that parcel analysis completed.
4. Use **Clear** to remove the loaded parcel and reset the view.

Browser-only parcel analysis is read-only. The **Save** action is available only after loading a parcel from Neo4j.

### Persistent Neo4j project

Configure Neo4j, then import the file:

```bash
export NEO4J_MODEL_DB_URL="bolt://localhost:7687"
export NEO4J_MODEL_DB_USERNAME="neo4j"
export NEO4J_MODEL_DB_PASSWORD="your_password"

uv run house-landscape load-neo4j \
  --parcel data/input/parcel.geojson \
  --database hp62n
```

In the application:

1. Enter the database name, such as `hp62n`.
2. Select the parcel from **Neo4j parcel**.
3. Select **Load from Neo4j**.
4. Select **Save** after making changes.

## 4. Navigate the Workspace

The application uses three main panels:

- **Catalog:** Select parcels, contours, boundary edges and vertices, houses, floor plans, rooms, interior designs, utilities, and landscape features.
- **Viewport:** Switch among Parcel, Garden, Patio, Interior Design, Basement, First Floor, and Second Floor views.
- **Properties:** Inspect and edit the selected object's available values.

Use the zoom controls at the lower-right of the viewport. Zooming applies to parcel, floor-plan, and interior-design diagrams.

## 5. Edit the House and Floor Plans

1. Load a Neo4j parcel.
2. Select **Load GIS House** to retrieve the primary Suffolk County building footprint, or use the loader command described in [README4LOADER.md](../README4LOADER.md).
3. Choose Basement, First Floor, or Second Floor.
4. Use **Add Room** or select an existing room from the catalog or viewport.
5. Edit the room name, room type, shape, width, and depth in the Properties panel.
6. Drag a room to reposition it. Room movement and sizing snap to the one-inch grid.
7. For a polygon room, drag its vertex anchors or use **Add Vertex** and **Remove Vertex**.
8. Add, remove, or edit walls, doors, and windows from the selected room's properties.
9. Select **Save** to persist the design.

Wall thickness is rendered to physical scale. Architectural dimension lines show each wall's measured length and thickness.

## 6. Edit an Interior Design

1. Select **Interior Design** in the viewport tabs.
2. Select a room design from the **Interior Design** catalog section.
3. Add a fixture or furniture component from the component controls.
4. Select a component in the viewport or Properties panel.
5. Edit its label, width, depth, and direction.
6. Drag the component to position it. Components snap to the one-inch grid and remain inside the room boundary.
7. Remove unwanted components with the component's remove action.
8. Select **Save**.

Bathroom components include vanities, showers, bathtubs, and toilets. Bedroom and general-room libraries include beds, nightstands, dressers, wardrobes, chairs, sofas, tables, storage, and related furniture.

## 7. Landscape, Patio, and Parcel Editing

- Use **Parcel** to inspect boundary geometry, edges, vertices, measurements, contours, and the house footprint.
- Use **Garden** to review or place landscape features.
- Use **Patio** to review patio features.
- Select an object to expose its editable properties and available actions.
- Use **Remove Feature** only after confirming that the intended feature is selected.

## 8. Save and Export

- **Save** writes the house footprint, rooms, walls, openings, interior component layouts, and landscape features to the selected Neo4j database.
- **Download report** saves the generated site assessment as `site_report.md`.
- The original parcel GeoJSON remains a separate source file. Keep it under `data/input/` or another backed-up location.

## 9. Troubleshooting

### The parcel file will not load

- Confirm that the file is valid JSON.
- Confirm that its top-level type is `FeatureCollection`, `Feature`, `Polygon`, or `MultiPolygon`.
- Confirm that the feature contains polygon geometry rather than attributes only.
- Re-export with output spatial reference `4326` when coordinates are not longitude and latitude.
- If the application reports `Unsupported GeoJSON top-level type`, convert the source data to GeoJSON instead of uploading a vendor-specific JSON response.

### Save is disabled

Load the parcel through **Load from Neo4j**. A parcel uploaded through **Parcel GeoJSON** is intentionally read-only.

### Changes are not visible

- Select the correct floor or Interior Design tab.
- Select the intended room in the catalog.
- Refresh the browser if it retained an older static asset version.
- Confirm that the status bar reports a successful save before reloading.

### Suffolk GIS returns no parcel

- Preserve all leading zeroes in `PARCELID`.
- Keep the parcel ID inside single quotation marks in the query.
- Search the address again in the GIS Viewer in case the parcel identifier changed.

## Related Documentation

- [Project overview and setup](../README.md)
- [Loader and persistence guide](../README4LOADER.md)
- [Site intake checklist](site-intake.md)

