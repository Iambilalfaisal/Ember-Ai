"""Taskiq tasks of the identity module (verbs, e.g. ``ingest_document``)."""

import uuid

import structlog

from ember.core.events import NullEventBus
from ember.core.tasks import JobSession, task
from ember.modules.identity.service import IdentityService

logger = structlog.get_logger(__name__)


@task("identity.log_user_invited")
async def log_user_invited(
    tenant_id: uuid.UUID, user_id: uuid.UUID, session: JobSession
) -> str | None:
    """Example job, started by the ``UserInvited`` event: look the user up and log the outcome.

    Runs with ``tenant_id`` as the current tenant and in one transaction (``session``). Logs
    ids only. Returns the user's status, or ``None`` if the user no longer exists.
    """
    user = await IdentityService.for_session(session, NullEventBus()).get_user(user_id)
    logger.info("identity.user_invited_processed", user_id=str(user_id), found=user is not None)
    return str(user.status) if user else None
