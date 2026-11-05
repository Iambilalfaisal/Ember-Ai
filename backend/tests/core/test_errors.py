import httpx
import pytest
from fastapi import FastAPI

from ember.core.errors import (
    AppError,
    Conflict,
    FieldError,
    Forbidden,
    NotFound,
    UpstreamUnavailable,
    ValidationFailed,
)

PROBLEM_JSON = "application/problem+json"


@pytest.mark.parametrize(
    ("error", "status", "type_", "title"),
    [
        (NotFound, 404, "urn:ember:problem:not-found", "Not Found"),
        (Forbidden, 403, "urn:ember:problem:forbidden", "Forbidden"),
        (Conflict, 409, "urn:ember:problem:conflict", "Conflict"),
        (ValidationFailed, 422, "urn:ember:problem:validation-failed", "Validation Failed"),
        (
            UpstreamUnavailable,
            503,
            "urn:ember:problem:upstream-unavailable",
            "Upstream Unavailable",
        ),
    ],
)
async def test_app_errors_become_problem_json(
    app: FastAPI,
    client: httpx.AsyncClient,
    error: type[AppError],
    status: int,
    type_: str,
    title: str,
) -> None:
    @app.get("/test/raise")
    async def raise_error() -> None:
        raise error("Something specific.")

    response = await client.get("/test/raise")

    assert response.status_code == status
    assert response.headers["content-type"].startswith(PROBLEM_JSON)
    assert response.json() == {
        "type": type_,
        "title": title,
        "status": status,
        "detail": "Something specific.",
        "instance": "/test/raise",
        "request_id": response.headers["x-request-id"],
    }


async def test_detail_is_optional(app: FastAPI, client: httpx.AsyncClient) -> None:
    @app.get("/test/raise")
    async def raise_error() -> None:
        raise NotFound

    body = (await client.get("/test/raise")).json()

    assert "detail" not in body
    assert body["title"] == "Not Found"


async def test_validation_failed_lists_field_errors(
    app: FastAPI, client: httpx.AsyncClient
) -> None:
    field_error = FieldError(loc=["body", "email"], msg="not an email", type="value_error")

    @app.get("/test/raise")
    async def raise_error() -> None:
        raise ValidationFailed("Bad input.", errors=[field_error])

    body = (await client.get("/test/raise")).json()

    assert body["errors"] == [field_error.model_dump()]


async def test_request_validation_problem_does_not_echo_input(
    app: FastAPI, client: httpx.AsyncClient
) -> None:
    @app.get("/test/number")
    async def number(n: int) -> int:
        return n

    response = await client.get("/test/number", params={"n": "not-a-number-hunter2"})

    assert response.status_code == 422
    assert response.headers["content-type"].startswith(PROBLEM_JSON)
    body = response.json()
    assert body["type"] == "urn:ember:problem:validation-failed"
    assert body["errors"][0]["loc"] == ["query", "n"]
    assert "hunter2" not in response.text


async def test_unknown_route_is_problem_json(client: httpx.AsyncClient) -> None:
    response = await client.get("/nope")

    assert response.status_code == 404
    assert response.headers["content-type"].startswith(PROBLEM_JSON)
    assert response.json()["title"] == "Not Found"


async def test_unhandled_exception_is_500_without_leaking_details(
    app: FastAPI, client: httpx.AsyncClient
) -> None:
    @app.get("/test/crash")
    async def crash() -> None:
        raise RuntimeError("internal-detail-do-not-leak")

    response = await client.get("/test/crash")

    assert response.status_code == 500
    assert response.headers["content-type"].startswith(PROBLEM_JSON)
    assert "internal-detail-do-not-leak" not in response.text
    assert response.json()["title"] == "Internal Server Error"
    assert response.json()["request_id"] == response.headers["x-request-id"]
