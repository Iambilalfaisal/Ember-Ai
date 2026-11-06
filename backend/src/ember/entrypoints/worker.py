"""Background worker entrypoint. Wiring only: no business logic lives here.

Run the worker with ``uv run poe worker`` and the scheduler of periodic jobs with
``uv run poe scheduler``. Taskiq calls the factories below, so nothing reads settings at import.
"""

from taskiq import AsyncBroker, TaskiqScheduler

from ember.core.config import Settings, get_settings
from ember.core.events import InProcessEventBus
from ember.core.observability import configure_logging, setup_telemetry
from ember.core.tasks import attach_job_resources, build_broker, build_scheduler, registry
from ember.entrypoints.wiring import import_module_tasks, register_module_event_handlers


def create_broker(settings: Settings | None = None) -> AsyncBroker:
    """The broker with every module's tasks registered and event handlers subscribed."""
    settings = settings or get_settings()
    configure_logging(settings)
    setup_telemetry(settings)
    broker = build_broker(settings)
    events = InProcessEventBus()
    register_module_event_handlers(events)
    attach_job_resources(broker, settings, events)
    import_module_tasks()
    registry.bind(broker)
    return broker


def create_scheduler(settings: Settings | None = None) -> TaskiqScheduler:
    """The scheduler that enqueues every task declared with ``cron``."""
    return build_scheduler(create_broker(settings))
