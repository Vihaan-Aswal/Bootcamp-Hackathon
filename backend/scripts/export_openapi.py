"""Write the FastAPI OpenAPI schema for frontend type generation.

Usage (from backend/):  uv run python scripts/export_openapi.py [output.json]
Default output: frontend/openapi.json (ignored by Git, regenerated on demand).

Every domain object in ``CONTRACT_MODELS`` is merged into the components, not
just the models a route happens to return today, so the generated TypeScript
types cover all five modules' handoffs.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

from app.contracts.v1 import CONTRACT_MODELS
from app.main import app

DEFAULT_OUTPUT = Path(__file__).resolve().parents[2] / "frontend" / "openapi.json"
REF_TEMPLATE = "#/components/schemas/{model}"


def _contract_schemas() -> dict[str, Any]:
    merged: dict[str, Any] = {}
    for model in CONTRACT_MODELS:
        schema = model.model_json_schema(ref_template=REF_TEMPLATE)
        for name, definition in schema.pop("$defs", {}).items():
            merged.setdefault(name, definition)
        merged.setdefault(model.__name__, schema)
    return merged


def build_schema() -> dict[str, Any]:
    schema = app.openapi()
    components = schema.setdefault("components", {}).setdefault("schemas", {})
    for name, definition in _contract_schemas().items():
        components.setdefault(name, definition)
    return schema


def main(argv: list[str]) -> int:
    output = Path(argv[1]) if len(argv) > 1 else DEFAULT_OUTPUT
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(build_schema(), indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"Wrote {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
