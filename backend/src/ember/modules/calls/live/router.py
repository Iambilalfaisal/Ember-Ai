"""The live-call WebSocket route: authenticate, accept, hand the connection to a session.

``/ws/v1/calls/{call_id}`` is served by the realtime process only (the API does not mount it).
The desktop sends the same bearer token as for HTTP, in the ``Authorization`` header of the
handshake, so it must connect from code that can set headers (the Electron main process).

The handshake is accepted first and the token checked straight after, so a rejected desktop
learns *why* from the close code instead of a bare HTTP 403: 4401 (token missing or invalid, so
refresh it), 4403 (no Ember account or role), 1011 (sign-in keys unavailable, retry).
"""

import uuid
from contextlib import AsyncExitStack, suppress
from typing import Final

import structlog
from fastapi import APIRouter, WebSocket
from starlette.websockets import WebSocketDisconnect, WebSocketState

from ember.core.errors import AppError, Forbidden, Unauthorized
from ember.core.security import Role, websocket_user
from ember.modules.calls.live.protocol import CLOSE_FORBIDDEN, CLOSE_INTERNAL, CLOSE_UNAUTHORIZED
from ember.modules.calls.live.session import ClientDisconnected, LiveRuntime, LiveSession

router = APIRouter(tags=["calls"])

# Every signed-in role may take calls (a lead or an admin can also be on one).
CALL_ROLES: Final = (Role.REP, Role.TEAM_LEAD, Role.ADMIN)

_REJECTION_CODES: Final[dict[type[AppError], int]] = {
    Unauthorized: CLOSE_UNAUTHORIZED,
    Forbidden: CLOSE_FORBIDDEN,
}


class StarletteConnection:
    """Adapts a Starlette ``WebSocket`` to the session's :class:`Connection`."""

    def __init__(self, websocket: WebSocket) -> None:
        self._websocket = websocket

    async def receive(self) -> str | bytes:
        message = await self._websocket.receive()
        if message["type"] == "websocket.disconnect":
            raise ClientDisconnected
        text: str | None = message.get("text")
        if text is not None:
            return text
        return bytes(message.get("bytes") or b"")

    async def send_text(self, data: str) -> None:
        try:
            await self._websocket.send_text(data)
        except (WebSocketDisconnect, RuntimeError) as exc:
            raise ClientDisconnected from exc

    async def close(self, code: int) -> None:
        if self._websocket.application_state is WebSocketState.CONNECTED:
            try:
                await self._websocket.close(code=code)
            except (WebSocketDisconnect, RuntimeError) as exc:  # the peer left in the meantime
                raise ClientDisconnected from exc


@router.websocket("/ws/v1/calls/{call_id}")
async def call_socket(websocket: WebSocket, call_id: uuid.UUID) -> None:
    """A live call: ``session.start``, transcript in, answer cards out, ``session.end``."""
    runtime: LiveRuntime = websocket.app.state.live_runtime
    await websocket.accept()
    connection = StarletteConnection(websocket)
    structlog.contextvars.bind_contextvars(call_id=str(call_id))
    try:
        async with AsyncExitStack() as stack:
            try:
                user = await stack.enter_async_context(websocket_user(websocket, *CALL_ROLES))
            except AppError as error:
                # A sign-in problem; the log line (auth.token_rejected ...) says why. The desktop
                # only gets the code, never the reason.
                await _reject(connection, _REJECTION_CODES.get(type(error), CLOSE_INTERNAL))
                return
            await LiveSession(
                runtime,
                connection,
                tenant_id=user.tenant_id,
                user_id=user.user_id,
                call_id=call_id,
            ).run()
    finally:
        structlog.contextvars.clear_contextvars()


async def _reject(connection: StarletteConnection, code: int) -> None:
    with suppress(ClientDisconnected):
        await connection.close(code)
