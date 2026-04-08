from __future__ import annotations

import argparse
from pathlib import Path

import uvicorn
from fastapi import FastAPI, Body, File, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from house_landscape_planner.analysis.site_report import create_site_assessment
from house_landscape_planner.loaders.neo4j_parcel_loader import (
    DEFAULT_WEB_DATABASE,
    create_site_assessment_from_neo4j,
    list_parcels_from_neo4j,
    remove_feature_from_neo4j,
    save_feature_layout_to_neo4j,
)
from house_landscape_planner.webapp.api import (
    LandscapeFeatureUpdateRequest,
    SiteAssessmentResponse,
    create_assessment_from_uploads,
    deserialize_landscape_features,
    serialize_assessment,
)


BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
SAMPLE_PARCEL = Path(__file__).resolve().parents[3] / "tests" / "data" / "sample_parcel.geojson"

app = FastAPI(
    title="House Plan Toolset",
    description="Web UI for parcel-based hillside landscape planning.",
    version="0.2.0",
)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
templates = Jinja2Templates(directory=str(STATIC_DIR))


@app.get("/")
async def root(request: Request):
    return templates.TemplateResponse(
        "index.html",
        {
            "request": request,
            "default_database": DEFAULT_WEB_DATABASE,
            "sample_parcel_name": SAMPLE_PARCEL.name,
        },
    )


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "healthy", "app": "House Plan Toolset"}


@app.get("/api/sample", response_model=SiteAssessmentResponse)
async def sample_analysis() -> SiteAssessmentResponse:
    assessment = create_site_assessment(SAMPLE_PARCEL)
    return serialize_assessment(assessment, parcel_name=SAMPLE_PARCEL.name)


@app.get("/api/neo4j/parcels")
async def list_neo4j_parcels(database: str = DEFAULT_WEB_DATABASE) -> list[dict[str, object]]:
    try:
        parcels = list_parcels_from_neo4j(database=database)
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"Failed to read Neo4j parcel catalog: {exc}") from exc
    return [
        {
            "parcel_id": item.parcel_id,
            "label": item.label,
            "vertex_count": item.vertex_count,
            "uri": item.uri,
        }
        for item in parcels
    ]


@app.get("/api/neo4j/parcels/{parcel_id}", response_model=SiteAssessmentResponse)
async def neo4j_parcel_analysis(parcel_id: str, database: str = DEFAULT_WEB_DATABASE) -> SiteAssessmentResponse:
    try:
        assessment = create_site_assessment_from_neo4j(parcel_id, database=database)
        return serialize_assessment(assessment, parcel_name=parcel_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"Failed to read parcel from Neo4j: {exc}") from exc


@app.post("/api/neo4j/parcels/{parcel_id}/features", response_model=SiteAssessmentResponse)
async def save_neo4j_parcel_features(
    parcel_id: str,
    features: list[LandscapeFeatureUpdateRequest] = Body(...),
    database: str = DEFAULT_WEB_DATABASE,
) -> SiteAssessmentResponse:
    try:
        save_feature_layout_to_neo4j(parcel_id, database=database, features=deserialize_landscape_features(features))
        assessment = create_site_assessment_from_neo4j(parcel_id, database=database)
        return serialize_assessment(assessment, parcel_name=parcel_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"Failed to save parcel features to Neo4j: {exc}") from exc


@app.delete("/api/neo4j/parcels/{parcel_id}/features/{feature_id}", response_model=SiteAssessmentResponse)
async def remove_neo4j_parcel_feature(
    parcel_id: str,
    feature_id: str,
    database: str = DEFAULT_WEB_DATABASE,
) -> SiteAssessmentResponse:
    try:
        remove_feature_from_neo4j(parcel_id, feature_id, database=database)
        assessment = create_site_assessment_from_neo4j(parcel_id, database=database)
        return serialize_assessment(assessment, parcel_name=parcel_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"Failed to remove parcel feature from Neo4j: {exc}") from exc


@app.post("/api/analyze", response_model=SiteAssessmentResponse)
async def analyze_site(
    parcel: UploadFile = File(...),
    image: UploadFile | None = File(default=None),
) -> SiteAssessmentResponse:
    if not parcel.filename:
        raise HTTPException(status_code=400, detail="Parcel GeoJSON file is required.")

    try:
        return await create_assessment_from_uploads(parcel, image)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"Unexpected analysis error: {exc}") from exc


@app.exception_handler(HTTPException)
async def http_exception_handler(_: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


def run_server(host: str, port: int) -> None:
    uvicorn.run(app, host=host, port=port)


def cli_main() -> None:
    parser = argparse.ArgumentParser(description="Start the House Plan Toolset web UI.")
    parser.add_argument("--host", default="127.0.0.1", help="Host to bind to.")
    parser.add_argument("--port", type=int, default=8181, help="Port to bind to.")
    args = parser.parse_args()

    run_server(args.host, args.port)


if __name__ == "__main__":
    cli_main()
