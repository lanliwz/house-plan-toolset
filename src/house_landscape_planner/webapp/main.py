from __future__ import annotations

import argparse
from pathlib import Path

import uvicorn
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from house_landscape_planner.analysis.site_report import create_site_assessment
from house_landscape_planner.webapp.api import (
    SiteAssessmentResponse,
    create_assessment_from_uploads,
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
