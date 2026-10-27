"""FastAPI entrypoint. The OpenAPI schema here is the source of the frontend types."""

from __future__ import annotations

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import (
    companies,
    health,
    jds,
    profiles,
    reference,
    resumes,
    skill_matches,
    talent_check,
)
from app.config import settings
from app.contracts.v1 import CONTRACT_VERSION

app = FastAPI(
    title="RADIX Talent Match API",
    version=CONTRACT_VERSION,
    description=(
        "Candidate-facing API for JD Analytics, Resume Parsing, Profile Builder, "
        "Talent Check and Skill Matching. Contract v1 is defined in app/contracts/v1.py."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)

api = APIRouter(prefix="/api/v1")
api.include_router(health.router)
api.include_router(reference.router)
api.include_router(companies.router)
api.include_router(profiles.router)
api.include_router(jds.router)
api.include_router(resumes.router)
api.include_router(talent_check.router)
api.include_router(skill_matches.router)
app.include_router(api)


@app.get("/", include_in_schema=False)
def read_root() -> dict[str, str]:
    return {"name": "RADIX Talent Match API", "version": CONTRACT_VERSION, "docs": "/docs"}
