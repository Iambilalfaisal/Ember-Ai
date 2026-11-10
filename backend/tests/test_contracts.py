"""The generated contracts (``contracts/``): what they are built from, and that they are current.

The TypeScript itself needs Node, so CI checks it with ``scripts/check_openapi_drift.py``. What is
checked here needs no Node: the JSON documents the TypeScript is generated *from* (the OpenAPI
document and the live-protocol schemas) are compared with the committed copies, so a plain
``uv run poe test`` already catches a backend change whose contracts were not regenerated.
"""

import importlib
import json
import typing
from pathlib import Path
from types import ModuleType

import pytest

from ember.modules.calls.live import protocol
from ember.modules.calls.live.protocol import (
    CardDeltaPayload,
    CardEndPayload,
    CardNotConfirmedPayload,
    CardStartPayload,
    ErrorPayload,
    SessionReadyPayload,
    parse_client_message,
    server_message,
)
from tests.modules.calls.live.support import (
    CALL,
    final_frame,
    frame,
    partial_frame,
    start_frame,
)

BACKEND = Path(__file__).resolve().parent.parent
CONTRACTS = BACKEND.parent / "contracts"
SCRIPTS = BACKEND / "scripts"


@pytest.fixture
def export_openapi(monkeypatch: pytest.MonkeyPatch) -> ModuleType:
    monkeypatch.syspath_prepend(str(SCRIPTS))
    return importlib.import_module("export_openapi")


@pytest.fixture
def check_drift(monkeypatch: pytest.MonkeyPatch, export_openapi: ModuleType) -> ModuleType:
    monkeypatch.syspath_prepend(str(SCRIPTS))
    return importlib.import_module("check_openapi_drift")


def refs(schema: dict[str, typing.Any]) -> list[str]:
    return [option["$ref"].removeprefix("#/$defs/") for option in schema["oneOf"]]


# --- the committed contracts are current ----------------------------------------------------


def test_the_committed_openapi_document_matches_the_app(export_openapi: ModuleType) -> None:
    current = export_openapi.render_json(export_openapi.openapi_document())

    committed = (CONTRACTS / "openapi.json").read_text(encoding="utf-8").replace("\r\n", "\n")

    assert committed == current, "run `uv run poe openapi` and commit contracts/"


@pytest.mark.parametrize("direction", ["client", "server"])
def test_the_committed_realtime_schemas_match_the_protocol(
    export_openapi: ModuleType, direction: str
) -> None:
    current = export_openapi.render_json(protocol.json_schemas()[direction])

    committed = (
        (CONTRACTS / "realtime" / f"{direction}.schema.json")
        .read_text(encoding="utf-8")
        .replace("\r\n", "\n")
    )

    assert committed == current, "run `uv run poe openapi` and commit contracts/"


def test_generating_twice_gives_identical_output(export_openapi: ModuleType) -> None:
    first = export_openapi.render_json(export_openapi.openapi_document())
    second = export_openapi.render_json(export_openapi.openapi_document())

    assert first == second
    assert first.endswith("}\n")


# --- the OpenAPI document ----------------------------------------------------------------------


def test_the_openapi_document_describes_the_http_api_and_not_the_live_socket(
    export_openapi: ModuleType,
) -> None:
    document = export_openapi.openapi_document()

    assert {"/api/v1/me", "/api/v1/users", "/health/live", "/health/ready"} <= document[
        "paths"
    ].keys()
    assert not any(path.startswith("/ws") for path in document["paths"])


def test_the_openapi_document_does_not_depend_on_the_developers_environment(
    export_openapi: ModuleType, monkeypatch: pytest.MonkeyPatch
) -> None:
    before = export_openapi.render_json(export_openapi.openapi_document())
    monkeypatch.setenv("EMBER_ENV", "production")
    monkeypatch.setenv("EMBER_DB__URL", "postgresql+asyncpg://elsewhere/db")

    assert export_openapi.render_json(export_openapi.openapi_document()) == before


# --- the live-protocol schemas ---------------------------------------------------------------


def test_the_schemas_list_every_message_type_of_each_direction() -> None:
    schemas = protocol.json_schemas()

    assert refs(schemas["client"]) == [
        member.__name__ for member in typing.get_args(protocol.ClientMessage)
    ]
    assert refs(schemas["server"]) == [
        member.__name__ for member in typing.get_args(protocol.ServerMessage)
    ]
    assert schemas["client"]["discriminator"]["propertyName"] == "type"
    assert schemas["server"]["discriminator"]["propertyName"] == "type"


def test_every_message_requires_the_whole_envelope() -> None:
    for schema in protocol.json_schemas().values():
        for name in refs(schema):
            definition = schema["$defs"][name]
            assert set(definition["required"]) == {"v", "type", "call_id", "seq", "payload"}, name
            assert definition["additionalProperties"] is False, name


def test_generated_field_titles_are_removed_but_message_names_stay() -> None:
    for schema in protocol.json_schemas().values():
        for definition in schema["$defs"].values():
            assert "title" in definition
            for field in definition.get("properties", {}).values():
                assert "title" not in field


def test_the_error_message_is_not_called_error_in_typescript() -> None:
    server = protocol.json_schemas()["server"]

    assert server["$defs"]["Error"]["title"] == "ErrorMessage"


def test_the_schemas_are_the_same_every_time() -> None:
    assert protocol.json_schemas() == protocol.json_schemas()


