"""HTTP routes of the calls module: parse input, call the service, return a schema.

Routes are mounted under ``/api/v1``, so declare full paths such as
``/documents/{id}`` and the role each route requires (``require_role``).
"""

from fastapi import APIRouter

router = APIRouter(tags=["calls"])
