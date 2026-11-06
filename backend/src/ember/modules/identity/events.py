"""Events the identity module publishes and the handlers it registers."""

import uuid

from ember.core.events import Event, EventBus


class UserInvited(Event):
    """An admin invited a user. Carries ids only, never the email."""

    user_id: uuid.UUID


async def _on_user_invited(event: UserInvited) -> None:
    # Handlers stay quick: hand the real work to a background task. Imported here because the
    # task uses the service, and the service imports this module.
    from ember.modules.identity.tasks import log_user_invited

    await log_user_invited.enqueue(tenant_id=event.tenant_id, user_id=event.user_id)


def register_handlers(bus: EventBus) -> None:
    """Subscribe this module's handlers. Called once at startup by every entrypoint."""
    bus.subscribe(UserInvited, _on_user_invited)