def test_what_the_server_sends_has_exactly_the_fields_the_schema_requires() -> None:
    schema = protocol.json_schemas()["server"]
    payloads = [
        SessionReadyPayload(resumed=False, last_client_seq=0),
        CardStartPayload(card_id="c1", utterance_id="u1"),
        CardDeltaPayload(card_id="c1", text="hi"),
        CardEndPayload(card_id="c1", status="complete"),
        CardNotConfirmedPayload(utterance_id="u1", reason="unavailable"),
        ErrorPayload(code="unavailable", message="fixed text", fatal=False),
    ]

    for number, payload in enumerate(payloads, start=1):
        sent = server_message(payload, call_id=str(CALL), seq=number).model_dump(mode="json")
        definition = schema["$defs"][_definition_for(sent)]
        assert set(sent) == set(definition["required"])
        payload_definition = schema["$defs"][definition["properties"]["payload"]["$ref"][8:]]
        assert set(sent["payload"]) == set(payload_definition["required"]), sent["type"]


def _definition_for(sent: dict[str, typing.Any]) -> str:
    mapping = protocol.json_schemas()["server"]["discriminator"]["mapping"]
    return mapping[sent["type"]].removeprefix("#/$defs/")


def test_what_the_desktop_must_send_has_exactly_the_fields_the_schema_requires() -> None:
    schema = protocol.json_schemas()["client"]
    mapping = schema["discriminator"]["mapping"]
    frames = [
        start_frame(),
        partial_frame(1, "hello"),
        final_frame(2, "How much?"),
        frame("card.feedback", 3, {"card_id": "c1", "rating": "helpful"}),
        frame("session.end", 4),
    ]

    for text in frames:
        message = parse_client_message(text)
        dumped = message.model_dump(mode="json")
        definition = schema["$defs"][mapping[dumped["type"]].removeprefix("#/$defs/")]
        assert set(dumped) == set(definition["required"]), dumped["type"]
        payload_definition = schema["$defs"][definition["properties"]["payload"]["$ref"][8:]]
        assert set(dumped["payload"]) == set(payload_definition.get("required", [])), dumped["type"]


def test_the_constants_match_the_protocol_module() -> None:
    constants = protocol.constants()

    assert constants["PROTOCOL_VERSION"] == protocol.PROTOCOL_VERSION == 1
    assert constants["ID_PATTERN"] == protocol.ID_PATTERN
    codes = constants["CLOSE_CODES"]
    assert codes["NORMAL"] == protocol.CLOSE_NORMAL
    assert codes["UNAUTHORIZED"] == protocol.CLOSE_UNAUTHORIZED
    assert len(set(codes.values())) == len(codes), "two close codes share a number"
    assert len(codes) == len([name for name in vars(protocol) if name.startswith("CLOSE_")]), (
        "a close code is missing from the contract"
    )


def test_the_constants_become_a_typescript_module(export_openapi: ModuleType) -> None:
    text = export_openapi.render_constants_ts(protocol.constants())

    assert "export const PROTOCOL_VERSION = 1 as const;" in text
    assert "  UNAUTHORIZED: 4401," in text
    assert 'export const ID_PATTERN = "^[A-Za-z0-9._-]{1,64}$";' in text
    assert text.endswith("(typeof CloseCode)[keyof typeof CloseCode];\n")


def test_the_committed_typescript_constants_match(export_openapi: ModuleType) -> None:
    current = export_openapi.render_constants_ts(protocol.constants())

    committed = (
        (CONTRACTS / "ts" / "realtime" / "constants.ts")
        .read_text(encoding="utf-8")
        .replace("\r\n", "\n")
    )

    assert committed == current


# --- the drift check -----------------------------------------------------------------------------


def test_the_drift_check_reports_missing_stale_and_leftover_files(check_drift: ModuleType) -> None:
    committed = {"openapi.json": b"old", "ts/index.ts": b"same", "ts/gone.ts": b"x"}
    fresh = {"openapi.json": b"new", "ts/index.ts": b"same", "realtime/client.schema.json": b"y"}

    assert check_drift.differences(committed, fresh) == [
        "  out of date: openapi.json",
        "  missing: realtime/client.schema.json",
        "  no longer generated: ts/gone.ts",
    ]


def test_identical_files_are_no_drift(check_drift: ModuleType) -> None:
    files = {"openapi.json": b"{}\n", "ts/index.ts": b"export {};\n"}

    assert check_drift.differences(files, dict(files)) == []


def test_windows_line_endings_are_not_drift(check_drift: ModuleType, tmp_path: Path) -> None:
    (tmp_path / "openapi.json").write_bytes(b'{\r\n  "a": 1\r\n}\r\n')
    (tmp_path / "ts").mkdir()
    (tmp_path / "ts" / "index.ts").write_bytes(b"export {};\r\n")
    (tmp_path / "ts" / "notes.txt").write_bytes(b"also generated\n")
    (tmp_path / "package.json").write_bytes(b"{}")  # hand-written: not compared

    files = check_drift.generated_files(tmp_path)

    assert files == {
        "openapi.json": b'{\n  "a": 1\n}\n',
        "ts/index.ts": b"export {};\n",
        "ts/notes.txt": b"also generated\n",
    }


def test_the_contracts_folder_has_what_the_generators_need() -> None:
    package = json.loads((CONTRACTS / "package.json").read_text(encoding="utf-8"))

    assert (CONTRACTS / "package-lock.json").is_file(), "the generator versions must be locked"
    versions = {**package["dependencies"], **package["devDependencies"]}
    assert all(version[0].isdigit() for version in versions.values()), "pin exact versions"
