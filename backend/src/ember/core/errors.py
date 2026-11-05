"""Application errors and RFC 9457 ``application/problem+json`` responses.

Services raise ``AppError`` subclasses, never ``HTTPException``. The handlers
registered by :func:`register_error_handlers` turn them, framework errors and
unexpected exceptions into problem documents. Problem bodies never echo request
input and never include internal exception messages for unexpected errors.
"""

from collections.abc import Mapping, Sequence
from http import HTTPStatus
from typing import Any, cast

import structlog
from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.exceptions import HTTPException as StarletteHTTPException

from ember.core.observability import REQUEST_ID_HEADER

PROBLEM_CONTENT_TYPE = "application/problem+json"

logger = structlog.get_logger(__name__)


class FieldError(BaseModel):
    """One invalid field in a validation problem."""

    loc: list[str | int]
    msg: str
    type: str


class Problem(BaseModel):
    """RFC 9457 problem document, plus ``request_id`` for support lookups."""

    type: str
    title: str
    status: int
    detail: str | None = None
    instance: str | None = None
    request_id: str | None = None
    errors: list[FieldError] | None = None


class AppError(Exception):
    """Base class for errors that map to an HTTP problem response."""

    status_code = 500
    type = "urn:ember:problem:internal"
    title = "Internal Server Error"

    def __init__(
        self,
        detail: str | None = None,
        *,
        extensions: Mapping[str, Any] | None = None,
    ) -> None:
        super().__init__(detail or self.title)
        self.detail = detail
        self.extensions: dict[str, Any] = dict(extensions or {})


class NotFound(AppError):
    status_code = 404
    type = "urn:ember:problem:not-found"
    title = "Not Found"


class Forbidden(AppError):
    status_code = 403
    type = "urn:ember:problem:forbidden"
    title = "Forbidden"


class Conflict(AppError):
    status_code = 409
    type = "urn:ember:problem:conflict"
    title = "Conflict"


class ValidationFailed(AppError):
    status_code = 422
    type = "urn:ember:problem:validation-failed"
    title = "Validation Failed"

    def __init__(self, detail: str | None = None, *, errors: Sequence[FieldError] = ()) -> None:
        extensions = {"errors": [e.model_dump() for e in errors]} if errors else None
        super().__init__(detail, extensions=extensions)


class UpstreamUnavailable(AppError):
    status_code = 503
    type = "urn:ember:problem:upstream-unavailable"
    title = "Upstream Unavailable"


def problem_response(
    request: Request,
    *,
    status: int,
    type_: str,
    title: str,
    detail: str | None = None,
    extensions: Mapping[str, Any] | None = None,
    headers: Mapping[str, str] | None = None,
) -> JSONResponse:
    body: dict[str, Any] = {
        "type": type_,
        "title": title,
        "status": status,
        "instance": request.url.path,
    }
    if detail is not None:
        body["detail"] = detail
    response_headers = dict(headers or {})
    request_id = getattr(request.state, "request_id", None)
    if request_id is not None:
        body["request_id"] = request_id
        # Unexpected errors are answered by Starlette's outermost middleware, so the
        # request-id middleware never sees that response; set the header here too.
        response_headers[REQUEST_ID_HEADER] = request_id
    body.update(extensions or {})
    return JSONResponse(
        jsonable_encoder(body),
        status_code=status,
        media_type=PROBLEM_CONTENT_TYPE,
        headers=response_headers,
    )


async def _handle_app_error(request: Request, exc: Exception) -> JSONResponse:
    exc = cast(AppError, exc)
    return problem_response(
        request,
        status=exc.status_code,
        type_=exc.type,
        title=exc.title,
        detail=exc.detail,
        extensions=exc.extensions,
    )


async def _handle_request_validation(request: Request, exc: Exception) -> JSONResponse:
    exc = cast(RequestValidationError, exc)
    # Deliberately drop ``input`` and ``ctx``: they can contain user data.
    errors = [
        FieldError(loc=list(e["loc"]), msg=e["msg"], type=e["type"]).model_dump()
        for e in exc.errors()
    ]
    return problem_response(
        request,
        status=ValidationFailed.status_code,
        type_=ValidationFailed.type,
        title=ValidationFailed.title,
        detail="The request is not valid.",
        extensions={"errors": errors},
    )


async def _handle_http_exception(request: Request, exc: Exception) -> JSONResponse:
    exc = cast(StarletteHTTPException, exc)
    # Framework-raised errors (unknown route, wrong method, ...).
    return problem_response(
        request,
        status=exc.status_code,
        type_="about:blank",
        title=_status_title(exc.status_code),
        headers=exc.headers,
    )


async def _handle_unexpected(request: Request, exc: Exception) -> JSONResponse:
    # The request-id middleware has already cleared its log context, so pass the id explicitly.
    logger.error(
        "request.unhandled_exception",
        request_id=getattr(request.state, "request_id", None),
        exc_info=exc,
    )
    return problem_response(
        request,
        status=500,
        type_=AppError.type,
        title=AppError.title,
    )


def _status_title(status_code: int) -> str:
    try:
        return HTTPStatus(status_code).phrase
    except ValueError:
        return "Error"


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(AppError, _handle_app_error)
    app.add_exception_handler(RequestValidationError, _handle_request_validation)
    app.add_exception_handler(StarletteHTTPException, _handle_http_exception)
    app.add_exception_handler(Exception, _handle_unexpected)
