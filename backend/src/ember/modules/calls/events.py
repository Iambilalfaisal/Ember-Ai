"""Events the calls module publishes and the handlers it registers.

Name events in the past tense, subclass ``Event`` and carry ids only. Other modules
subscribe through ``public.py``.
"""

from ember.core.events import EventBus


def register_handlers(bus: EventBus) -> None:
    """Subscribe this module's handlers. Called once at startup by every entrypoint."""
